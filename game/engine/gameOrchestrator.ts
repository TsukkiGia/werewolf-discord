import {
  getGame,
  getPlayersForGame,
  getNightActionsForNight,
  markPlayerDead,
  setPlayerRoleAndAlignment,
  advancePhase,
  endGame,
  getVotesForDay,
  getPendingHunterShot,
  resolveHunterShotRecord,
  incrementWolfExtraKillsForNextNight,
  clearWolfExtraKillsForNextNight,
  getLovers,
} from '../../db.js';
import type { NightActionRow } from '../../db/nightActions.js';
import type { GamePlayerState } from '../../db/players.js';
import { WOLF_PACK_ROLES, type RoleName } from '../types.js';
import {
  processSeerActions,
  processDoctorActions,
  processHarlotActions,
  processChemistActions,
  processArsonistActions,
  processThiefActions,
  buildAwayPlayerIds,
} from './nightActionProcessors.js';
import { postChannelMessage, openDmChannel } from '../../utils.js';
import { chooseKillVictim, evaluateNightResolution } from './nightResolution.js';
import { evaluateDayResolution, chooseLynchVictim } from './dayResolution.js';
import { evaluateWinCondition, buildWinLines } from './winConditions.js';
import type { WinResult } from './winConditions.js';
import {
  buildDayStartLine,
  buildNightFallsLine,
  buildNoLynchLine,
} from './status.js';
import { dmNightActionsForAlivePlayers, disableDayVotePrompts } from './dmRoles.js';
import { triggerHunterShot } from './hunterShot.js';
import { scheduleDayVoting } from '../../jobs/dayVoting.js';
import { scheduleNightTimeout } from '../../jobs/nightTimeout.js';
import { scheduleDayTimeout } from '../../jobs/dayTimeout.js';
import {
  dawnIntroLine,
  dawnNoVictimLine,
  doctorSavedRumorLine,
  finalRolesLines,
  hunterPassLine,
  hunterResolveLine,
  hunterShotLine,
  lynchResultLine,
  nightVictimLine,
  wolfTargetNotHomeLine,
  wolfMissedYouAwayLine,
  wolfBlockedByDoctorLine,
  doctorSavedTargetLine,
  doctorProtectingWolfDeathLine,
  harlotVisitWolfDeathLine,
  harlotVisitWolfVictimDeathLine,
  chemistSelfDeathLine,
  chemistTargetDeathLine,
  arsonistFireHomeDeathLine,
  arsonistFireAwayDeathLine,
  arsonistIgniteLine,
  deathSummary,
  wolfKillDmLine,
  alphaWolfTurnedYouLine,
  alphaWolfTurnedPackLine,
  alphaWolfBiteChannelLine,
  loversWinAloneLine,
  loversAlsoWinLine,
  loverSorrowDeathLine,
  wolfCubDeathPackLine,
  thiefStoleLine,
} from '../strings/narration.js';

type NightDeathCause =
  | 'wolf_kill'
  | 'doctor_protecting_wolf'
  | 'harlot_visiting_wolf'
  | 'harlot_visiting_wolf_victim'
  | 'chemist_self'
  | 'chemist_target'
  | 'arsonist_fire_home'
  | 'arsonist_fire_away'
  | 'lover_sorrow';

interface NightDeathInfo {
  playerId: string;
  cause: NightDeathCause;
  relatedPlayerId?: string;
}

interface NightActionResolutionOutcome {
  updatedPlayers: GamePlayerState[];
  killedIds: string[];
  nightDeaths: NightDeathInfo[];
  doctorSavedSomeone: boolean;
  biteConvertedId: string | null;
}

/** DM all alive players their night-action prompts and schedule the night timeout. */
async function dmNightAndSchedule(gameId: string): Promise<void> {
  const game = await getGame(gameId);
  if (!game || game.status !== 'night') return;
  // Before sending night prompts, check if a Traitor should wake up as a wolf.
  await maybeConvertTraitorToWerewolf(gameId);
  const players = await getPlayersForGame(gameId);
  await dmNightActionsForAlivePlayers({ game, players });
  await scheduleNightTimeout(gameId, game.current_night);
}

async function applyLoverSorrowDeaths(
  gameId: string,
  players: GamePlayerState[],
): Promise<{ sorrowVictimId: string | null; partnerId: string | null }> {
  const lovers = await getLovers(gameId);
  if (!lovers) {
    return { sorrowVictimId: null, partnerId: null };
  }

  const { loverAId, loverBId } = lovers;
  const loverA = players.find((p) => p.user_id === loverAId);
  const loverB = players.find((p) => p.user_id === loverBId);
  if (!loverA || !loverB) {
    return { sorrowVictimId: null, partnerId: null };
  }

  const aAlive = loverA.is_alive;
  const bAlive = loverB.is_alive;

  if (aAlive === bAlive) {
    // Both alive or both dead — no sorrow death to apply.
    return { sorrowVictimId: null, partnerId: null };
  }

  const survivor = aAlive ? loverA : loverB;
  const partner = aAlive ? loverB : loverA;

  await markPlayerDead(gameId, survivor.user_id);
  survivor.is_alive = false;

  return { sorrowVictimId: survivor.user_id, partnerId: partner.user_id };
}

async function buildWinLinesWithLovers(
  gameId: string,
  players: GamePlayerState[],
  win: WinResult,
): Promise<string[]> {
  const baseLines = buildWinLines(win);
  const lovers = await getLovers(gameId);
  if (!lovers) {
    return baseLines;
  }

  const { loverAId, loverBId } = lovers;
  const loverA = players.find((p) => p.user_id === loverAId);
  const loverB = players.find((p) => p.user_id === loverBId);
  if (!loverA || !loverB) {
    return baseLines;
  }

  const alive = players.filter((p) => p.is_alive);
  const aliveLovers = [loverA, loverB].filter((p) => p.is_alive);

  if (aliveLovers.length !== 2) {
    return baseLines;
  }

  // Case 1: Lovers are the last two alive — they win together regardless of team.
  if (alive.length === 2) {
    return [...baseLines, loversWinAloneLine(loverAId, loverBId)];
  }

  // Case 2: Both Lovers alive and at least one is on the winning side.
  let loverOnWinningSide = false;
  if (win.winner === 'wolves') {
    loverOnWinningSide = aliveLovers.some((p) => p.alignment === 'wolf');
  } else if (win.winner === 'town') {
    loverOnWinningSide = aliveLovers.some((p) => p.alignment === 'town');
  } else if (win.winner === 'arsonist') {
    loverOnWinningSide = aliveLovers.some((p) => p.role === 'arsonist');
  }

  if (loverOnWinningSide) {
    return [...baseLines, loversAlsoWinLine(loverAId, loverBId)];
  }

  return baseLines;
}

function isTannerLynchWin(
  lynched: GamePlayerState,
  players: GamePlayerState[],
): boolean {
  if (lynched.role !== 'tanner') return false;
  // Tanner wins only if they are the lynch target and there are no other
  // tanners alive (role is unique, so this is mostly a sanity check).
  return !players.some(
    (p) => p.user_id !== lynched.user_id && p.role === 'tanner' && p.is_alive,
  );
}

async function maybeConvertTraitorToWerewolf(gameId: string): Promise<void> {
  const players = await getPlayersForGame(gameId);
  const alive = players.filter((p) => p.is_alive);
  const wolvesAlive = alive.filter((p) => p.alignment === 'wolf').length;
  if (wolvesAlive > 0) return;

  const traitor = alive.find((p) => p.role === 'traitor');
  if (!traitor) return;

  await setPlayerRoleAndAlignment(gameId, traitor.user_id, 'werewolf', 'wolf');
}

/** Atomically advance day → night, then DM night prompts and schedule the timeout. */
export async function advanceToNightAndDmNightActions(gameId: string): Promise<void> {
  const claimed = await advancePhase(gameId, 'day'); // atomic day -> night
  if (!claimed) return;
  await dmNightAndSchedule(gameId);
}

/**
 * Called when a night action is submitted or the night timeout fires.
 * Checks if all required night actions are in, then resolves the night:
 *   1. Seer inspections → DM results
 *   2. Wolf kill vs. doctor protection → apply kills, DM doctors
 *   3. Dawn announcement → hunter reactive shot or day start
 */
export async function maybeResolveNight(gameId: string): Promise<void> {
  try {
    const game = await getGame(gameId);
    if (!game || game.status !== 'night') {
      return;
    }

    const nightNumber = game.current_night || 1;
    const hasWolfExtraKill = (game.wolf_extra_kills_next_night ?? 0) > 0;
    const wolfExtraKills = hasWolfExtraKill ? 1 : 0;

    // --- 1. Check if all night actions are in ---
    const players = await getPlayersForGame(gameId);
    const actions = await getNightActionsForNight(gameId, nightNumber);

    const nightResolution = evaluateNightResolution(players, actions, nightNumber);
    if (nightResolution.state === 'pending') {
      return;
    }

    // Atomically claim resolution: advance night -> day.
    // If another concurrent call already claimed it, bail out.
    const upcomingDay = (game.current_day || 0) + 1;
    const claimed = await advancePhase(gameId, 'night');
    if (!claimed) return;

    const { killTargets, protectTargets, visitActions } = nightResolution;

    // --- 2. Seer inspections (DM only, no kills yet) ---
    await processSeerActions(players, actions);

    // --- 2b. Thief role swap (night 1 only) ---
    const { thiefActed } = await processThiefActions(gameId, players, actions);

    // --- 3–7. Apply all killing night actions and refresh player state ---
    const {
      updatedPlayers,
      killedIds,
      nightDeaths,
      doctorSavedSomeone,
      biteConvertedId,
    } = await resolveNightActionsAndCollectDeaths({
      gameId,
      nightNumber,
      players,
      actions,
      killTargets,
      protectTargets,
      visitActions,
      wolfExtraKills,
    });

    // Apply Lover sorrow deaths after all primary night kills have resolved.
    const { sorrowVictimId, partnerId } = await applyLoverSorrowDeaths(
      gameId,
      updatedPlayers,
    );
    if (sorrowVictimId) {
      killedIds.push(sorrowVictimId);
      const sorrowDeath: NightDeathInfo =
        partnerId != null
          ? {
              playerId: sorrowVictimId,
              cause: 'lover_sorrow',
              relatedPlayerId: partnerId,
            }
          : {
              playerId: sorrowVictimId,
              cause: 'lover_sorrow',
            };
      nightDeaths.push(sorrowDeath);
    }

    // If the Wolf Cub died tonight, DM surviving pack members.
    const wolfCubDeath = nightDeaths.find((d) => {
      const victim = updatedPlayers.find((p) => p.user_id === d.playerId);
      return victim?.role === 'wolf_cub';
    });
    if (wolfCubDeath) {
      const cubId = wolfCubDeath.playerId;
      const packMates = updatedPlayers.filter(
        (p) =>
          p.is_alive &&
          WOLF_PACK_ROLES.has(p.role as RoleName) &&
          p.user_id !== cubId,
      );
      await Promise.all(
        packMates.map(async (wolf) => {
          try {
            const dmChannelId = await openDmChannel(wolf.user_id);
            await postChannelMessage(dmChannelId, {
              content: wolfCubDeathPackLine(cubId),
            });
          } catch (err) {
            console.error('Failed to DM wolf pack about Wolf Cub death', gameId, wolf.user_id, err);
          }
        }),
      );
      await incrementWolfExtraKillsForNextNight(gameId);
    }

    if (hasWolfExtraKill) {
      await clearWolfExtraKillsForNextNight(gameId);
    }

    // --- 8. Hunter reactive shot (if the hunter was killed tonight) ---
    const killedHunter = killedIds.length > 0
      ? updatedPlayers.find((p) => killedIds.includes(p.user_id) && p.role === 'hunter')
      : null;

    if (killedHunter) {
      const alivePlayers = updatedPlayers.filter((p) => p.is_alive);
      if (game.channel_id) {
        const lines: string[] = buildNightSummaryLines(
          nightDeaths,
          updatedPlayers,
          doctorSavedSomeone,
        );
        if (biteConvertedId) lines.push(alphaWolfBiteChannelLine());
        lines.push(hunterResolveLine());
        try {
          await postChannelMessage(game.channel_id, { content: lines.join('\n') });
        } catch (err) {
          console.error('Failed to send dawn message', err);
        }
      }
      await triggerHunterShot({ game, hunterId: killedHunter.user_id, continuation: `day:${upcomingDay}`, alivePlayers });
      return;
    }

    // --- 9. Dawn announcement ---
    const win = evaluateWinCondition(updatedPlayers);

    if (game.channel_id) {
      const lines: string[] = buildNightSummaryLines(
        nightDeaths,
        updatedPlayers,
        doctorSavedSomeone,
      );
      if (biteConvertedId) lines.push(alphaWolfBiteChannelLine());
      if (thiefActed) lines.push(thiefStoleLine());

      if (win) {
        const winLines = await buildWinLinesWithLovers(gameId, updatedPlayers, win);
        lines.push(...winLines);
        lines.push(...finalRolesLines(updatedPlayers));
      } else {
        lines.push(buildDayStartLine(upcomingDay));
      }

      try {
        await postChannelMessage(game.channel_id, { content: lines.join('\n') });
      } catch (err) {
        console.error('Failed to send day summary message', err);
      }
    }

    if (win) {
      await endGame(gameId);
      return;
    }

    // --- 10. Schedule day voting and timeout ---
    scheduleDayVoting(gameId, upcomingDay);
    scheduleDayTimeout(gameId, upcomingDay);
  } catch (err) {
    console.error('Error resolving night phase', err);
  }
}

function buildNightDeathLines(nightDeaths: NightDeathInfo[], players: GamePlayerState[]): string[] {
  const lines: string[] = [];

  const playersById = new Map<string, GamePlayerState>();
  for (const p of players) {
    playersById.set(p.user_id, p);
  }

  for (const death of nightDeaths) {
    switch (death.cause) {
      case 'wolf_kill': {
        const victim = playersById.get(death.playerId);
        if (victim) {
          lines.push(nightVictimLine(victim));
        }
        break;
      }
      case 'doctor_protecting_wolf': {
        const victim = playersById.get(death.playerId);
        if (victim) {
          lines.push(
            doctorProtectingWolfDeathLine(victim.user_id) +
              ` They were ${deathSummary(victim.alignment, victim.role)}.`,
          );
        }
        break;
      }
      case 'harlot_visiting_wolf': {
        const victim = playersById.get(death.playerId);
        if (victim) {
          lines.push(
            harlotVisitWolfDeathLine(victim.user_id) +
              ` They were ${deathSummary(victim.alignment, victim.role)}.`,
          );
        }
        break;
      }
      case 'harlot_visiting_wolf_victim': {
        const victim = playersById.get(death.playerId);
        if (victim) {
          lines.push(
            harlotVisitWolfVictimDeathLine(victim.user_id) +
              ` They were ${deathSummary(victim.alignment, victim.role)}.`,
          );
        }
        break;
      }
      case 'chemist_self': {
        const victim = playersById.get(death.playerId);
        if (victim) {
          lines.push(
            chemistSelfDeathLine(victim.user_id) +
              ` They were ${deathSummary(victim.alignment, victim.role)}.`,
          );
        }
        break;
      }
      case 'chemist_target': {
        const victim = playersById.get(death.playerId);
        if (victim) {
          lines.push(
            chemistTargetDeathLine(victim.user_id) +
              ` They were ${deathSummary(victim.alignment, victim.role)}.`,
          );
        }
        break;
      }
      case 'arsonist_fire_home': {
        const victim = playersById.get(death.playerId);
        if (victim) {
          lines.push(
            arsonistFireHomeDeathLine(victim.user_id) +
              ` They were ${deathSummary(victim.alignment, victim.role)}.`,
          );
        }
        break;
      }
      case 'arsonist_fire_away': {
        const victim = playersById.get(death.playerId);
        if (victim) {
          lines.push(
            arsonistFireAwayDeathLine(victim.user_id) +
              ` They were ${deathSummary(victim.alignment, victim.role)}.`,
          );
        }
        break;
      }
      case 'lover_sorrow': {
        const victim = playersById.get(death.playerId);
        if (victim) {
          lines.push(
            loverSorrowDeathLine(victim.user_id, death.relatedPlayerId) +
              ` They were ${deathSummary(victim.alignment, victim.role)}.`,
          );
        }
        break;
      }
    }
  }

  return lines;
}

function buildNightSummaryLines(
  nightDeaths: NightDeathInfo[],
  players: GamePlayerState[],
  doctorSavedSomeone: boolean,
): string[] {
  const lines: string[] = [];

  if (nightDeaths.length === 0) {
    // Quiet night — no deaths
    lines.push(dawnNoVictimLine());
    if (doctorSavedSomeone) {
      lines.push(doctorSavedRumorLine());
    }
  } else {
    lines.push(dawnIntroLine());
    if (
      nightDeaths.some(
        (d) => d.cause === 'arsonist_fire_home' || d.cause === 'arsonist_fire_away',
      )
    ) {
      lines.push(arsonistIgniteLine());
    }
    lines.push(...buildNightDeathLines(nightDeaths, players));
  }

  return lines;
}

async function resolveNightActionsAndCollectDeaths(params: {
  gameId: string;
  nightNumber: number;
  players: GamePlayerState[];
  actions: NightActionRow[];
  killTargets: string[];
  protectTargets: string[];
  visitActions: { harlotId: string; targetId: string }[];
  wolfExtraKills: number;
}): Promise<NightActionResolutionOutcome> {
  const {
    gameId,
    nightNumber,
    players,
    actions,
    killTargets,
    protectTargets,
    visitActions,
    wolfExtraKills,
  } =
    params;

  const harlotIds = new Set(
    players.filter((p) => p.role === 'harlot').map((p) => p.user_id),
  );

  // --- Wolf kill ---
  // "Not home" mechanic: any player with a night action that targets another
  // player (visit, kill, protect, potion) is away for the night.
  // If a chosen victim is away, that kill is wasted.
  const maxWolfVictims = 1 + wolfExtraKills;
  const wolfChosenVictims: string[] = [];
  let remainingKillTargets = killTargets.slice();
  while (wolfChosenVictims.length < maxWolfVictims) {
    const v = chooseKillVictim(remainingKillTargets);
    if (!v) break;
    wolfChosenVictims.push(v);
    remainingKillTargets = remainingKillTargets.filter((id) => id !== v);
  }
  const victimId = wolfChosenVictims[0] ?? null;

  const protectedSet = new Set(protectTargets);
  const awayPlayerIds = buildAwayPlayerIds(actions);

  const killedIds: string[] = [];
  const nightDeaths: NightDeathInfo[] = [];
  let biteConvertedId: string | null = null;

  const alphaWolfAlive = players.some((p) => p.role === 'alpha_wolf' && p.is_alive);
  const playersById = new Map(players.map((p) => [p.user_id, p]));

  for (const targetId of wolfChosenVictims) {
    if (awayPlayerIds.has(targetId)) {
      // Notify wolves that their target wasn't home.
      const killActors = actions.filter(
        (a) => a.action_kind === 'kill' && a.target_id === targetId,
      );
      await Promise.all(
        killActors.map(async (a) => {
          try {
            const dmChannelId = await openDmChannel(a.actor_id);
            await postChannelMessage(dmChannelId, {
              content: wolfTargetNotHomeLine(targetId),
            });
          } catch (err) {
            console.error('Failed to DM wolf not-home result', err);
          }
        }),
      );

      // Let the intended victim know the wolves came while they were out.
      try {
        const dmChannelId = await openDmChannel(targetId);
        await postChannelMessage(dmChannelId, { content: wolfMissedYouAwayLine() });
      } catch (err) {
        console.error('Failed to DM away-target wolf miss result', err);
      }
      continue;
    }

    if (protectedSet.has(targetId)) {
      // Wolves chose a victim who was at home, but the doctor blocked the kill.
      const killActors = actions.filter(
        (a) => a.action_kind === 'kill' && a.target_id === targetId,
      );
      await Promise.all(
        killActors.map(async (a) => {
          try {
            const dmChannelId = await openDmChannel(a.actor_id);
            await postChannelMessage(dmChannelId, {
              content: wolfBlockedByDoctorLine(targetId),
            });
          } catch (err) {
            console.error('Failed to DM wolf doctor-block result', err);
          }
        }),
      );

      // Let the saved victim know they were attacked but survived thanks to the doctor.
      try {
        const dmChannelId = await openDmChannel(targetId);
        await postChannelMessage(dmChannelId, {
          content: doctorSavedTargetLine(),
        });
      } catch (err) {
        console.error('Failed to DM doctor-saved target result', err);
      }
      continue;
    }

    // Alpha Wolf bite: 20% chance to convert the primary target instead of killing.
    // Only applies to the first chosen victim, and only to non-wolf-aligned players.
    if (
      targetId === wolfChosenVictims[0] &&
      alphaWolfAlive &&
      biteConvertedId === null &&
      playersById.get(targetId)?.alignment !== 'wolf' &&
      Math.random() < 0.2
    ) {
      await setPlayerRoleAndAlignment(gameId, targetId, 'werewolf', 'wolf');
      biteConvertedId = targetId;

      // Tell the turned player who their new packmates are.
      const packMates = players.filter(
        (p) => p.is_alive && WOLF_PACK_ROLES.has(p.role as RoleName) && p.user_id !== targetId,
      );
      const packMentions = packMates.length > 0
        ? packMates.map((p) => `<@${p.user_id}>`).join(', ')
        : 'none — you stand alone';

      try {
        const dmChannelId = await openDmChannel(targetId);
        await postChannelMessage(dmChannelId, { content: alphaWolfTurnedYouLine(packMentions) });
      } catch (err) {
        console.error('Failed to DM newly turned wolf', gameId, targetId, err);
      }

      // Tell the existing pack a new wolf has joined.
      await Promise.all(
        packMates.map(async (wolf) => {
          try {
            const dmChannelId = await openDmChannel(wolf.user_id);
            await postChannelMessage(dmChannelId, { content: alphaWolfTurnedPackLine(targetId) });
          } catch (err) {
            console.error('Failed to DM pack about new wolf', gameId, wolf.user_id, err);
          }
        }),
      );

      continue;
    }

    // Successful wolf kill for this chosen victim (and their visitors).
    const wolfVictims = new Set<string>();
    wolfVictims.add(targetId);

    for (const a of actions) {
      if (
        (a.action_kind === 'visit' || a.action_kind === 'potion' || a.action_kind === 'steal') &&
        a.target_id === targetId &&
        !harlotIds.has(a.actor_id)
      ) {
        wolfVictims.add(a.actor_id);
      }
    }

    for (const id of wolfVictims) {
      if (!killedIds.includes(id)) {
        killedIds.push(id);
        await markPlayerDead(gameId, id);
        nightDeaths.push({ playerId: id, cause: 'wolf_kill' });
        try {
          const dmChannelId = await openDmChannel(id);
          await postChannelMessage(dmChannelId, {
            content: wolfKillDmLine(),
          });
        } catch (err) {
          console.error('Failed to DM wolf kill victim', gameId, id, err);
        }
      }
    }
  }

  // --- Doctor actions ---
  // Pass only the resolved victim (not raw wolf votes) so feedback is accurate
  // even when wolves tied and no kill happened.
  // Doctor deaths from wolf retaliation are recorded in nightDeaths for dawn narration.
  const {
    anySaved: doctorSavedSomeone,
    killedDoctorId,
    doctorDeathInfo,
  } = await processDoctorActions(
    players,
    actions,
    wolfChosenVictims,
    killedIds,
  );
  if (killedDoctorId) {
    killedIds.push(killedDoctorId);
  }

  if (doctorDeathInfo) {
    nightDeaths.push({
      playerId: doctorDeathInfo.doctorId,
      cause: 'doctor_protecting_wolf',
      relatedPlayerId: doctorDeathInfo.wolfTargetId,
    });
  }

  // --- Harlot actions ---
  // Pass the original wolf-chosen victim (not actual kill result) — harlot dies
  // if they visited whoever the wolves intended to kill, even if doctor saved them.
  const { killedHarlotIds, harlotDeathInfos } = await processHarlotActions(
    players,
    visitActions,
    wolfChosenVictims,
    gameId,
    awayPlayerIds,
  );
  killedIds.push(...killedHarlotIds);

  for (const info of harlotDeathInfos) {
    nightDeaths.push({
      playerId: info.harlotId,
      cause:
        info.cause === 'visited_wolf'
          ? 'harlot_visiting_wolf'
          : 'harlot_visiting_wolf_victim',
      relatedPlayerId: info.targetId,
    });
  }

  // --- Chemist actions ---
  const chemistResult = await processChemistActions(
    players,
    actions,
    nightNumber,
    gameId,
    killedIds,
  );
  for (const id of chemistResult.killedIds) {
    if (!killedIds.includes(id)) {
      killedIds.push(id);
    }
  }

  for (const duel of chemistResult.duels) {
    nightDeaths.push({
      playerId: duel.victimId,
      cause: duel.victimId === duel.chemistId ? 'chemist_self' : 'chemist_target',
      relatedPlayerId: duel.victimId === duel.chemistId ? duel.targetId : duel.chemistId,
    });
  }

  // --- Arsonist actions ---
  const arsonistResult = await processArsonistActions(
    gameId,
    players,
    actions,
    killedIds,
  );
  for (const id of arsonistResult.killedIds) {
    if (!killedIds.includes(id)) {
      killedIds.push(id);
    }
  }
  for (const burned of arsonistResult.burnedVictims) {
    nightDeaths.push({
      playerId: burned.victimId,
      cause:
        burned.kind === 'occupant_away'
          ? 'arsonist_fire_away'
          : 'arsonist_fire_home',
    });
  }

  // Refresh player state post-kills
  const updatedPlayers = await getPlayersForGame(gameId);

  return { updatedPlayers, killedIds, nightDeaths, doctorSavedSomeone, biteConvertedId };
}

/**
 * Called when a day vote is submitted or the day timeout fires.
 * Checks if a lynch verdict has been reached, then resolves the day:
 *   1. Plurality/timeout lynch or no-lynch
 *   2. Announce result and reveal alignment
 *   3. Hunter reactive shot if the hunter was lynched
 *   4. Win condition check, or advance to night
 */
export async function maybeResolveDay(
  gameId: string,
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  try {
    const game = await getGame(gameId);
    if (!game || game.status !== 'day') {
      return;
    }

    const dayNumber = game.current_day || 1;
    const isDoubleLynchDay =
      game.troublemaker_double_lynch_day != null &&
      game.troublemaker_double_lynch_day === dayNumber;

    // --- 1. Check if a lynch verdict has been reached ---
    const players = await getPlayersForGame(gameId);
    const votes = await getVotesForDay(gameId, dayNumber);

    const resolution = evaluateDayResolution(players, votes, { force });
    if (resolution.state === 'pending') {
      return;
    }

    // Atomically claim resolution: advance day -> night.
    // If another concurrent call already claimed it, bail out.
    const claimed = await advancePhase(gameId, 'day');
    if (!claimed) return;

    // Disable stale vote DMs so players can't vote after the phase ends.
    disableDayVotePrompts(gameId, dayNumber).catch((err) =>
      console.error('Failed to disable day vote prompts', err),
    );

    // --- 2. No-lynch result ---
    if (resolution.state === 'no_lynch') {
      if (game.channel_id) {
        try {
          await postChannelMessage(game.channel_id, {
            content: [buildNoLynchLine(dayNumber), buildNightFallsLine()].join('\n'),
          });
        } catch (err) {
          console.error('Failed to send no-lynch day resolution message', err);
        }
      }

      await dmNightAndSchedule(gameId);
      return;
    }

    // --- 3. Apply lynch ---
    const lynchId = resolution.lynchId;
    const lynched = players.find((p) => p.user_id === lynchId);
    if (!lynched || !lynched.is_alive) {
      return;
    }

    await markPlayerDead(gameId, lynchId);
    const updatedPlayers = await getPlayersForGame(gameId);

    // Immediate Tanner win on lynch: the game ends with the Tanner as the
    // sole winner; town and wolves both lose.
    if (isTannerLynchWin(lynched, updatedPlayers)) {
      if (game.channel_id) {
        const lines = [
          lynchResultLine(lynched),
          'In a cruel twist, the village has hanged the Tanner — a miserable soul who wanted nothing more than to die.',
          'The Tanner wins alone. Everyone else loses.',
        ];
        try {
          await postChannelMessage(game.channel_id, { content: lines.join('\n') });
        } catch (err) {
          console.error('Failed to send Tanner win message', err);
        }
      }
      await endGame(gameId);
      return;
    }

    const { sorrowVictimId: daySorrowVictimId, partnerId: daySorrowPartnerId } =
      await applyLoverSorrowDeaths(gameId, updatedPlayers);
    const daySorrowVictim = daySorrowVictimId
      ? updatedPlayers.find((p) => p.user_id === daySorrowVictimId) ?? null
      : null;

    let secondLynch: GamePlayerState | null = null;
    let extraSorrowVictim: GamePlayerState | null = null;
    let extraSorrowPartnerId: string | null = null;

    if (isDoubleLynchDay) {
      const secondLynchId = chooseLynchVictim(updatedPlayers, votes);
      if (secondLynchId) {
        const second = updatedPlayers.find(
          (p) => p.user_id === secondLynchId && p.is_alive,
        );
        if (second) {
          await markPlayerDead(gameId, secondLynchId);
          const afterSecond = await getPlayersForGame(gameId);

          const {
            sorrowVictimId: extraSorrowId,
            partnerId: extraPartnerId,
          } = await applyLoverSorrowDeaths(gameId, afterSecond);
          if (extraSorrowId) {
            extraSorrowVictim =
              afterSecond.find((p) => p.user_id === extraSorrowId) ?? null;
            extraSorrowPartnerId = extraPartnerId ?? null;
          }

          if (second.role === 'wolf_cub') {
            const packMates = afterSecond.filter(
              (p) =>
                p.is_alive &&
                WOLF_PACK_ROLES.has(p.role as RoleName) &&
                p.user_id !== secondLynchId,
            );
            await Promise.all(
              packMates.map(async (wolf) => {
                try {
                  const dmChannelId = await openDmChannel(wolf.user_id);
                  await postChannelMessage(dmChannelId, {
                    content: wolfCubDeathPackLine(secondLynchId),
                  });
                } catch (err) {
                  console.error(
                    'Failed to DM wolf pack about Wolf Cub lynch (second lynch)',
                    gameId,
                    wolf.user_id,
                    err,
                  );
                }
              }),
            );
            await incrementWolfExtraKillsForNextNight(gameId);
          }

          if (second.role === 'hunter') {
            const aliveAfterSecond = afterSecond.filter((p) => p.is_alive);
            if (game.channel_id) {
              const lines: string[] = [lynchResultLine(lynched)];

              if (daySorrowVictim) {
                lines.push(
                  loverSorrowDeathLine(
                    daySorrowVictim.user_id,
                    daySorrowPartnerId ?? undefined,
                  ) +
                    ` They were ${deathSummary(
                      daySorrowVictim.alignment,
                      daySorrowVictim.role,
                    )}.`,
                );
              }

              lines.push(lynchResultLine(second));

              if (extraSorrowVictim) {
                lines.push(
                  loverSorrowDeathLine(
                    extraSorrowVictim.user_id,
                    extraSorrowPartnerId ?? undefined,
                  ) +
                    ` They were ${deathSummary(
                      extraSorrowVictim.alignment,
                      extraSorrowVictim.role,
                    )}.`,
                );
              }

              lines.push(hunterResolveLine());

              try {
                await postChannelMessage(game.channel_id, {
                  content: lines.join('\n'),
                });
              } catch (err) {
                console.error('Failed to send double-lynch hunter message', err);
              }
            }

            await triggerHunterShot({
              game,
              hunterId: secondLynchId,
              continuation: 'night',
              alivePlayers: aliveAfterSecond,
            });
            return;
          }

          secondLynch = second;
        }
      }
    }

    // If the Wolf Cub was lynched, DM surviving pack members and flag extra kill.
    if (lynched.role === 'wolf_cub') {
      const packMates = updatedPlayers.filter(
        (p) =>
          p.is_alive &&
          WOLF_PACK_ROLES.has(p.role as RoleName) &&
          p.user_id !== lynchId,
      );
      await Promise.all(
        packMates.map(async (wolf) => {
          try {
            const dmChannelId = await openDmChannel(wolf.user_id);
            await postChannelMessage(dmChannelId, {
              content: wolfCubDeathPackLine(lynchId),
            });
          } catch (err) {
            console.error('Failed to DM wolf pack about Wolf Cub lynch', gameId, wolf.user_id, err);
          }
        }),
      );
      await incrementWolfExtraKillsForNextNight(gameId);
    }

    // --- 4. Hunter reactive shot (if the hunter was lynched) ---
    if (lynched.role === 'hunter') {
      const alivePlayers = updatedPlayers.filter((p) => p.is_alive);
      if (game.channel_id) {
        const lines = [lynchResultLine(lynched), hunterResolveLine()];
        try {
          await postChannelMessage(game.channel_id, { content: lines.join('\n') });
        } catch (err) {
          console.error('Failed to send lynch message', err);
        }
      }
      await triggerHunterShot({ game, hunterId: lynchId, continuation: 'night', alivePlayers });
      return;
    }

    // --- 5. Win condition check and day resolution announcement ---
    const win = evaluateWinCondition(updatedPlayers);

    if (game.channel_id) {
      const lines: string[] = [lynchResultLine(lynched)];

      if (daySorrowVictim) {
        lines.push(
          loverSorrowDeathLine(
            daySorrowVictim.user_id,
            daySorrowPartnerId ?? undefined,
          ) +
            ` They were ${deathSummary(
              daySorrowVictim.alignment,
              daySorrowVictim.role,
            )}.`,
        );
      }

      if (secondLynch) {
        lines.push(lynchResultLine(secondLynch));
      }

      if (extraSorrowVictim) {
        lines.push(
          loverSorrowDeathLine(
            extraSorrowVictim.user_id,
            extraSorrowPartnerId ?? undefined,
          ) +
            ` They were ${deathSummary(
              extraSorrowVictim.alignment,
              extraSorrowVictim.role,
            )}.`,
        );
      }

      if (win) {
        const winLines = await buildWinLinesWithLovers(gameId, updatedPlayers, win);
        lines.push(...winLines);
        lines.push(...finalRolesLines(updatedPlayers));
      } else {
        lines.push(buildNightFallsLine());
      }

      try {
        await postChannelMessage(game.channel_id, { content: lines.join('\n') });
      } catch (err) {
        console.error('Failed to send day resolution message', err);
      }
    }

    if (win) {
      await endGame(gameId);
      return;
    }

    // --- 6. Advance to night ---
    await dmNightAndSchedule(gameId);
  } catch (err) {
    console.error('Error resolving day phase', err);
  }
}

/**
 * Resolves a hunter's reactive shot after they are eliminated.
 * The hunter may target a player or pass. Handles both night and day continuations.
 */
export async function resolveHunterShot(gameId: string, hunterId: string, targetId: string | null): Promise<void> {
  try {
    // Read the pending shot first to get the continuation
    const shot = await getPendingHunterShot(gameId, hunterId);
    if (!shot) return; // already resolved or doesn't exist

    // Atomically mark as resolved (prevent concurrent double-resolution from timeout + user submit)
    const claimed = await resolveHunterShotRecord(gameId, hunterId, targetId);
    if (!claimed) return;

    if (targetId) {
      await markPlayerDead(gameId, targetId);
    }

    const game = await getGame(gameId);
    const updatedPlayers = await getPlayersForGame(gameId);

    const { sorrowVictimId: hunterSorrowVictimId, partnerId: hunterSorrowPartnerId } =
      await applyLoverSorrowDeaths(gameId, updatedPlayers);
    const hunterSorrowVictim = hunterSorrowVictimId
      ? updatedPlayers.find((p) => p.user_id === hunterSorrowVictimId) ?? null
      : null;

    const win = evaluateWinCondition(updatedPlayers);

    if (game?.channel_id) {
      const lines: string[] = [];
      if (targetId) {
        const target = updatedPlayers.find((p) => p.user_id === targetId);
        const hunter = updatedPlayers.find((p) => p.user_id === hunterId);
        if (target && hunter) {
          lines.push(hunterShotLine(hunter, target));
        }
      } else {
        lines.push(hunterPassLine(hunterId));
      }
      if (hunterSorrowVictim) {
        lines.push(
          loverSorrowDeathLine(
            hunterSorrowVictim.user_id,
            hunterSorrowPartnerId ?? undefined,
          ) +
            ` They were ${deathSummary(
              hunterSorrowVictim.alignment,
              hunterSorrowVictim.role,
            )}.`,
        );
      }
      if (win) {
        const winLines = await buildWinLinesWithLovers(gameId, updatedPlayers, win);
        lines.push(...winLines);
        lines.push(...finalRolesLines(updatedPlayers));
      }
      try {
        await postChannelMessage(game.channel_id, { content: lines.join('\n') });
      } catch (err) {
        console.error('Failed to send hunter shot message', err);
      }
    }

    if (win) {
      await endGame(gameId);
      return;
    }

    // Continue the game: if the hunter was killed during day, start the next night;
    // if during night, start the next day.
    if (shot.continuation.startsWith('day:')) {
      const upcomingDay = parseInt(shot.continuation.split(':')[1]!, 10);
      scheduleDayVoting(gameId, upcomingDay);
      scheduleDayTimeout(gameId, upcomingDay);
    } else {
      // continuation === 'night'
      await dmNightAndSchedule(gameId);
    }
  } catch (err) {
    console.error('Error resolving hunter shot', err);
  }
}

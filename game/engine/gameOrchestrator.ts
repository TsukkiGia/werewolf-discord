import {
  getGame,
  getPlayersForGame,
  getNightActionsForNight,
  markPlayerDead,
  setPlayerRoleAndAlignment,
  advancePhase,
  beginSecondLynchPhase,
  endGame,
  resolveHunterShotRecord,
  incrementWolfExtraKillsForNextNight,
  clearWolfExtraKillsForNextNight,
  getLovers,
} from '../../db.js';
import type { NightActionRow } from '../../db/nightActions.js';
import type { GamePlayerState } from '../../db/players.js';
import type { GameRow } from '../../db/games.js';
import { WOLF_PACK_ROLES, type RoleName, type NightDeathInfo } from '../types.js';
import {
  processSeerActions,
  processDoctorActions,
  processHarlotActions,
  processChemistActions,
  processArsonistActions,
  processThiefActions,
  processCultistActions,
  processCultHunterActions,
  processSerialKillerActions,
  processWolfKillActions,
} from './nightActionProcessors.js';
import { postChannelMessage, openDmChannel } from '../../utils.js';
import {
  buildNightContext,
  buildNightResolutionContext,
  buildDayContext,
  buildDayResolutionContext,
  buildHunterShotContext,
} from './phaseContext.js';
import { evaluateWinCondition, buildWinLines } from './winConditions.js';
import type { WinResult } from './winConditions.js';
import {
  buildDayStartLine,
  buildNightFallsLine,
  buildNoLynchLine,
} from './status.js';
import {
  dmNightActionsForAlivePlayers,
  dmWolfExtraKillPrompts,
  disableDayVotePrompts,
  dmTroublemakerDiscussPrompt,
} from './dmRoles.js';
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
  hunterTriggerLine,
  hunterResolveLine,
  hunterShotLine,
  lynchResultLine,
  nightVictimLine,
  tannerLynchLines,
  doctorProtectingWolfDeathLine,
  harlotVisitWolfDeathLine,
  harlotVisitWolfVictimDeathLine,
  chemistSelfDeathLine,
  chemistTargetDeathLine,
  arsonistFireHomeDeathLine,
  arsonistFireAwayDeathLine,
  arsonistIgniteLine,
  serialKillerVictimDeathLine,
  wolfStabbedBySerialKillerLine,
  deathSummary,
  alphaWolfBiteChannelLine,
  loversWinAloneLine,
  loversAlsoWinLine,
  loverSorrowDeathLine,
  wolfCubDeathPackLine,
  thiefStoleLine,
  cultGainedMemberLine,
  cultBackfiredLine,
  cultHunterKilledLine,
  cultBackfireMonsterLine,
} from '../strings/narration.js';

interface NightActionResolutionOutcome {
  updatedPlayers: GamePlayerState[];
  killedIds: string[];
  nightDeaths: NightDeathInfo[];
  doctorSavedSomeone: boolean;
  biteConvertedId: string | null;
  cultConverted: boolean;
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
    // In this special case, only the Lovers win; base faction win lines are
    // suppressed so we don't announce a simultaneous wolf/town/neut/cult win.
    return [loversWinAloneLine(loverAId, loverBId)];
  }

  // Case 2: Both Lovers alive and at least one is on the winning side.
  let loverOnWinningSide = false;
  if (win.winner === 'wolves') {
    loverOnWinningSide = aliveLovers.some((p) => p.alignment === 'wolf');
  } else if (win.winner === 'town') {
    loverOnWinningSide = aliveLovers.some((p) => p.alignment === 'town');
  } else if (win.winner === 'arsonist') {
    loverOnWinningSide = aliveLovers.some((p) => p.role === 'arsonist');
  } else if (win.winner === 'cult') {
    loverOnWinningSide = aliveLovers.some((p) => p.alignment === 'cult');
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
    const nightCtx = await buildNightContext(gameId);
    if (!nightCtx) return;

    // --- 1. Check if all night actions are in ---
    const resolutionCheck = buildNightResolutionContext(nightCtx);
    if (resolutionCheck.state === 'pending') {
      return;
    }
    const { ctx: readyCtx } = resolutionCheck;
    const game = readyCtx.game;

    // On Wolf Cub bonus nights, once all first-round actions are in, open a
    // second-round wolf vote before resolving the night. Only do this once,
    // and only if there is at least one alive wolf-pack member.
    if (readyCtx.hasWolfExtraKill && readyCtx.actionsRound2.length === 0) {
      const aliveWolves = readyCtx.playersBefore.filter(
        (p) => p.is_alive && WOLF_PACK_ROLES.has(p.role as RoleName),
      );
      if (aliveWolves.length > 0) {
        await dmWolfExtraKillPrompts({ game, players: readyCtx.playersBefore });
        await scheduleNightTimeout(gameId, readyCtx.nightNumber, true);
        return;
      }
    }

    // Atomically claim resolution: advance night -> day.
    // If another concurrent call already claimed it, bail out.
    const upcomingDay = (game.current_day || 0) + 1;
    const claimed = await advancePhase(gameId, 'night');
    if (!claimed) return;

    // --- 2. Seer inspections (DM only, no kills yet) ---
    await processSeerActions(readyCtx.playersBefore, readyCtx.actionsRound1);

    // --- 2b. Thief role swap (night 1 only) ---
    const { thiefActed } = await processThiefActions(
      gameId,
      readyCtx.playersBefore,
      readyCtx.actionsRound1,
    );

    // --- 3–7. Apply all killing night actions and refresh player state ---
    const {
      updatedPlayers,
      killedIds,
      nightDeaths,
      doctorSavedSomeone,
      biteConvertedId,
      cultConverted,
    } = await resolveNightActionsAndCollectDeaths({
      gameId,
      nightNumber: readyCtx.nightNumber,
      players: readyCtx.playersBefore,
      actions: readyCtx.allActions,
      killTargetsRound1: readyCtx.killTargetsRound1,
      killTargetsRound2: readyCtx.killTargetsRound2,
      protectTargets: readyCtx.protectTargets,
      visitActions: readyCtx.visitActions,
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

    // If the Wolf Cub transitioned from alive -> dead over the course of the night,
    // notify the pack and grant the extra kill bonus for the following night.
    await maybeNotifyWolfCubDeathFromTransition(gameId, readyCtx.playersBefore, updatedPlayers);

    if (readyCtx.hasWolfExtraKill) {
      await clearWolfExtraKillsForNextNight(gameId);
    }

    // If all current wolves are dead but a Traitor is alive, they awaken as
    // a new werewolf before any win checks are evaluated.
    await maybeConvertTraitorToWerewolf(gameId);
    const postTraitorPlayers = await getPlayersForGame(gameId);

    // --- 8. Hunter reactive shot (if the hunter was killed tonight) ---
    const killedHunter = killedIds.length > 0
      ? postTraitorPlayers.find((p) => killedIds.includes(p.user_id) && p.role === 'hunter')
      : null;

    if (killedHunter) {
      const alivePlayers = postTraitorPlayers.filter((p) => p.is_alive);
      if (game.channel_id) {
        // Omit the Hunter's own generic death line from the night summary;
        // their fall is narrated via the trigger/resolve lines instead.
        const filteredNightDeaths = nightDeaths.filter(
          (d) => d.playerId !== killedHunter.user_id,
        );
        const lines: string[] = buildNightSummaryLines(
          filteredNightDeaths,
          postTraitorPlayers,
          doctorSavedSomeone,
          cultConverted,
        );
        // Call out the Hunter's final stand before listing the full night summary.
        lines.splice(1, 0, hunterTriggerLine(), hunterResolveLine());
        if (biteConvertedId) lines.push(alphaWolfBiteChannelLine());
        await safePostToChannel(game.channel_id, lines, 'dawn message');
      }
      await triggerHunterShot({
        game,
        hunterId: killedHunter.user_id,
        continuation: `day:${upcomingDay}`,
        alivePlayers,
      });
      return;
    }

    // --- 9. Dawn announcement ---
    const win = evaluateWinCondition(postTraitorPlayers);

    if (game.channel_id) {
      const lines: string[] = buildNightSummaryLines(
        nightDeaths,
        postTraitorPlayers,
        doctorSavedSomeone,
        cultConverted,
      );
      if (biteConvertedId) lines.push(alphaWolfBiteChannelLine());
      if (thiefActed) lines.push(thiefStoleLine());

      if (win) {
        const winLines = await buildWinLinesWithLovers(gameId, postTraitorPlayers, win);
        lines.push(...winLines);
        lines.push(...finalRolesLines(postTraitorPlayers));
      } else {
        lines.push(buildDayStartLine(upcomingDay));
      }

      await safePostToChannel(game.channel_id, lines, 'day summary message');
    }

    if (win) {
      await endGame(gameId);
      return;
    }

    // --- 10. Schedule day voting and timeout ---
    scheduleDayVoting(gameId, upcomingDay);
    scheduleDayTimeout(gameId, upcomingDay);
    await dmTroublemakerDiscussPrompt({
      game,
      players: postTraitorPlayers,
      dayNumber: upcomingDay,
    });
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
      case 'cult_backfire': {
        const victim = playersById.get(death.playerId);
        const target =
          death.relatedPlayerId != null
            ? playersById.get(death.relatedPlayerId)
            : undefined;
        if (victim) {
          if (target?.role === 'cult_hunter') {
            lines.push(cultBackfiredLine(victim.user_id));
          } else {
            lines.push(cultBackfireMonsterLine(victim.user_id));
          }
        }
        break;
      }
      case 'cult_hunter_kill': {
        lines.push(cultHunterKilledLine(death.playerId));
        break;
      }
      case 'serial_killer': {
        const victim = playersById.get(death.playerId);
        if (victim) {
          lines.push(
            serialKillerVictimDeathLine(victim.user_id) +
              ` They were ${deathSummary(victim.alignment, victim.role)}.`,
          );
        }
        break;
      }
      case 'serial_killer_wolf_counter': {
        const victim = playersById.get(death.playerId);
        if (victim) {
          lines.push(
            wolfStabbedBySerialKillerLine(victim.user_id) +
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
  cultConverted = false,
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

  if (cultConverted) {
    lines.push(cultGainedMemberLine());
  }

  return lines;
}

async function resolveNightActionsAndCollectDeaths(params: {
  gameId: string;
  nightNumber: number;
  players: GamePlayerState[];
  actions: NightActionRow[];
  killTargetsRound1: string[];
  killTargetsRound2: string[];
  protectTargets: string[];
  visitActions: { harlotId: string; targetId: string }[];
}): Promise<NightActionResolutionOutcome> {
  const {
    gameId,
    nightNumber,
    players,
    actions,
    killTargetsRound1,
    killTargetsRound2,
    protectTargets,
    visitActions,
  } =
    params;

  const serialKillerVictimIds = actions
    .filter((a) => a.action_kind === 'kill' && a.target_id && a.role === 'serial_killer')
    .map((a) => a.target_id as string);

  // --- Wolf kill ---
  const { wolfChosenVictims, killedIds, nightDeaths, biteConvertedId } = await processWolfKillActions({
    gameId,
    players,
    actions,
    killTargetsRound1,
    killTargetsRound2,
    protectTargets,
  });

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
    serialKillerVictimIds,
    gameId,
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

  // --- Cultist actions (odd nights only) ---
  const {
    converted: cultConverted,
    backfiredVictimId,
    backfireTargetId,
  } = await processCultistActions(
    gameId,
    players,
    actions,
    killedIds,
  );
  if (backfiredVictimId) {
    if (!killedIds.includes(backfiredVictimId)) {
      killedIds.push(backfiredVictimId);
    }
    const cultBackfireDeath: NightDeathInfo = backfireTargetId
      ? {
          playerId: backfiredVictimId,
          cause: 'cult_backfire',
          relatedPlayerId: backfireTargetId,
        }
      : {
          playerId: backfiredVictimId,
          cause: 'cult_backfire',
        };
    nightDeaths.push(cultBackfireDeath);
  }

  // --- Cult Hunter actions ---
  const { killedCultistId } = await processCultHunterActions(gameId, players, actions, killedIds);
  if (killedCultistId && !killedIds.includes(killedCultistId)) {
    killedIds.push(killedCultistId);
    nightDeaths.push({ playerId: killedCultistId, cause: 'cult_hunter_kill' });
  }

  // --- Serial Killer actions ---
  const protectedSet = new Set(protectTargets);
  const serialKillerResult = await processSerialKillerActions(
    gameId,
    players,
    actions,
    killedIds,
    protectedSet,
    wolfChosenVictims,
  );
  for (const id of serialKillerResult.killedIds) {
    if (!killedIds.includes(id)) {
      killedIds.push(id);
      nightDeaths.push({ playerId: id, cause: 'serial_killer' });
    }
  }

  // Refresh player state post-kills
  const updatedPlayers = await getPlayersForGame(gameId);

  return { updatedPlayers, killedIds, nightDeaths, doctorSavedSomeone, biteConvertedId, cultConverted };
}

async function notifyWolfCubPackDeath(
  gameId: string,
  cubId: string,
  players: GamePlayerState[],
): Promise<void> {
  const packMates = players.filter(
    (p) => p.is_alive && WOLF_PACK_ROLES.has(p.role as RoleName) && p.user_id !== cubId,
  );
  await Promise.all(
    packMates.map(async (wolf) => {
      try {
        const dmChannelId = await openDmChannel(wolf.user_id);
        await postChannelMessage(dmChannelId, { content: wolfCubDeathPackLine(cubId) });
      } catch (err) {
        console.error('Failed to DM wolf pack about Wolf Cub death', gameId, wolf.user_id, err);
      }
    }),
  );
  await incrementWolfExtraKillsForNextNight(gameId);
}

/**
 * Compare two player snapshots and, if a previously alive Wolf Cub is now dead,
 * notify surviving pack members and grant the extra kill bonus for the following night.
 */
async function maybeNotifyWolfCubDeathFromTransition(
  gameId: string,
  before: GamePlayerState[],
  after: GamePlayerState[],
): Promise<void> {
  const cubBefore = before.find((p) => p.role === 'wolf_cub' && p.is_alive);
  if (!cubBefore) return;

  const cubStillAlive = after.some(
    (p) => p.user_id === cubBefore.user_id && p.is_alive,
  );
  if (!cubStillAlive) {
    await notifyWolfCubPackDeath(gameId, cubBefore.user_id, after);
  }
}

/** Formats a lover sorrow death line with alignment reveal, used in lynch and hunter-shot narration. */
function formatSorrowDeathLine(victim: GamePlayerState, partnerId: string | null | undefined): string {
  return (
    loverSorrowDeathLine(victim.user_id, partnerId ?? undefined) +
    ` They were ${deathSummary(victim.alignment, victim.role)}.`
  );
}


async function safePostToChannel(
  channelId: string | null | undefined,
  lines: string[],
  context: string,
): Promise<void> {
  if (!channelId) return;
  try {
    await postChannelMessage(channelId, { content: lines.join('\n') });
  } catch (err) {
    console.error(`Failed to send ${context}`, err);
  }
}

/**
 * Posts the channel announcement for a lynched Hunter, then triggers their reactive shot.
 * Both the first-lynch and second-lynch hunter paths share this sequence.
 * `continuation` defaults to 'night' (advance to next night after shot).
 * Pass `day_second_lynch:<dayNumber>` when the Hunter was first-lynch on a double-lynch day
 * so the second lynch runs after the shot instead of advancing to night.
 */
async function announceAndTriggerLynchedHunterShot(
  game: GameRow,
  hunterId: string,
  alivePlayers: GamePlayerState[],
  lines: string[],
  continuation = 'night',
): Promise<void> {
  await safePostToChannel(game.channel_id, lines, 'lynched hunter message');
  await triggerHunterShot({ game, hunterId, continuation, alivePlayers });
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
    const baseCtx = await buildDayContext(gameId);
    if (!baseCtx) return;

    // --- 1. Check if a lynch verdict has been reached ---
    const dayCtx = buildDayResolutionContext(baseCtx, { force });
    if (dayCtx.resolutionKind === 'pending') {
      return;
    }

    // Atomically claim resolution.
    // First lynch on a double-lynch day: transition to 'day_second_lynch' (no counter change),
    // regardless of whether the first round produced a lynch or no-lynch.
    // Everything else (normal day, second lynch): advance to 'night'.
    let claimed: boolean;
    if (dayCtx.isFirstLynchOfDouble) {
      claimed = await beginSecondLynchPhase(gameId);
    } else {
      claimed = (await advancePhase(gameId, dayCtx.game.status)) !== null;
    }
    if (!claimed) return;

    // Disable stale vote DMs so players can't vote after the phase ends.
    disableDayVotePrompts(gameId, dayCtx.dayNumber).catch((err) =>
      console.error('Failed to disable day vote prompts', err),
    );

    // --- 2. No-lynch result ---
    if (dayCtx.resolutionKind === 'no_lynch') {
      if (dayCtx.isFirstLynchOfDouble) {
        // First round on a TroubleMaker double-lynch day: no one is lynched,
        // but the village still gets a second voting round instead of going to night.
        await safePostToChannel(
          dayCtx.game.channel_id,
          [buildNoLynchLine(dayCtx.dayNumber)],
          'no-lynch first lynch on double-lynch day',
        );
        scheduleDayVoting(gameId, dayCtx.dayNumber, true);
        scheduleDayTimeout(gameId, dayCtx.dayNumber, true);
        return;
      } else {
        // Normal day or second lynch round: no-lynch falls through to night.
        await safePostToChannel(
          dayCtx.game.channel_id,
          [buildNoLynchLine(dayCtx.dayNumber), buildNightFallsLine()],
          'no-lynch day resolution message',
        );
        await dmNightAndSchedule(gameId);
        return;
      }
    }

    // --- 3. Apply lynch ---
    const lynchId = dayCtx.lynchId!;
    const lynched = dayCtx.playersBefore.find((p) => p.user_id === lynchId);
    if (!lynched || !lynched.is_alive) {
      return;
    }

    await markPlayerDead(gameId, lynchId);
    const updatedPlayers = await getPlayersForGame(gameId);

    // Immediate Tanner win on lynch: the game ends with the Tanner as the
    // sole winner; town and wolves both lose.
    if (isTannerLynchWin(lynched, updatedPlayers)) {
      const lines = [lynchResultLine(lynched), ...tannerLynchLines()];
      await safePostToChannel(dayCtx.game.channel_id, lines, 'Tanner win message');
      await endGame(gameId);
      return;
    }

    const { sorrowVictimId: daySorrowVictimId, partnerId: daySorrowPartnerId } =
      await applyLoverSorrowDeaths(gameId, updatedPlayers);
    const daySorrowVictim = daySorrowVictimId
      ? updatedPlayers.find((p) => p.user_id === daySorrowVictimId) ?? null
      : null;

    // If the Wolf Cub transitioned from alive -> dead over the course of the day
    // (lynch and any Lover sorrow), notify the pack and grant the bonus.
    await maybeNotifyWolfCubDeathFromTransition(gameId, dayCtx.playersBefore, updatedPlayers);

    // --- 4. Hunter reactive shot ---
    if (lynched.role === 'hunter') {
      const lines: string[] = [lynchResultLine(lynched)];
      if (daySorrowVictim) lines.push(formatSorrowDeathLine(daySorrowVictim, daySorrowPartnerId));
      lines.push(hunterTriggerLine(), hunterResolveLine());
      // On the first lynch of a double-lynch day, the second vote must still happen after the shot.
      const continuation = dayCtx.isFirstLynchOfDouble ? `day_second_lynch:${dayCtx.dayNumber}` : 'night';
      await announceAndTriggerLynchedHunterShot(
        dayCtx.game, lynchId, updatedPlayers.filter((p) => p.is_alive), lines, continuation,
      );
      return;
    }

    // --- 5. Traitor awakening + win condition check ---
    await maybeConvertTraitorToWerewolf(gameId);
    const playersAfterTraitor = await getPlayersForGame(gameId);
    const win = evaluateWinCondition(playersAfterTraitor);

    const lines: string[] = [lynchResultLine(lynched)];
    if (daySorrowVictim) lines.push(formatSorrowDeathLine(daySorrowVictim, daySorrowPartnerId));
    if (win) {
      const winLines = await buildWinLinesWithLovers(gameId, playersAfterTraitor, win);
      lines.push(...winLines, ...finalRolesLines(playersAfterTraitor));
    } else if (!dayCtx.isFirstLynchOfDouble) {
      lines.push(buildNightFallsLine());
    }
    await safePostToChannel(dayCtx.game.channel_id, lines, 'day resolution message');

    if (win) {
      await endGame(gameId);
      return;
    }

    if (dayCtx.isFirstLynchOfDouble) {
      // --- 6a. Open second vote ---
      scheduleDayVoting(gameId, dayCtx.dayNumber, true);
      scheduleDayTimeout(gameId, dayCtx.dayNumber, true);
      return;
    }

    // --- 6b. Advance to night ---
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
    const shotCtx = await buildHunterShotContext(gameId, hunterId, targetId);
    if (!shotCtx) return; // already resolved or doesn't exist

    // Atomically mark as resolved (prevent concurrent double-resolution from timeout + user submit)
    const claimed = await resolveHunterShotRecord(gameId, hunterId, targetId);
    if (!claimed) return;

    const { game, playersBefore, shot } = shotCtx;

    if (targetId) {
      await markPlayerDead(gameId, targetId);
    }

    const updatedPlayers = await getPlayersForGame(gameId);

    const { sorrowVictimId: hunterSorrowVictimId, partnerId: hunterSorrowPartnerId } =
      await applyLoverSorrowDeaths(gameId, updatedPlayers);
    const hunterSorrowVictim = hunterSorrowVictimId
      ? updatedPlayers.find((p) => p.user_id === hunterSorrowVictimId) ?? null
      : null;

    // If the Wolf Cub transitioned from alive -> dead due to the shot and/or Lover sorrow,
    // notify the pack and grant the extra kill bonus.
    await maybeNotifyWolfCubDeathFromTransition(gameId, playersBefore, updatedPlayers);

    // After the shot and any Lover sorrow, allow a Traitor to awaken as a wolf
    // if the shot killed the last existing wolf.
    await maybeConvertTraitorToWerewolf(gameId);
    const playersAfterTraitor = await getPlayersForGame(gameId);

    const win = evaluateWinCondition(playersAfterTraitor);

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
        lines.push(formatSorrowDeathLine(hunterSorrowVictim, hunterSorrowPartnerId));
      }
      if (win) {
        const winLines = await buildWinLinesWithLovers(gameId, playersAfterTraitor, win);
        lines.push(...winLines);
        lines.push(...finalRolesLines(playersAfterTraitor));
      }
      await safePostToChannel(game.channel_id, lines, 'hunter shot message');
    }

    if (win) {
      await endGame(gameId);
      return;
    }

    // Continue the game based on where the Hunter fell.
    if (shot.continuation.startsWith('day_second_lynch:')) {
      // First-lynch Hunter on a double-lynch day: open second vote.
      const dayNumber = parseInt(shot.continuation.split(':')[1]!, 10);
      scheduleDayVoting(gameId, dayNumber, true);
      scheduleDayTimeout(gameId, dayNumber, true);
    } else if (shot.continuation.startsWith('day:')) {
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

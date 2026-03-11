import {
  getGame,
  getPlayersForGame,
  getNightActionsForNight,
  markPlayerDead,
  advancePhase,
  endGame,
  getVotesForDay,
  getPendingHunterShot,
  resolveHunterShotRecord,
} from '../../db.js';
import type { NightActionRow } from '../../db/nightActions.js';
import type { GamePlayerState } from '../../db/players.js';
import {
  processSeerActions,
  processDoctorActions,
  processHarlotActions,
  processChemistActions,
  processArsonistActions,
  buildAwayPlayerIds,
} from './nightActionProcessors.js';
import { postChannelMessage, openDmChannel } from '../../utils.js';
import { chooseKillVictim, evaluateNightResolution } from './nightResolution.js';
import { evaluateDayResolution } from './dayResolution.js';
import { evaluateWinCondition, buildWinLines } from './winConditions.js';
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
} from '../strings/narration.js';

type NightDeathCause =
  | 'wolf_kill'
  | 'doctor_protecting_wolf'
  | 'harlot_visiting_wolf'
  | 'harlot_visiting_wolf_victim'
  | 'chemist_self'
  | 'chemist_target'
  | 'arsonist_fire_home'
  | 'arsonist_fire_away';

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
}

/** DM all alive players their night-action prompts and schedule the night timeout. */
async function dmNightAndSchedule(gameId: string): Promise<void> {
  const game = await getGame(gameId);
  if (!game || game.status !== 'night') return;
  const players = await getPlayersForGame(gameId);
  await dmNightActionsForAlivePlayers({ game, players });
  await scheduleNightTimeout(gameId, game.current_night);
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

    // --- 3–7. Apply all killing night actions and refresh player state ---
    const {
      updatedPlayers,
      killedIds,
      nightDeaths,
      doctorSavedSomeone,
    } = await resolveNightActionsAndCollectDeaths({
      gameId,
      nightNumber,
      players,
      actions,
      killTargets,
      protectTargets,
      visitActions,
    });

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

      if (win) {
        lines.push(...buildWinLines(win));
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
}): Promise<NightActionResolutionOutcome> {
  const { gameId, nightNumber, players, actions, killTargets, protectTargets, visitActions } =
    params;

  const harlotIds = new Set(
    players.filter((p) => p.role === 'harlot').map((p) => p.user_id),
  );

  // --- Wolf kill ---
  // "Not home" mechanic: any player with a night action that targets another
  // player (visit, kill, protect, potion) is away for the night.
  // If the wolf's chosen victim is away, the kill is wasted.
  const victimId = chooseKillVictim(killTargets);
  const protectedSet = new Set(protectTargets);
  const awayPlayerIds = buildAwayPlayerIds(actions);

  const killedIds: string[] = [];
  const nightDeaths: NightDeathInfo[] = [];

  if (victimId && !protectedSet.has(victimId) && !awayPlayerIds.has(victimId)) {
    const wolfVictims = new Set<string>();
    wolfVictims.add(victimId);

    for (const a of actions) {
      if (
        (a.action_kind === 'visit' || a.action_kind === 'potion') &&
        a.target_id === victimId &&
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
  } else if (victimId && awayPlayerIds.has(victimId)) {
    // Notify wolves that their target wasn't home.
    const killActors = actions.filter(
      (a) => a.action_kind === 'kill' && a.target_id === victimId,
    );
    await Promise.all(
      killActors.map(async (a) => {
        try {
          const dmChannelId = await openDmChannel(a.actor_id);
          await postChannelMessage(dmChannelId, {
            content: wolfTargetNotHomeLine(victimId),
          });
        } catch (err) {
          console.error('Failed to DM wolf not-home result', err);
        }
      }),
    );

    // Let the intended victim know the wolves came while they were out.
    try {
      const dmChannelId = await openDmChannel(victimId);
      await postChannelMessage(dmChannelId, {
        content:
          'You hear whispers in the morning: the wolves came to your house last night, but found it empty. Being out may have saved your life.',
      });
    } catch (err) {
      console.error('Failed to DM away-target wolf miss result', err);
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
    victimId !== null ? [victimId] : [],
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
    victimId,
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

  // Refresh player state post-kills
  const updatedPlayers = await getPlayersForGame(gameId);

  return { updatedPlayers, killedIds, nightDeaths, doctorSavedSomeone };
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

      if (win) {
        lines.push(...buildWinLines(win));
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
      if (win) {
        lines.push(...buildWinLines(win));
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

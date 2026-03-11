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
import { processSeerActions, processDoctorActions, processHarlotActions } from './nightActionProcessors.js';
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
} from '../strings/narration.js';

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

    const nightResolution = evaluateNightResolution(players, actions);
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

    // --- 3. Apply wolf kill ---
    // "Not home" mechanic: any player with an active visit action is away for
    // the night. If the wolf's chosen victim is away, the kill is wasted.
    const victimId = chooseKillVictim(killTargets);
    const protectedSet = new Set(protectTargets);
    const awayPlayerIds = new Set(actions
      .filter((a) => a.action_kind === 'visit' && a.target_id)
      .map((a) => a.actor_id),
    );
    const killedIds: string[] = [];
    if (victimId && !protectedSet.has(victimId) && !awayPlayerIds.has(victimId)) {
      killedIds.push(victimId);
      await markPlayerDead(gameId, victimId);
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
    }

    // --- 4. Doctor actions ---
    // Pass only the resolved victim (not raw wolf votes) so feedback is accurate
    // even when wolves tied and no kill happened.
    // Doctor deaths from wolf retaliation are announced inline and merged back in.
    const { anySaved: doctorSavedSomeone, killedDoctorIds } = await processDoctorActions(
      players,
      actions,
      victimId !== null ? [victimId] : [],
      killedIds,
      game.channel_id ?? null,
    );
    killedIds.push(...killedDoctorIds);

    // --- 5. Harlot actions ---
    // Pass the original wolf-chosen victim (not actual kill result) — harlot dies
    // if they visited whoever the wolves intended to kill, even if doctor saved them.
    const { killedHarlotIds } = await processHarlotActions(
      players,
      visitActions,
      victimId,
      gameId,
      game.channel_id ?? null,
    );
    killedIds.push(...killedHarlotIds);

    // --- 6. Refresh player state post-kills ---
    const updatedPlayers = await getPlayersForGame(gameId);

    // --- 7. Hunter reactive shot (if the hunter was killed tonight) ---
    // The wolf victim is the single player killed by wolf vote (if not saved).
    // Doctor deaths are already announced inline and excluded from the dawn summary.
    const wolfVictim = victimId && killedIds.includes(victimId)
      ? updatedPlayers.find((p) => p.user_id === victimId) ?? null
      : null;

    const killedHunter = killedIds.length > 0
      ? updatedPlayers.find((p) => killedIds.includes(p.user_id) && p.role === 'hunter')
      : null;

    if (killedHunter) {
      const alivePlayers = updatedPlayers.filter((p) => p.is_alive);
      if (game.channel_id) {
        const lines: string[] = [dawnIntroLine()];
        if (wolfVictim) {
          lines.push(nightVictimLine(wolfVictim.user_id, wolfVictim.alignment as any));
        }
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

    // --- 8. Dawn announcement ---
    const win = evaluateWinCondition(updatedPlayers);

    if (game.channel_id) {
      const lines: string[] = [];

      if (!wolfVictim && killedDoctorIds.length === 0) {
        // Quiet night — no wolf kill, no doctor death
        lines.push(dawnNoVictimLine());
        if (doctorSavedSomeone) {
          lines.push(doctorSavedRumorLine());
        }
      } else if (wolfVictim) {
        lines.push(dawnIntroLine());
        lines.push(nightVictimLine(wolfVictim.user_id, wolfVictim.alignment as any));
      } else {
        // Only doctor deaths — already announced inline, just open the day
        lines.push(dawnIntroLine());
      }

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

    // --- 9. Schedule day voting and timeout ---
    scheduleDayVoting(gameId, upcomingDay);
    scheduleDayTimeout(gameId, upcomingDay);
  } catch (err) {
    console.error('Error resolving night phase', err);
  }
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
        const lines = [
          lynchResultLine(lynchId, lynched.alignment as any),
          hunterResolveLine(),
        ];
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
      const lines: string[] = [lynchResultLine(lynchId, lynched.alignment as any)];

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
        lines.push(hunterShotLine(hunterId, targetId, target?.alignment as any));
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

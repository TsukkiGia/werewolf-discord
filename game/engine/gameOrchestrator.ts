import {
  getGame,
  getPlayersForGame,
  getNightActionsForNight,
  markPlayerDead,
  processSeerActions,
  processDoctorActions,
  advancePhase,
  endGame,
  getVotesForDay,
  getPendingHunterShot,
  resolveHunterShotRecord,
} from '../../db.js';
import type { GamePlayerState } from '../../db/players.js';
import { postChannelMessage } from '../../utils.js';
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
  hunterResolveLine,
  nightVictimLine,
} from '../strings/narration.js';

function buildFinalRolesLines(players: GamePlayerState[]): string[] {
  const header = 'Final roles:';
  const roleLines =
    players.length > 0
      ? players.map((p) => `<@${p.user_id}> — **${p.role}**`)
      : ['No players were recorded for this game.'];
  return [header, ...roleLines];
}

async function dmNightAndSchedule(gameId: string): Promise<void> {
  const game = await getGame(gameId);
  if (!game || game.status !== 'night') return;
  const players = await getPlayersForGame(gameId);
  await dmNightActionsForAlivePlayers({ game, players });
  await scheduleNightTimeout(gameId, game.current_night);
}

export async function advanceToNightAndDmNightActions(gameId: string): Promise<void> {
  const claimed = await advancePhase(gameId, 'day'); // atomic day -> night
  if (!claimed) return;
  await dmNightAndSchedule(gameId);
}

export async function maybeResolveNight(gameId: string): Promise<void> {
  try {
    const game = await getGame(gameId);
    if (!game || game.status !== 'night') {
      return;
    }

    const nightNumber = game.current_night || 1;

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

    const { killTargets, protectTargets } = nightResolution;
    const victimId = chooseKillVictim(killTargets);

    await processSeerActions(players, actions);

    const protectedSet = new Set(protectTargets);
    const killedIds: string[] = [];
    if (victimId && !protectedSet.has(victimId)) {
      killedIds.push(victimId);
      await markPlayerDead(gameId, victimId);
    }

    // Pass only the resolved victim (not raw wolf votes) so the doctor's
    // feedback is accurate even when wolves were tied and no kill happened.
    const { anySaved: doctorSavedSomeone, killedDoctorIds } = await processDoctorActions(
      players,
      actions,
      victimId !== null ? [victimId] : [],
      killedIds,
      game.channel_id ?? null,
    );
    // Doctors killed by wolf retaliation count as night deaths.
    killedIds.push(...killedDoctorIds);

    const updatedPlayers = await getPlayersForGame(gameId);

    // Check if the killed player was the Hunter — if so, trigger their reactive shot
    const killedHunter = killedIds.length > 0
      ? updatedPlayers.find((p) => killedIds.includes(p.user_id) && p.role === 'hunter')
      : null;

    if (killedHunter) {
      const alivePlayers = updatedPlayers.filter((p) => p.is_alive);
      if (game.channel_id) {
        const victims = updatedPlayers.filter((p) => killedIds.includes(p.user_id));
        const lines: string[] = [dawnIntroLine()];
        lines.push(
          ...victims.map((v) => nightVictimLine(v.user_id, v.alignment as any)),
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

    const win = evaluateWinCondition(updatedPlayers);

    if (game.channel_id) {
      const victims = updatedPlayers.filter((p) => killedIds.includes(p.user_id));
      const lines: string[] = [];

      if (victims.length === 0) {
        lines.push(dawnNoVictimLine());
        if (doctorSavedSomeone) {
          lines.push(doctorSavedRumorLine());
        }
      } else {
        lines.push(dawnIntroLine());
        lines.push(
          ...victims.map((v) => nightVictimLine(v.user_id, v.alignment as any)),
        );
      }

      if (win) {
        lines.push(...buildWinLines(win));
        lines.push(...buildFinalRolesLines(updatedPlayers));
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

    scheduleDayVoting(gameId, upcomingDay);
    scheduleDayTimeout(gameId, upcomingDay);
  } catch (err) {
    console.error('Error resolving night phase', err);
  }
}

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

    const lynchId = resolution.lynchId;
    const lynched = players.find((p) => p.user_id === lynchId);
    if (!lynched || !lynched.is_alive) {
      return;
    }

    await markPlayerDead(gameId, lynchId);
    const updatedPlayers = await getPlayersForGame(gameId);

    // Check if the lynched player was the Hunter — if so, trigger their reactive shot
    if (lynched.role === 'hunter') {
      const alivePlayers = updatedPlayers.filter((p) => p.is_alive);
      if (game.channel_id) {
        const wasWolf = lynched.alignment === 'wolf';
        const roleSummary = wasWolf ? 'on the **wolf team**' : 'not on the **wolf team**';
        const lines = [
          `Day vote results: <@${lynchId}> was lynched. They were ${roleSummary}.`,
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

    const win = evaluateWinCondition(updatedPlayers);

    if (game.channel_id) {
      const wasWolf = lynched.alignment === 'wolf';
      const roleSummary = wasWolf ? 'a **wolf**' : 'not a **wolf**';
      const lines: string[] = [
        `Day vote results: <@${lynchId}> was lynched. They were ${roleSummary}.`,
      ];

      if (win) {
        lines.push(...buildWinLines(win));
        lines.push(...buildFinalRolesLines(updatedPlayers));
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

    await dmNightAndSchedule(gameId);
  } catch (err) {
    console.error('Error resolving day phase', err);
  }
}

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
        const wasWolf = target?.alignment === 'wolf';
        const roleSummary = wasWolf ? 'on the **wolf team**' : 'not on the **wolf team**';
        lines.push(`<@${hunterId}> was eliminated, but took <@${targetId}> down with them. They were ${roleSummary}.`);
      } else {
        lines.push(`<@${hunterId}> was eliminated and chose not to shoot.`);
      }
      if (win) {
        lines.push(...buildWinLines(win));
        lines.push(...buildFinalRolesLines(updatedPlayers));
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

    // Continue game based on continuation field
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

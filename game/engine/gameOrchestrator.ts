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
} from '../../db.js';
import { postChannelMessage } from '../../utils.js';
import { chooseKillVictim, evaluateNightResolution } from './nightResolution.js';
import { evaluateDayResolution } from './dayResolution.js';
import { evaluateWinCondition, buildWinLines } from './winConditions.js';
import {
  buildDayStartLine,
  buildNightFallsLine,
  buildNoLynchLine,
} from './status.js';
import { dmNightActionsForAlivePlayers } from './dmRoles.js';
import { scheduleDayVoting } from '../../jobs/dayVoting.js';
import { scheduleNightTimeout } from '../../jobs/nightTimeout.js';

export async function advanceToNightAndDmNightActions(gameId: string): Promise<void> {
  await advancePhase(gameId); // day -> night

  const nextGame = await getGame(gameId);
  if (!nextGame || nextGame.status !== 'night') {
    return;
  }

  const nightPlayers = await getPlayersForGame(gameId);
  await dmNightActionsForAlivePlayers({ game: nextGame, players: nightPlayers });
  await scheduleNightTimeout(gameId, nextGame.current_night);
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

    const { killTargets, protectTargets } = nightResolution;
    const victimId = chooseKillVictim(killTargets);

    await processSeerActions(players, actions);

    const protectedSet = new Set(protectTargets);
    const killedIds: string[] = [];
    if (victimId && !protectedSet.has(victimId)) {
      killedIds.push(victimId);
      await markPlayerDead(gameId, victimId);
    }

    await processDoctorActions(players, actions, killTargets, killedIds);

    const updatedPlayers = await getPlayersForGame(gameId);
    const win = evaluateWinCondition(updatedPlayers);
    const upcomingDay = (game.current_day || 0) + 1;

    if (game.channel_id) {
      const victims = updatedPlayers.filter((p) => killedIds.includes(p.user_id));
      const lines: string[] = [];

      if (victims.length === 0) {
        lines.push('Dawn breaks. No one was eliminated during the night.');
      } else {
        lines.push('Dawn breaks.');
        lines.push(
          ...victims.map(
            (v) => `<@${v.user_id}> was eliminated during the night. They were a **${v.role}**.`,
          ),
        );
      }

      if (win) {
        lines.push(...buildWinLines(win));
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

    await advancePhase(gameId);
    scheduleDayVoting(gameId, upcomingDay);
  } catch (err) {
    console.error('Error resolving night phase', err);
  }
}

export async function maybeResolveDay(gameId: string): Promise<void> {
  try {
    const game = await getGame(gameId);
    if (!game || game.status !== 'day') {
      return;
    }

    const dayNumber = game.current_day || 1;

    const players = await getPlayersForGame(gameId);
    const votes = await getVotesForDay(gameId, dayNumber);

    const resolution = evaluateDayResolution(players, votes);
    if (resolution.state === 'pending') {
      return;
    }

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

      await advanceToNightAndDmNightActions(gameId);
      return;
    }

    const lynchId = resolution.lynchId;
    const lynched = players.find((p) => p.user_id === lynchId);
    if (!lynched || !lynched.is_alive) {
      return;
    }

    await markPlayerDead(gameId, lynchId);

    const updatedPlayers = await getPlayersForGame(gameId);
    const win = evaluateWinCondition(updatedPlayers);

    if (game.channel_id) {
      const lines: string[] = [
        `Day vote results: <@${lynchId}> was lynched. They were a **${lynched.role}**.`,
      ];

      if (win) {
        lines.push(...buildWinLines(win));
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

    await advanceToNightAndDmNightActions(gameId);
  } catch (err) {
    console.error('Error resolving day phase', err);
  }
}

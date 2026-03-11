import { type Job } from 'pg-boss';
import { boss } from './dayVoting.js';
import {
  getGame,
  getPlayersForGame,
  getVotesForDay,
  recordDayVote,
} from '../db.js';

type DayTimeoutData = { gameId: string; dayNumber: number };

/**
 * Schedule a timeout for the given game/day. When the timeout fires,
 * any alive players who have not yet voted will have a "self-vote"
 * recorded so that day resolution can proceed with the existing
 * majority/no-lynch rules.
 */
export async function scheduleDayTimeout(gameId: string, dayNumber: number): Promise<void> {
  await boss.send('day-timeout', { gameId, dayNumber }, {
    // Roughly: 30s discussion before voting starts + ~60s voting window.
    startAfter: 90,
    singletonKey: `${gameId}-day-timeout-${dayNumber}`,
  });
}

export async function registerDayTimeoutWorker(
  onResolve: (gameId: string) => Promise<void>,
): Promise<void> {
  await boss.createQueue('day-timeout');
  await boss.work<DayTimeoutData>('day-timeout', async (jobs: Job<DayTimeoutData>[]) => {
    const job = jobs[0];
    if (!job) return;

    const { gameId, dayNumber } = job.data;

    const game = await getGame(gameId);
    if (!game || game.status !== 'day') return;
    if ((game.current_day || 0) !== dayNumber) return;

    const players = await getPlayersForGame(gameId);
    const votes = await getVotesForDay(gameId, dayNumber);

    const aliveIds = new Set(
      players.filter((p) => p.is_alive).map((p) => p.user_id),
    );

    const votedIds = new Set(
      votes
        .filter((v) => aliveIds.has(v.voter_id) && aliveIds.has(v.target_id))
        .map((v) => v.voter_id),
    );

    const timeoutVotePromises: Promise<boolean>[] = [];
    for (const voterId of aliveIds) {
      if (votedIds.has(voterId)) continue;

      // Record a "self-vote" so everyone counts as having voted. This preserves
      // any real majorities while ensuring no candidate reaches majority when
      // missing players abstain.
      timeoutVotePromises.push(
        recordDayVote({
          gameId,
          day: dayNumber,
          voterId,
          targetId: voterId,
        }),
      );
    }

    if (timeoutVotePromises.length > 0) {
      await Promise.all(timeoutVotePromises);
    }

    await onResolve(gameId);
  });
}


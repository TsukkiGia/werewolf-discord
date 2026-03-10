import { PgBoss, type Job } from 'pg-boss';
import { getGame, getPlayersForGame } from '../db.js';
import { startDayVoting } from '../game/engine/dmRoles.js';

type DayVotingData = { gameId: string; dayNumber: number };

export const boss = new PgBoss({ connectionString: process.env.DATABASE_URL! });

export async function scheduleDayVoting(gameId: string, dayNumber: number): Promise<void> {
  await boss.send('day-voting', { gameId, dayNumber }, {
    startAfter: 30,                              // delay in seconds
    singletonKey: `${gameId}-day-${dayNumber}`,  // deduplicate if called twice
  });
}

export async function registerWorkers(): Promise<void> {
  await boss.createQueue('day-voting');
  await boss.work<DayVotingData>('day-voting', async (jobs: Job<DayVotingData>[]) => {
    const job = jobs[0];
    if (!job) return;
    const { gameId, dayNumber } = job.data;

    const game = await getGame(gameId);
    if (!game || game.status !== 'day') return;
    if ((game.current_day || 0) !== dayNumber) return;

    const players = await getPlayersForGame(gameId);
    await startDayVoting({ game, players, dayNumber });
  });
}

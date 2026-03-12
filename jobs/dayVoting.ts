import { PgBoss, type Job } from 'pg-boss';
import { getGame, getPlayersForGame } from '../db.js';
import { startDayVoting } from '../game/engine/dmRoles.js';

type DayVotingData = { gameId: string; dayNumber: number; secondRound?: boolean };

export const boss = new PgBoss({ connectionString: process.env.DATABASE_URL! });

export async function scheduleDayVoting(
  gameId: string,
  dayNumber: number,
  secondRound = false,
): Promise<void> {
  const keySuffix = secondRound ? '-second' : '';
  const delaySeconds = secondRound ? 0 : 30;
  await boss.send('day-voting', { gameId, dayNumber, secondRound }, {
    startAfter: delaySeconds,
    singletonKey: `${gameId}-day-${dayNumber}${keySuffix}`,
  });
}

export async function registerWorkers(): Promise<void> {
  await boss.createQueue('day-voting');
  await boss.work<DayVotingData>('day-voting', async (jobs: Job<DayVotingData>[]) => {
    const job = jobs[0];
    if (!job) return;
    const { gameId, dayNumber, secondRound } = job.data;

    const game = await getGame(gameId);
    const expectedStatus = secondRound ? 'day_second_lynch' : 'day';
    if (!game || game.status !== expectedStatus) return;
    if ((game.current_day || 0) !== dayNumber) return;

    const players = await getPlayersForGame(gameId);
    await startDayVoting({ game, players, dayNumber, secondRound: !!secondRound });
  });
}

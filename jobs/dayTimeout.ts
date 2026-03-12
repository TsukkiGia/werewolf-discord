import { type Job } from 'pg-boss';
import { boss } from './dayVoting.js';
import { getGame } from '../db.js';

type DayTimeoutData = { gameId: string; dayNumber: number; secondRound?: boolean };

export async function scheduleDayTimeout(
  gameId: string,
  dayNumber: number,
  secondRound = false,
): Promise<void> {
  const keySuffix = secondRound ? '-second' : '';
  await boss.send('day-timeout', { gameId, dayNumber, secondRound }, {
    // Roughly: 30s discussion before voting starts + ~60s voting window.
    startAfter: 90,
    singletonKey: `${gameId}-day-timeout-${dayNumber}${keySuffix}`,
  });
}

export async function registerDayTimeoutWorker(
  onResolve: (gameId: string) => Promise<void>,
): Promise<void> {
  await boss.createQueue('day-timeout');
  await boss.work<DayTimeoutData>('day-timeout', async (jobs: Job<DayTimeoutData>[]) => {
    const job = jobs[0];
    if (!job) return;

    const { gameId, dayNumber, secondRound } = job.data;

    const game = await getGame(gameId);
    const expectedStatus = secondRound ? 'day_second_lynch' : 'day';
    if (!game || game.status !== expectedStatus) return;
    if ((game.current_day || 0) !== dayNumber) return;

    await onResolve(gameId);
  });
}

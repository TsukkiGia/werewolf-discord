import { type Job } from 'pg-boss';
import { boss } from './dayVoting.js';
import { getGame } from '../db.js';

type DayTimeoutData = { gameId: string; dayNumber: number };

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

    await onResolve(gameId);
  });
}

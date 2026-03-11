import { type Job } from 'pg-boss';
import { boss } from './dayVoting.js';

type HunterShotTimeoutData = { gameId: string; hunterId: string };

export async function registerHunterShotTimeoutWorker(
  onResolve: (gameId: string, hunterId: string) => Promise<void>,
): Promise<void> {
  await boss.createQueue('hunter-shot');
  await boss.work<HunterShotTimeoutData>('hunter-shot', async (jobs: Job<HunterShotTimeoutData>[]) => {
    const job = jobs[0];
    if (!job) return;
    const { gameId, hunterId } = job.data;
    await onResolve(gameId, hunterId);
  });
}

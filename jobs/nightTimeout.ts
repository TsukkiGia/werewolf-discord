import { type Job } from 'pg-boss';
import { boss } from './dayVoting.js';
import { getGame, getPlayersForGame, getNightActionsForNight, recordNightAction } from '../db.js';
import { ROLE_REGISTRY, isRoleName } from '../game/balancing/roleRegistry.js';

type NightTimeoutData = { gameId: string; nightNumber: number };

export async function scheduleNightTimeout(gameId: string, nightNumber: number): Promise<void> {
  await boss.send('night-timeout', { gameId, nightNumber }, {
    startAfter: 30,
    singletonKey: `${gameId}-night-${nightNumber}`,
  });
}

export async function registerNightWorker(
  onResolve: (gameId: string) => Promise<void>,
): Promise<void> {
  await boss.createQueue('night-timeout');
  await boss.work<NightTimeoutData>('night-timeout', async (jobs: Job<NightTimeoutData>[]) => {
    const job = jobs[0];
    if (!job) return;

    const { gameId, nightNumber } = job.data;

    const game = await getGame(gameId);
    if (!game || game.status !== 'night') return;
    if ((game.current_night || 0) !== nightNumber) return;

    const players = await getPlayersForGame(gameId);
    const actions = await getNightActionsForNight(gameId, nightNumber);
    const actedIds = new Set(actions.map((a) => a.actor_id));

    // Submit timeout actions (null target) for players who haven't acted yet.
    // Uses the role's real actionKind so night resolution messages are accurate.
    // recordNightAction uses ON CONFLICT DO NOTHING, so real submitted actions are never overwritten.
    const timeoutActionPromises: Promise<boolean>[] = [];
    for (const p of players) {
      if (!p.is_alive) continue;
      if (!isRoleName(p.role)) continue;
      const def = ROLE_REGISTRY[p.role];
      if (def.nightAction.kind === 'none') continue;
      if (actedIds.has(p.user_id)) continue;

      timeoutActionPromises.push(
        recordNightAction({
          gameId,
          night: nightNumber,
          actorId: p.user_id,
          targetId: null,
          actionKind: def.nightAction.kind,
          role: p.role,
        }),
      );
    }
    await Promise.all(timeoutActionPromises);

    await onResolve(gameId);
  });
}

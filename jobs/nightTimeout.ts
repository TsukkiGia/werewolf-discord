import { type Job } from 'pg-boss';
import { boss } from './dayVoting.js';
import {
  getGame,
  getPlayersForGame,
  getNightActionsForNight,
  recordNightAction,
  getNightActionPromptsForNight,
} from '../db.js';
import { ROLE_REGISTRY, isRoleName } from '../game/balancing/roleRegistry.js';
import { DiscordRequest, patchChannelMessage } from '../utils.js';
import {
  InteractionResponseFlags,
  MessageComponentTypes,
} from 'discord-interactions';

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

    // After submitting timeout actions, update any outstanding night-action prompts
    // to show that time has elapsed so players can no longer act.
    try {
      const prompts = await getNightActionPromptsForNight(gameId, nightNumber);
      const patchPromises = prompts
        .filter((prompt) => !actedIds.has(prompt.user_id))
        .map(async (prompt) => {
          try {
            await patchChannelMessage(prompt.channel_id, prompt.message_id, {
              flags: InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content:
                    'Time has elapsed. You can no longer submit a night action for this night.',
                },
              ],
            });
          } catch (err) {
            console.error(
              'Failed to patch expired night action prompt',
              gameId,
              nightNumber,
              prompt.user_id,
              err,
            );
          }
        });

      await Promise.all(patchPromises);
    } catch (err) {
      console.error('Error updating expired night action prompts', err);
    }

    await onResolve(gameId);
  });
}

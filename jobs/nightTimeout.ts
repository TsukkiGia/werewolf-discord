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
import { WOLF_PACK_ROLES, type RoleName } from '../game/types.js';
import { DiscordRequest, patchChannelMessage } from '../utils.js';
import {
  InteractionResponseFlags,
  MessageComponentTypes,
} from 'discord-interactions';

type NightTimeoutData = { gameId: string; nightNumber: number; secondRound?: boolean };

export async function scheduleNightTimeout(
  gameId: string,
  nightNumber: number,
  secondRound = false,
): Promise<void> {
  const keySuffix = secondRound ? '-second' : '';
  await boss.send(
    'night-timeout',
    { gameId, nightNumber, secondRound },
    {
      startAfter: 30,
      singletonKey: `${gameId}-night-${nightNumber}${keySuffix}`,
    },
  );
}

export async function registerNightWorker(
  onResolve: (gameId: string) => Promise<void>,
): Promise<void> {
  await boss.createQueue('night-timeout');
  await boss.work<NightTimeoutData>('night-timeout', async (jobs: Job<NightTimeoutData>[]) => {
    const job = jobs[0];
    if (!job) return;

    const { gameId, nightNumber, secondRound } = job.data;

    const game = await getGame(gameId);
    if (!game || game.status !== 'night') return;
    if ((game.current_night || 0) !== nightNumber) return;

    const players = await getPlayersForGame(gameId);
    const actions = await getNightActionsForNight(gameId, nightNumber, secondRound ? 2 : 1);
    const actedIds = new Set(actions.map((a) => a.actor_id));

    // Submit timeout actions (null target) for players who haven't acted this round.
    // recordNightAction uses ON CONFLICT DO NOTHING, so real submitted actions are never overwritten.
    const timeoutActionPromises: Promise<boolean>[] = [];
    if (secondRound) {
      const wolves = players.filter(
        (p) => p.is_alive && WOLF_PACK_ROLES.has(p.role as RoleName),
      );
      for (const p of wolves) {
        if (actedIds.has(p.user_id)) continue;
        timeoutActionPromises.push(
          recordNightAction({
            gameId,
            night: nightNumber,
            round: 2,
            actorId: p.user_id,
            targetId: null,
            actionKind: 'kill',
            role: p.role as RoleName,
          }),
        );
      }
    } else {
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
            round: 1,
            actorId: p.user_id,
            targetId: null,
            actionKind: def.nightAction.kind,
            role: p.role,
          }),
        );
      }
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

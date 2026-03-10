import { pool } from './client.js';
import type { NightActionKind, RoleName } from '../game/types.js';
import type { GamePlayerState } from './players.js';
import { DiscordRequest } from '../utils.js';

export interface NightActionRow {
  id: number;
  game_id: string;
  night: number;
  actor_id: string;
  target_id: string | null;
  action_kind: NightActionKind;
  role: RoleName;
  created_at: number;
}

export async function recordNightAction(params: {
  gameId: string;
  night: number;
  actorId: string;
  targetId: string | null;
  actionKind: NightActionKind;
  role: RoleName;
}): Promise<boolean> {
  const createdAt = Date.now();
  const result = await pool.query(
    `
    INSERT INTO night_actions (game_id, night, actor_id, target_id, action_kind, role, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (game_id, night, actor_id) DO NOTHING
    `,
    [
      params.gameId,
      params.night,
      params.actorId,
      params.targetId,
      params.actionKind,
      params.role,
      createdAt,
    ],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function hasNightAction(
  gameId: string,
  night: number,
  actorId: string,
): Promise<boolean> {
  const result = await pool.query(
    `
    SELECT 1
    FROM night_actions
    WHERE game_id = $1 AND night = $2 AND actor_id = $3
    LIMIT 1
    `,
    [gameId, night, actorId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function getNightActionsForNight(
  gameId: string,
  night: number,
): Promise<NightActionRow[]> {
  const result = await pool.query<NightActionRow>(
    `
    SELECT id, game_id, night, actor_id, target_id, action_kind, role, created_at
    FROM night_actions
    WHERE game_id = $1 AND night = $2
    ORDER BY created_at ASC
    `,
    [gameId, night],
  );

  return result.rows;
}

/**
 * Process all seer-type night actions by DMing inspection results.
 * Players is the pre-kill snapshot so seers always receive their result,
 * even if their target is killed later the same night.
 */
export async function processSeerActions(
  players: GamePlayerState[],
  actions: NightActionRow[],
): Promise<void> {
  const inspectActions = actions.filter(
    (a) => a.action_kind === 'inspect' && a.target_id,
  );

  await Promise.all(
    inspectActions.map(async (action) => {
      const target = players.find((p) => p.user_id === action.target_id);
      if (!target) return;

      try {
        const dmRes = await DiscordRequest('users/@me/channels', {
          method: 'POST',
          body: { recipient_id: action.actor_id },
        });
        const dmChannel = (await dmRes.json()) as { id: string };

        await DiscordRequest(`channels/${dmChannel.id}/messages`, {
          method: 'POST',
          body: {
            content: `Your vision reveals that <@${target.user_id}> is **${target.role}**.`,
          },
        });
      } catch (err) {
        console.error('Failed to DM seer inspection result', err);
      }
    }),
  );
}

/**
 * Process doctor-type actions by DMing whether their protection
 * actually blocked a wolf attack or not.
 */
export async function processDoctorActions(
  players: GamePlayerState[],
  actions: NightActionRow[],
  killTargets: string[],
  killedIds: string[],
): Promise<void> {
  const protectActions = actions.filter(
    (a) => a.action_kind === 'protect' && a.target_id,
  );

  await Promise.all(
    protectActions.map(async (action) => {
      const target = players.find((p) => p.user_id === action.target_id);
      if (!target) return;

      const targetId = target.user_id;
      const wasTargetedByWolves = killTargets.includes(targetId);
      const wasKilled = killedIds.includes(targetId);
      const saved = wasTargetedByWolves && !wasKilled;

      const base =
        saved
          ? `You protected <@${targetId}>. They were attacked and you saved them from death.`
          : wasTargetedByWolves && wasKilled
            ? `You protected <@${targetId}>, but they were still eliminated.`
            : `You protected <@${targetId}>. They were not attacked tonight.`;

      try {
        const dmRes = await DiscordRequest('users/@me/channels', {
          method: 'POST',
          body: { recipient_id: action.actor_id },
        });
        const dmChannel = (await dmRes.json()) as { id: string };

        await DiscordRequest(`channels/${dmChannel.id}/messages`, {
          method: 'POST',
          body: { content: base },
        });
      } catch (err) {
        console.error('Failed to DM doctor protection result', err);
      }
    }),
  );
}

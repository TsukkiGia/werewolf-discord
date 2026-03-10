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
}): Promise<void> {
  const createdAt = Date.now();
  await pool.query(
    `
    INSERT INTO night_actions (game_id, night, actor_id, target_id, action_kind, role, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (game_id, night, actor_id)
    DO UPDATE SET target_id = EXCLUDED.target_id,
                  action_kind = EXCLUDED.action_kind,
                  role = EXCLUDED.role,
                  created_at = EXCLUDED.created_at
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
 * Only reveals info for targets that are still alive.
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
      if (!target || !target.is_alive) return;

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


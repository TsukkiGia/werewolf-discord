import { pool } from './client.js';
import type { NightActionKind, RoleName } from '../game/types.js';

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


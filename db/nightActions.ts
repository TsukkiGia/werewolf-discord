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

export interface NightActionPromptRow {
  game_id: string;
  night: number;
  user_id: string;
  channel_id: string;
  message_id: string;
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

export async function recordNightActionPrompt(params: {
  gameId: string;
  night: number;
  userId: string;
  channelId: string;
  messageId: string;
}): Promise<void> {
  await pool.query(
    `
    INSERT INTO night_action_prompts (game_id, night, user_id, channel_id, message_id)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (game_id, night, user_id)
    DO UPDATE SET channel_id = EXCLUDED.channel_id,
                  message_id = EXCLUDED.message_id
    `,
    [params.gameId, params.night, params.userId, params.channelId, params.messageId],
  );
}

export async function getNightActionPromptsForNight(
  gameId: string,
  night: number,
): Promise<NightActionPromptRow[]> {
  const result = await pool.query<NightActionPromptRow>(
    `
    SELECT game_id, night, user_id, channel_id, message_id
    FROM night_action_prompts
    WHERE game_id = $1 AND night = $2
    `,
    [gameId, night],
  );

  return result.rows;
}

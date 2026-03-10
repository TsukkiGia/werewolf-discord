import { pool } from './client.js';

export async function addPlayer(gameId: string, userId: string): Promise<void> {
  const joinedAt = Date.now();
  await pool.query(
    `
    INSERT INTO game_players (game_id, user_id, role, is_alive, joined_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (game_id, user_id) DO NOTHING
    `,
    [gameId, userId, 'unassigned', true, joinedAt],
  );
}

export async function getPlayerIdsForGame(gameId: string): Promise<string[]> {
  const result = await pool.query<{ user_id: string }>(
    `
    SELECT user_id
    FROM game_players
    WHERE game_id = $1
    ORDER BY joined_at ASC
    `,
    [gameId],
  );

  return result.rows.map((row) => row.user_id);
}


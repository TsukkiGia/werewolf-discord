import { pool } from './client.js';

export async function addCultMember(gameId: string, userId: string): Promise<void> {
  await pool.query(
    `
    INSERT INTO cult_members (game_id, user_id, joined_at)
    VALUES ($1, $2, $3)
    ON CONFLICT (game_id, user_id) DO NOTHING
    `,
    [gameId, userId, Date.now()],
  );
}

export async function getCultMemberIds(gameId: string): Promise<string[]> {
  const result = await pool.query<{ user_id: string }>(
    `
    SELECT user_id
    FROM cult_members
    WHERE game_id = $1
    ORDER BY joined_at ASC
    `,
    [gameId],
  );
  return result.rows.map((r) => r.user_id);
}

/** Returns the user_id of the most recently added cult member, or null if none. */
export async function getNewestCultMemberId(gameId: string): Promise<string | null> {
  const result = await pool.query<{ user_id: string }>(
    `
    SELECT user_id
    FROM cult_members
    WHERE game_id = $1
    ORDER BY joined_at DESC
    LIMIT 1
    `,
    [gameId],
  );
  return result.rows[0]?.user_id ?? null;
}

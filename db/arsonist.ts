import { pool } from './client.js';

export async function getDousedTargets(gameId: string): Promise<string[]> {
  const result = await pool.query<{ target_id: string }>(
    `
    SELECT target_id
    FROM arsonist_douses
    WHERE game_id = $1
    `,
    [gameId],
  );
  return result.rows.map((r) => r.target_id);
}

export async function addDousedTarget(gameId: string, targetId: string): Promise<void> {
  await pool.query(
    `
    INSERT INTO arsonist_douses (game_id, target_id)
    VALUES ($1, $2)
    ON CONFLICT (game_id, target_id) DO NOTHING
    `,
    [gameId, targetId],
  );
}

export async function clearDousedTargets(gameId: string): Promise<void> {
  await pool.query(
    `
    DELETE FROM arsonist_douses
    WHERE game_id = $1
    `,
    [gameId],
  );
}


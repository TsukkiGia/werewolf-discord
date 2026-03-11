import { pool } from './client.js';

interface LoversRow {
  game_id: string;
  lover_a_id: string;
  lover_b_id: string;
}

export async function recordLovers(params: {
  gameId: string;
  loverAId: string;
  loverBId: string;
}): Promise<void> {
  await pool.query(
    `
    INSERT INTO game_lovers (game_id, lover_a_id, lover_b_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (game_id)
    DO UPDATE SET lover_a_id = EXCLUDED.lover_a_id,
                  lover_b_id = EXCLUDED.lover_b_id
    `,
    [params.gameId, params.loverAId, params.loverBId],
  );
}

export async function getLovers(
  gameId: string,
): Promise<{ loverAId: string; loverBId: string } | null> {
  const result = await pool.query<LoversRow>(
    `
    SELECT game_id, lover_a_id, lover_b_id
    FROM game_lovers
    WHERE game_id = $1
    `,
    [gameId],
  );

  const row = result.rows[0];
  if (!row) return null;
  return { loverAId: row.lover_a_id, loverBId: row.lover_b_id };
}


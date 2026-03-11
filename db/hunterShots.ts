import { pool } from './client.js';

export interface HunterShotRow {
  id: number;
  game_id: string;
  hunter_id: string;
  continuation: string;
  target_id: string | null;
  resolved: boolean;
  created_at: number;
}

/**
 * Insert a new pending hunter shot. Returns false if one already exists
 * (ON CONFLICT DO NOTHING).
 */
export async function createHunterShot(params: {
  gameId: string;
  hunterId: string;
  continuation: string;
}): Promise<boolean> {
  const createdAt = Date.now();
  const result = await pool.query(
    `
    INSERT INTO hunter_shots (game_id, hunter_id, continuation, created_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (game_id, hunter_id) DO NOTHING
    `,
    [params.gameId, params.hunterId, params.continuation, createdAt],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Get a pending (unresolved) hunter shot for this hunter in this game.
 */
export async function getPendingHunterShot(
  gameId: string,
  hunterId: string,
): Promise<HunterShotRow | null> {
  const result = await pool.query<HunterShotRow>(
    `
    SELECT id, game_id, hunter_id, continuation, target_id, resolved, created_at
    FROM hunter_shots
    WHERE game_id = $1 AND hunter_id = $2 AND resolved = FALSE
    LIMIT 1
    `,
    [gameId, hunterId],
  );
  return result.rows[0] ?? null;
}

/**
 * Atomically mark the shot as resolved (only if currently unresolved).
 * Returns true if successfully claimed.
 */
export async function resolveHunterShotRecord(
  gameId: string,
  hunterId: string,
  targetId: string | null,
): Promise<boolean> {
  const result = await pool.query(
    `
    UPDATE hunter_shots
    SET resolved = TRUE, target_id = $3
    WHERE game_id = $1 AND hunter_id = $2 AND resolved = FALSE
    `,
    [gameId, hunterId, targetId],
  );
  return (result.rowCount ?? 0) > 0;
}

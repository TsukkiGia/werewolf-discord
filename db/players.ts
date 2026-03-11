import { pool } from './client.js';
import { assignRolesForPlayerIds } from '../game/engine/assignRoles.js';
import type { AssignedRole, Alignment, RoleName } from '../game/types.js';

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

interface PlayerRow {
  id: number;
  user_id: string;
}

export async function assignRolesForGame(gameId: string): Promise<AssignedRole[]> {
  const result = await pool.query<PlayerRow>(
    `
    SELECT id, user_id
    FROM game_players
    WHERE game_id = $1
    ORDER BY joined_at ASC
    `,
    [gameId],
  );

  const players = result.rows.map((p) => p.user_id);
  if (players.length === 0) return [];

  const assignments = assignRolesForPlayerIds(players);

  // Persist roles
  await Promise.all(
    assignments.map((assignment) =>
      pool.query(
        `
        UPDATE game_players
        SET role = $1,
            alignment = $2
        WHERE game_id = $3 AND user_id = $4
        `,
        [assignment.role, assignment.alignment, gameId, assignment.userId],
      ),
    ),
  );

  return assignments;
}

export interface GamePlayerState {
  user_id: string;
  role: string;
  alignment: Alignment | null;
  is_alive: boolean;
}

export async function getPlayersForGame(gameId: string): Promise<GamePlayerState[]> {
  const result = await pool.query<GamePlayerState>(
    `
    SELECT user_id, role, alignment, is_alive
    FROM game_players
    WHERE game_id = $1
    `,
    [gameId],
  );

  return result.rows;
}

export async function markPlayerDead(gameId: string, userId: string): Promise<void> {
  await pool.query(
    `
    UPDATE game_players
    SET is_alive = FALSE
    WHERE game_id = $1 AND user_id = $2
    `,
    [gameId, userId],
  );
}

export async function setPlayerRoleAndAlignment(
  gameId: string,
  userId: string,
  role: RoleName,
  alignment: Alignment,
): Promise<void> {
  await pool.query(
    `
    UPDATE game_players
    SET role = $1,
        alignment = $2
    WHERE game_id = $3 AND user_id = $4
    `,
    [role, alignment, gameId, userId],
  );
}

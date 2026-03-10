import { pool } from './client.js';

export type GameStatus = 'lobby' | 'night' | 'day' | 'ended';

export interface GameRow {
  id: string;
  guild_id: string | null;
  channel_id: string | null;
  host_id: string;
  status: GameStatus;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
}

export async function createGame(params: {
  id: string;
  guildId: string | null;
  channelId: string | null;
  hostId: string;
}): Promise<void> {
  const createdAt = Date.now();
  await pool.query(
    `
    INSERT INTO games (id, guild_id, channel_id, host_id, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO NOTHING
    `,
    [params.id, params.guildId, params.channelId, params.hostId, 'lobby', createdAt],
  );
}

export async function getGame(id: string): Promise<GameRow | null> {
  const result = await pool.query<GameRow>('SELECT * FROM games WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function getActiveGameForChannel(
  guildId: string | null,
  channelId: string | null,
): Promise<GameRow | null> {
  if (!channelId) return null;

  const result = await pool.query<GameRow>(
    `
    SELECT *
    FROM games
    WHERE channel_id = $1
      AND ($2::text IS NULL OR guild_id = $2)
      AND status <> 'ended'
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [channelId, guildId],
  );

  return result.rows[0] ?? null;
}

export async function endGame(gameId: string): Promise<void> {
  const endedAt = Date.now();
  await pool.query(
    `
    UPDATE games
    SET status = $1,
        ended_at = $2
    WHERE id = $3
    `,
    ['ended', endedAt, gameId],
  );
}

export async function startGame(gameId: string): Promise<void> {
  const startedAt = Date.now();
  await pool.query(
    `
    UPDATE games
    SET status = $1,
        started_at = $2
    WHERE id = $3
    `,
    ['night', startedAt, gameId],
  );
}

export function nextPhase(status: GameStatus): GameStatus {
  if (status === 'lobby') return 'night';
  if (status === 'night') return 'day';
  if (status === 'day') return 'night';
  return status;
}

export async function advancePhase(gameId: string): Promise<GameStatus | null> {
  const game = await getGame(gameId);
  if (!game || game.status === 'ended') {
    return null;
  }

  const newStatus = nextPhase(game.status);

  await pool.query(
    `
    UPDATE games
    SET status = $1
    WHERE id = $2
    `,
    [newStatus, gameId],
  );

  return newStatus;
}

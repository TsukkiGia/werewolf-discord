import pg from 'pg';

export type GameStatus = 'lobby' | 'running' | 'ended';

export interface GameRow {
  id: string;
  guild_id: string | null ;
  channel_id: string | null;
  host_id: string;
  status: GameStatus;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
}

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL must be set in the environment to use Postgres (e.g., from Heroku or Render).',
  );
}

export const pool = new Pool({
  connectionString,
});

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      guild_id TEXT,
      channel_id TEXT,
      host_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      started_at BIGINT,
      ended_at BIGINT
    );

    CREATE TABLE IF NOT EXISTS game_players (
      id SERIAL PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      alignment TEXT,
      is_alive BOOLEAN NOT NULL DEFAULT TRUE,
      joined_at BIGINT NOT NULL,
      left_at BIGINT,
      UNIQUE (game_id, user_id)
    );
  `);
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
    ['running', startedAt, gameId],
  );
}


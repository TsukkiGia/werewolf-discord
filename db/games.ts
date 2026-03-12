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
  current_day: number;
  current_night: number;
  join_message_id: string | null;
  wolf_extra_kills_next_night: number;
  troublemaker_double_lynch_day: number | null;
}

export async function createGame(params: {
  id: string;
  guildId: string | null;
  channelId: string | null;
  hostId: string;
}): Promise<boolean> {
  const createdAt = Date.now();
  try {
    await pool.query(
      `
      INSERT INTO games (id, guild_id, channel_id, host_id, status, created_at, current_day, current_night)
      VALUES ($1, $2, $3, $4, $5, $6, 0, 0)
      `,
      [params.id, params.guildId, params.channelId, params.hostId, 'lobby', createdAt],
    );
    return true;
  } catch (err: unknown) {
    // 23505 = unique_violation (e.g., due to active_games_per_channel index or id PK).
    const maybePgErr = err as { code?: unknown } | null;
    if (maybePgErr && typeof maybePgErr.code === 'string') {
      if (maybePgErr.code === '23505') {
        return false;
      }
    }
    throw err;
  }
}

export async function getGame(id: string): Promise<GameRow | null> {
  const result = await pool.query<GameRow>('SELECT * FROM games WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function setJoinMessageId(gameId: string, messageId: string): Promise<void> {
  await pool.query(
    `
    UPDATE games
    SET join_message_id = $1
    WHERE id = $2
    `,
    [messageId, gameId],
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

export async function incrementWolfExtraKillsForNextNight(gameId: string): Promise<void> {
  await pool.query(
    `
    UPDATE games
    SET wolf_extra_kills_next_night = 1
    WHERE id = $1
    `,
    [gameId],
  );
}

export async function clearWolfExtraKillsForNextNight(gameId: string): Promise<void> {
  await pool.query(
    `
    UPDATE games
    SET wolf_extra_kills_next_night = 0
    WHERE id = $1
    `,
    [gameId],
  );
}

export async function setTroublemakerDoubleLynchDay(
  gameId: string,
  day: number,
): Promise<boolean> {
  const result = await pool.query(
    `
    UPDATE games
    SET troublemaker_double_lynch_day = $1
    WHERE id = $2 AND troublemaker_double_lynch_day IS NULL
    `,
    [day, gameId],
  );
  return (result.rowCount ?? 0) > 0;
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

export async function startGame(gameId: string): Promise<boolean> {
  const startedAt = Date.now();
  const result = await pool.query(
    `
    UPDATE games
    SET status = $1,
        started_at = $2,
        current_night = current_night + 1
    WHERE id = $3 AND status = 'lobby'
    `,
    ['night', startedAt, gameId],
  );

  // rowCount can be null in the pg typings, so normalize to 0.
  return (result.rowCount ?? 0) > 0;
}

export function nextPhase(status: GameStatus): GameStatus {
  if (status === 'lobby') return 'night';
  if (status === 'night') return 'day';
  if (status === 'day') return 'night';
  return status;
}

/**
 * Atomically advance the game phase. Optionally pass `requiredStatus` to only
 * advance if the game is currently in that exact status — if another concurrent
 * call already advanced it, the underlying UPDATE will match 0 rows and this
 * returns null, making the operation safe to call concurrently.
 */
export async function advancePhase(
  gameId: string,
  requiredStatus?: GameStatus,
): Promise<GameStatus | null> {
  const game = await getGame(gameId);
  if (!game || game.status === 'ended') {
    return null;
  }

  if (requiredStatus !== undefined && game.status !== requiredStatus) {
    return null;
  }

  const currentStatus = game.status;
  const newStatus = nextPhase(currentStatus);

  let newDay = game.current_day;
  let newNight = game.current_night;

  if (currentStatus === 'lobby' && newStatus === 'night') {
    newNight += 1;
  } else if (currentStatus === 'night' && newStatus === 'day') {
    newDay += 1;
  } else if (currentStatus === 'day' && newStatus === 'night') {
    newNight += 1;
  }

  const result = await pool.query(
    `
    UPDATE games
    SET status = $1,
        current_day = $2,
        current_night = $3
    WHERE id = $4 AND status = $5
    `,
    [newStatus, newDay, newNight, gameId, currentStatus],
  );

  if ((result.rowCount ?? 0) === 0) {
    return null;
  }

  return newStatus;
}

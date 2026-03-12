import { pool } from './client.js';

export interface DayVoteRow {
  id: number;
  game_id: string;
  day: number;
  round: number;
  voter_id: string;
  target_id: string;
  created_at: number;
}

export async function recordDayVote(params: {
  gameId: string;
  day: number;
  round: number;
  voterId: string;
  targetId: string;
}): Promise<boolean> {
  const createdAt = Date.now();
  const result = await pool.query(
    `
    INSERT INTO day_votes (game_id, day, round, voter_id, target_id, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (game_id, day, round, voter_id) DO NOTHING
    `,
    [params.gameId, params.day, params.round, params.voterId, params.targetId, createdAt],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function hasDayVote(
  gameId: string,
  day: number,
  round: number,
  voterId: string,
): Promise<boolean> {
  const result = await pool.query(
    `
    SELECT 1
    FROM day_votes
    WHERE game_id = $1 AND day = $2 AND round = $3 AND voter_id = $4
    LIMIT 1
    `,
    [gameId, day, round, voterId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function getVotesForDay(
  gameId: string,
  day: number,
  round: number,
): Promise<DayVoteRow[]> {
  const result = await pool.query<DayVoteRow>(
    `
    SELECT id, game_id, day, round, voter_id, target_id, created_at
    FROM day_votes
    WHERE game_id = $1 AND day = $2 AND round = $3
    ORDER BY created_at ASC
    `,
    [gameId, day, round],
  );

  return result.rows;
}

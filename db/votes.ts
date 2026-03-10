import { pool } from './client.js';

export interface DayVoteRow {
  id: number;
  game_id: string;
  day: number;
  voter_id: string;
  target_id: string;
  created_at: number;
}

export async function recordDayVote(params: {
  gameId: string;
  day: number;
  voterId: string;
  targetId: string;
}): Promise<void> {
  const createdAt = Date.now();
  await pool.query(
    `
    INSERT INTO day_votes (game_id, day, voter_id, target_id, created_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (game_id, day, voter_id)
    DO UPDATE SET target_id = EXCLUDED.target_id,
                  created_at = EXCLUDED.created_at
    `,
    [params.gameId, params.day, params.voterId, params.targetId, createdAt],
  );
}

export async function getVotesForDay(
  gameId: string,
  day: number,
): Promise<DayVoteRow[]> {
  const result = await pool.query<DayVoteRow>(
    `
    SELECT id, game_id, day, voter_id, target_id, created_at
    FROM day_votes
    WHERE game_id = $1 AND day = $2
    ORDER BY created_at ASC
    `,
    [gameId, day],
  );

  return result.rows;
}


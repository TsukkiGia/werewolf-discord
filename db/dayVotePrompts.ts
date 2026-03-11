import { pool } from './client.js';

export interface DayVotePromptRow {
  game_id: string;
  day: number;
  user_id: string;
  channel_id: string;
  message_id: string;
}

export async function recordDayVotePrompt(params: {
  gameId: string;
  day: number;
  userId: string;
  channelId: string;
  messageId: string;
}): Promise<void> {
  await pool.query(
    `
    INSERT INTO day_vote_prompts (game_id, day, user_id, channel_id, message_id)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (game_id, day, user_id)
    DO UPDATE SET channel_id = EXCLUDED.channel_id, message_id = EXCLUDED.message_id
    `,
    [params.gameId, params.day, params.userId, params.channelId, params.messageId],
  );
}

export async function getDayVotePrompts(
  gameId: string,
  day: number,
): Promise<DayVotePromptRow[]> {
  const result = await pool.query<DayVotePromptRow>(
    `
    SELECT game_id, day, user_id, channel_id, message_id
    FROM day_vote_prompts
    WHERE game_id = $1 AND day = $2
    `,
    [gameId, day],
  );
  return result.rows;
}

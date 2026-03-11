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

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS current_day INTEGER NOT NULL DEFAULT 0;

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS current_night INTEGER NOT NULL DEFAULT 0;

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS join_message_id TEXT;

-- Ensure at most one non-ended game per (channel, guild) pair.
CREATE UNIQUE INDEX IF NOT EXISTS active_games_per_channel
  ON games (channel_id, guild_id)
  WHERE status <> 'ended';

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

CREATE TABLE IF NOT EXISTS night_actions (
  id SERIAL PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  night INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  target_id TEXT,
  action_kind TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (game_id, night, actor_id)
);

CREATE TABLE IF NOT EXISTS night_action_prompts (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  night INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  PRIMARY KEY (game_id, night, user_id)
);

CREATE TABLE IF NOT EXISTS day_votes (
  id SERIAL PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  voter_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (game_id, day, voter_id)
);

CREATE TABLE IF NOT EXISTS hunter_shots (
  id SERIAL PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  hunter_id TEXT NOT NULL,
  continuation TEXT NOT NULL,
  target_id TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL,
  UNIQUE (game_id, hunter_id)
);

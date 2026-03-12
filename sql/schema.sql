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

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS wolf_extra_kills_next_night INTEGER NOT NULL DEFAULT 0;

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS troublemaker_double_lynch_day INTEGER;

-- 'day_second_lynch' is a valid status value; no schema change needed (stored as TEXT).

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
  round INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL,
  target_id TEXT,
  action_kind TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (game_id, night, round, actor_id)
);

-- Migration: add round column and update unique constraint for existing tables.
ALTER TABLE night_actions
  ADD COLUMN IF NOT EXISTS round INTEGER NOT NULL DEFAULT 1;
ALTER TABLE night_actions
  DROP CONSTRAINT IF EXISTS night_actions_game_id_night_actor_id_key;
ALTER TABLE night_actions
  ADD CONSTRAINT night_actions_game_night_round_actor
    UNIQUE (game_id, night, round, actor_id);

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
  round INTEGER NOT NULL DEFAULT 1,
  voter_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (game_id, day, round, voter_id)
);

-- Migration: add round column and update unique constraint for existing tables.
ALTER TABLE day_votes ADD COLUMN IF NOT EXISTS round INTEGER NOT NULL DEFAULT 1;
ALTER TABLE day_votes DROP CONSTRAINT IF EXISTS day_votes_game_id_day_voter_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS day_votes_game_day_round_voter
  ON day_votes (game_id, day, round, voter_id);

CREATE TABLE IF NOT EXISTS day_vote_prompts (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  PRIMARY KEY (game_id, day, user_id)
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

CREATE TABLE IF NOT EXISTS arsonist_douses (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  PRIMARY KEY (game_id, target_id)
);

CREATE TABLE IF NOT EXISTS cult_members (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  joined_at BIGINT NOT NULL,
  PRIMARY KEY (game_id, user_id)
);

CREATE TABLE IF NOT EXISTS game_lovers (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  lover_a_id TEXT NOT NULL,
  lover_b_id TEXT NOT NULL,
  PRIMARY KEY (game_id)
);

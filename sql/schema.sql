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

CREATE TABLE IF NOT EXISTS day_votes (
  id SERIAL PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  voter_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE (game_id, day, voter_id)
);


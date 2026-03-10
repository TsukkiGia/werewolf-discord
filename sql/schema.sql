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


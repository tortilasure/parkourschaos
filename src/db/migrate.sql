-- Запусти этот SQL в Supabase: SQL Editor → New query → Run
-- Создаёт все таблицы для игры Random Parkour Mayhem

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS time_attack_scores (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  time_ms INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS time_attack_scores_time_ms_idx ON time_attack_scores(time_ms);

CREATE TABLE IF NOT EXISTS mini_scores (
  name TEXT PRIMARY KEY,
  time_ms INTEGER NOT NULL,
  plays INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mini_scores_time_ms_idx ON mini_scores(time_ms);

-- Multiplayer rooms (shared across Netlify instances)
CREATE TABLE IF NOT EXISTS net_rooms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS net_rooms_code_idx ON net_rooms(code);
CREATE INDEX IF NOT EXISTS net_rooms_kind_status_idx ON net_rooms(kind, status);

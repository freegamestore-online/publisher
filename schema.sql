-- FGS Publisher — D1 schema (binding: DB, database: fgs-publisher)
--
-- Backs the VibeCode "projects" index: a listable set of a creator's agent
-- sessions (drafts + deployed games). The full transcript also lives in the
-- agent worker's Durable Object; this table exists because DOs aren't
-- queryable, so the project picker needs a listable index keyed by user.
--
-- Apply:  npx wrangler d1 execute fgs-publisher --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS agent_sessions (
  session_id   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,          -- sub ("github:<id>") or github login
  user_login   TEXT,                   -- github login (display)
  name         TEXT,
  app_id       TEXT,
  app_url      TEXT,
  deployed     INTEGER NOT NULL DEFAULT 0,
  messages     TEXT,                   -- JSON array (last ~300 msgs, <=2MB)
  deploy_state TEXT,                   -- JSON
  deploy_log   TEXT,                   -- JSON
  errors       TEXT,                   -- JSON
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- List query: WHERE user_id = ? ORDER BY updated_at DESC
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user
  ON agent_sessions (user_id, updated_at DESC);

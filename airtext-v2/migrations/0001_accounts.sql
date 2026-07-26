-- Adds accounts/roles and prepares notes/files for multi-file batches and
-- Phase 6 bonus features (burn-after-reading, client-side encryption).
-- Purely additive: new tables, and nullable/defaulted columns on existing
-- tables -- existing routes/rows are completely unaffected. Safe to apply
-- to production immediately.
--
-- NOT included here: the files/network_files restructuring around
-- file_groups (see file_groups below) -- that lands in the Phase 5
-- migration alongside the route changes that actually use it, so every
-- migration leaves the app in a fully working state.

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rank INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  default_limits TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_roles_rank ON roles(rank);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  custom_limits TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);

CREATE TABLE IF NOT EXISTS file_groups (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  title TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  pin_salt TEXT,
  pin_hash TEXT,
  code TEXT NOT NULL UNIQUE,
  delete_token_hash TEXT NOT NULL,
  total_size_bytes INTEGER NOT NULL,
  burn_after_read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_groups_code ON file_groups(code);
CREATE INDEX IF NOT EXISTS idx_file_groups_expires ON file_groups(expires_at);
CREATE INDEX IF NOT EXISTS idx_file_groups_created ON file_groups(created_at DESC);

-- Seed the 3 system roles. "unlimited" for admin is enforced in code
-- (src/lib/limits.ts), not by these numbers -- they're placeholders that
-- are never read for rank 0.
INSERT OR IGNORE INTO roles (rank, name, is_system, default_limits, created_at) VALUES
  (0, 'Admin', 1, '{}', 0),
  (1, 'Contributor', 1, '{"ttlSeconds":172800,"maxTextLength":20000,"maxFileSizeMB":20,"maxBatchTotalMB":100,"maxFilesPerBatch":20,"fileTtlSeconds":172800,"allowCustomCode":true,"allowClientEncryption":true}', 0),
  (2, 'Pro', 1, '{"ttlSeconds":86400,"maxTextLength":15000,"maxFileSizeMB":5,"maxBatchTotalMB":50,"maxFilesPerBatch":10,"fileTtlSeconds":86400,"allowCustomCode":true,"allowClientEncryption":true}', 0);

ALTER TABLE notes ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE notes ADD COLUMN burn_after_read INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN body_encrypted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN encryption_iv TEXT;

ALTER TABLE files ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE files ADD COLUMN burn_after_read INTEGER NOT NULL DEFAULT 0;

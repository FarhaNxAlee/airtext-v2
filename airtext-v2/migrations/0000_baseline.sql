-- Baseline migration: matches the schema already live in the real `airtext`
-- D1 database (created at runtime by ensureD1Schema() in v1, see
-- airtext-worker-modern.js:1457-1567). Every statement is idempotent, so
-- running this against production is a safe no-op — it only matters for
-- fresh local/dev databases going forward.

CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- v1 seeded this row on every request via ensureD1Schema(); getSiteSettings()
-- already falls back to defaults if it's missing, but seed it here too so a
-- fresh DB matches production's shape from the start (the admin settings
-- UPDATE also upserts defensively -- see src/routes/admin.ts).
INSERT OR IGNORE INTO site_settings (id, data, updated_at) VALUES (1, '{}', 0);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  pin_salt TEXT,
  pin_hash TEXT,
  code TEXT NOT NULL UNIQUE,
  delete_token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_code ON notes(code);
CREATE INDEX IF NOT EXISTS idx_notes_expires ON notes(expires_at);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);

CREATE TABLE IF NOT EXISTS network_notes (
  room_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('mine', 'received')),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, note_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_network_notes_room ON network_notes(room_id, added_at DESC);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  pin_salt TEXT,
  pin_hash TEXT,
  code TEXT NOT NULL UNIQUE,
  delete_token_hash TEXT NOT NULL,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_code ON files(code);
CREATE INDEX IF NOT EXISTS idx_files_expires ON files(expires_at);
CREATE INDEX IF NOT EXISTS idx_files_created ON files(created_at DESC);

CREATE TABLE IF NOT EXISTS network_files (
  room_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('mine', 'received')),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, file_id),
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_network_files_room ON network_files(room_id, added_at DESC);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);

CREATE TABLE IF NOT EXISTS analytics (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  at INTEGER NOT NULL,
  date TEXT NOT NULL,
  network TEXT NOT NULL,
  device TEXT NOT NULL,
  via TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics(date);
CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics(type);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at);

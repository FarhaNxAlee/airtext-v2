-- Restructures files/network_files around file_groups (added empty and
-- unused in 0001_accounts.sql) -- one share code per upload BATCH instead
-- of per file, so multiple files can be attached to a single link/code.
--
-- DROP+CREATE, not ALTER, because every per-share field (title, PIN,
-- code, expiry, delete token, room_id, user_id, burn_after_read) moves
-- from `files` to `file_groups`; there's no reasonable ALTER path for a
-- restructuring this shaped. Confirmed safe against production: 0 rows
-- in `files`/`network_files` immediately before this migration (checked
-- via `wrangler d1 execute airtext --remote` as part of this cutover --
-- see the plan's Verification section).

DROP TABLE IF EXISTS network_files;
DROP TABLE IF EXISTS files;

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES file_groups(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_group ON files(group_id);

CREATE TABLE network_files (
  room_id TEXT NOT NULL,
  group_id TEXT NOT NULL REFERENCES file_groups(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('mine', 'received')),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_network_files_room ON network_files(room_id, added_at DESC);

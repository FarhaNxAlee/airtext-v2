-- Additive runtime state. Never copy drop bodies or secrets into audit history.
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN consumed_at INTEGER;
CREATE TABLE object_deletions (
  r2_key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
UPDATE audit_log SET before_json = NULL, after_json = NULL WHERE target_type = 'note';
DELETE FROM network_notes WHERE note_id IN (SELECT id FROM notes WHERE burn_after_read = 1);
DELETE FROM network_files WHERE group_id IN (SELECT id FROM file_groups WHERE burn_after_read = 1);

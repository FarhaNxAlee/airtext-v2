-- Adds audit_log, a generic append-only trail for admin-panel actions
-- (Phase 8 groundwork -- see V3-PLAN.md section 8). Purely additive: one
-- new table plus a handful of new indexes on existing tables to support
-- the upcoming paginated/searchable admin views. Nothing here is wired
-- into any route yet -- src/lib/audit.ts's recordAudit() is ready to be
-- called from a later phase. Safe to apply to production immediately.

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  before_json TEXT,
  after_json TEXT,
  ip_hash TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_user_id);

-- Composite indexes for the admin panel's upcoming paginated/searchable
-- list views (notes/files/feedback/users) -- none of these composites
-- existed in prior migrations (only single-column indexes on expires_at/
-- created_at/status/role_id individually).
CREATE INDEX IF NOT EXISTS idx_notes_expires_created ON notes(expires_at, created_at);
CREATE INDEX IF NOT EXISTS idx_file_groups_expires_created ON file_groups(expires_at, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback(status, created_at);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role_id, status);

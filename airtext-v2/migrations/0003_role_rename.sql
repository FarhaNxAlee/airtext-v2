-- V3 vocabulary rename (see V3-PLAN.md section 0.2). Data-only change --
-- role ranking/relationships/default_limits are untouched, only the
-- display name changes:
--   rank 1: "Contributor" -> "Pro"
--   rank 2: "Pro"         -> "Member"
--   rank 0: "Admin" stays "Admin"
--
-- Not applied automatically -- the user runs this against production D1
-- themselves (wrangler d1 execute) once ready.

UPDATE roles SET name = 'Pro' WHERE rank = 1;
UPDATE roles SET name = 'Member' WHERE rank = 2;

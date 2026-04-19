-- SSTC fast-track invites: scope an invite to a specific season and let the
-- same link be used by many recruits.
--
-- - learning_class_id: optional season this invite enrolls the recruit into
--   on signup. NULL means club-only (legacy behavior).
-- - max_uses: NULL = unlimited; otherwise hard cap on accepted signups.
-- - times_used: counter incremented each time the invite is accepted.
-- - Existing rows that already have used_at populated are migrated to
--   times_used = 1 so the legacy single-use semantics are preserved.

ALTER TABLE challenge_member_invites
  ADD COLUMN learning_class_id INT NULL AFTER agency_id,
  ADD COLUMN max_uses INT NULL AFTER auto_approve,
  ADD COLUMN times_used INT NOT NULL DEFAULT 0 AFTER max_uses,
  ADD INDEX idx_cmi_learning_class (learning_class_id);

UPDATE challenge_member_invites
  SET times_used = 1
  WHERE used_at IS NOT NULL AND times_used = 0;

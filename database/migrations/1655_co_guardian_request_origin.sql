-- Preserve the original enrollment request separately from the staff member
-- who creates or resends an invitation. Never rewrite invited_by_user_id.
ALTER TABLE co_guardian_invites
  ADD COLUMN requesting_submission_id INT NULL,
  ADD INDEX idx_co_guardian_requesting_submission (requesting_submission_id);

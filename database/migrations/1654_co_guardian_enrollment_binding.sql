-- Server-owned binding survives autosaves and retries that omit the invite token.
-- Both intake_submissions.id and co_guardian_invites.id are signed INT columns.
ALTER TABLE intake_submissions
 ADD COLUMN co_guardian_invite_id INT NULL,
 ADD INDEX ix_intake_co_guardian_invite (co_guardian_invite_id);

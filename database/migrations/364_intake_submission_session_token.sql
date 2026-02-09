-- Add session token for public intake submissions
ALTER TABLE intake_submissions
  ADD COLUMN session_token VARCHAR(64) NULL AFTER retention_expires_at,
  ADD INDEX idx_intake_submission_session (session_token);

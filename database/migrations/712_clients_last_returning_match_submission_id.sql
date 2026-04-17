-- Audit: last public intake submission that auto-matched this client to a returning guardian.

ALTER TABLE clients
  ADD COLUMN last_returning_match_submission_id INT NULL DEFAULT NULL
    COMMENT 'intake_submissions.id when returning-guardian auto-match attached' AFTER updated_by_user_id,
  ADD INDEX idx_clients_last_returning_match_submission (last_returning_match_submission_id);

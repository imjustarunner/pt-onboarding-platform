-- Migration 1466: enforce one intake submission per session token
-- Prevents any chance of two unfinished packets sharing a resume token.
-- Some environments never got idx_intake_submission_session, and some already
-- have the unique key — only change what is missing.

SET @has_old_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'intake_submissions'
    AND INDEX_NAME = 'idx_intake_submission_session'
);

SET @sql_drop := IF(
  @has_old_idx > 0,
  'ALTER TABLE intake_submissions DROP INDEX idx_intake_submission_session',
  'SELECT 1'
);
PREPARE stmt_drop FROM @sql_drop;
EXECUTE stmt_drop;
DEALLOCATE PREPARE stmt_drop;

SET @has_unique := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'intake_submissions'
    AND INDEX_NAME = 'uq_intake_submission_session_token'
);

SET @sql_add := IF(
  @has_unique = 0,
  'ALTER TABLE intake_submissions ADD UNIQUE KEY uq_intake_submission_session_token (session_token)',
  'SELECT 1'
);
PREPARE stmt_add FROM @sql_add;
EXECUTE stmt_add;
DEALLOCATE PREPARE stmt_add;

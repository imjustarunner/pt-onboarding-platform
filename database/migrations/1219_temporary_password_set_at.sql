-- Migration 1219: track when a temporary password was issued (for School Staff Accounts reporting)

ALTER TABLE users
  ADD COLUMN temporary_password_set_at TIMESTAMP NULL DEFAULT NULL
  COMMENT 'When the current temporary_password_hash was last set'
  AFTER temporary_password_expires_at;

-- Backfill from activity log where bulk / portal temp passwords were recorded.
UPDATE users u
INNER JOIN (
  SELECT ual.user_id, MAX(ual.created_at) AS set_at
  FROM user_activity_log ual
  WHERE ual.action_type IN (
    'school_staff_temporary_password_set',
    'school_portal_school_staff_temporary_password_set'
  )
  GROUP BY ual.user_id
) log ON log.user_id = u.id
SET u.temporary_password_set_at = log.set_at
WHERE u.temporary_password_hash IS NOT NULL
  AND u.temporary_password_set_at IS NULL;

-- Fallback for onboarding / older flows: infer sent time from expiry (default 7-day window).
UPDATE users
SET temporary_password_set_at = DATE_SUB(temporary_password_expires_at, INTERVAL 168 HOUR)
WHERE temporary_password_hash IS NOT NULL
  AND temporary_password_set_at IS NULL
  AND temporary_password_expires_at IS NOT NULL;

-- Migration 1285: school_staff password expiry (same 120-day policy as other roles)
--
-- School staff were previously exempt. Existing passwords are grandfathered:
--   • password_changed_at already set → clock unchanged until natural expiry
--   • no password_changed_at → full 120-day window from rollout (NOW())
--   • already older than 120 days → 30-day grace (stamp = 90 days ago)

UPDATE users
SET password_changed_at = NOW() - INTERVAL 90 DAY
WHERE password_hash IS NOT NULL
  AND LOWER(COALESCE(role, '')) = 'school_staff'
  AND password_changed_at IS NOT NULL
  AND password_changed_at < NOW() - INTERVAL 120 DAY;

UPDATE users
SET password_changed_at = NOW()
WHERE password_hash IS NOT NULL
  AND LOWER(COALESCE(role, '')) = 'school_staff'
  AND password_changed_at IS NULL;

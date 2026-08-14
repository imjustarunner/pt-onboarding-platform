-- Migration 1220: persist shared temp passwords for portal access email sends + sync tracking

ALTER TABLE school_staff_account_access_sends
  ADD COLUMN shared_temporary_password VARCHAR(128) NULL DEFAULT NULL
    COMMENT 'Shared login password included in portal access email body'
    AFTER body,
  ADD COLUMN temp_password_expires_in_hours INT NULL DEFAULT 168
    COMMENT 'Hours until shared temp password expires when applied'
    AFTER shared_temporary_password,
  ADD COLUMN temp_password_synced_at DATETIME NULL DEFAULT NULL
    COMMENT 'When shared temp password was applied to recipient accounts'
    AFTER temp_password_expires_in_hours;

-- Backfill sent timestamps for accounts that already received portal access emails.
UPDATE users u
INNER JOIN school_staff_account_access_send_items i
  ON i.user_id = u.id AND i.status = 'sent' AND i.sent_at IS NOT NULL
INNER JOIN school_staff_account_access_sends s ON s.id = i.send_id
SET u.temporary_password_set_at = COALESCE(u.temporary_password_set_at, i.sent_at)
WHERE s.email_type = 'school_staff_portal_access'
  AND u.temporary_password_hash IS NOT NULL;

-- Unified notification inbox: per-type preferences, explicit viewer state, and activity digests.

CREATE TABLE IF NOT EXISTS user_notification_type_preferences (
  user_id INT NOT NULL,
  notification_type VARCHAR(128) NOT NULL,
  in_app_enabled TINYINT(1) NULL,
  toast_enabled TINYINT(1) NULL,
  sound_enabled TINYINT(1) NULL,
  push_enabled TINYINT(1) NULL,
  email_enabled TINYINT(1) NULL,
  sms_enabled TINYINT(1) NULL,
  digest_enabled TINYINT(1) NULL,
  toast_duration_mode ENUM('timed', 'dismissable') NULL,
  toast_duration_seconds SMALLINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, notification_type),
  INDEX idx_notification_type_preferences_type (notification_type),
  CONSTRAINT fk_notification_type_preferences_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The canonical catalog contains descriptive identifiers longer than the historical
-- VARCHAR(50) limit (for example office_schedule_booked_no_external_calendar_2_weeks).
ALTER TABLE notifications
  MODIFY COLUMN type VARCHAR(128) NOT NULL;

ALTER TABLE notification_user_reads
  ADD COLUMN dismissed_at DATETIME NULL AFTER requires_follow_up,
  ADD COLUMN snoozed_until DATETIME NULL AFTER dismissed_at;

CREATE INDEX idx_notification_user_state_feed
  ON notification_user_reads(user_id, dismissed_at, snoozed_until, is_read, notification_id);

CREATE TABLE IF NOT EXISTS notification_activity_digests (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  notification_id INT NULL,
  digest_date DATE NOT NULL,
  period_start DATETIME NOT NULL,
  period_end DATETIME NOT NULL,
  event_count INT NOT NULL DEFAULT 0,
  breakdown_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notification_activity_digest_user_date (user_id, digest_date),
  INDEX idx_notification_activity_digest_period (user_id, period_start, period_end),
  CONSTRAINT fk_notification_activity_digest_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_activity_digest_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_notifications_feed_agency_created
  ON notifications(agency_id, created_at, id);
CREATE INDEX idx_notifications_feed_user_created
  ON notifications(user_id, created_at, id);
CREATE INDEX idx_notifications_feed_type_created
  ON notifications(type, created_at, id);

-- Canonicalize the historical Summit Stats typo before the catalog becomes authoritative.
UPDATE notifications
SET type = 'sstc_club_member_application_pending'
WHERE type = 'ssc_club_member_application_pending';

-- Backfill personal viewer state. Long legacy mutes represented dismissals; short mutes
-- were the old implicit 48-hour read behavior and intentionally become plain reads.
INSERT IGNORE INTO notification_user_reads
  (notification_id, user_id, is_read, read_at, muted_until, requires_follow_up, dismissed_at, snoozed_until)
SELECT
  n.id,
  n.user_id,
  n.is_read,
  n.read_at,
  NULL,
  FALSE,
  CASE
    WHEN n.muted_until IS NOT NULL
      AND n.muted_until > DATE_ADD(COALESCE(n.read_at, n.updated_at, n.created_at), INTERVAL 30 DAY)
    THEN COALESCE(n.read_at, n.updated_at, n.created_at)
    ELSE NULL
  END,
  NULL
FROM notifications n
WHERE n.user_id IS NOT NULL;

UPDATE notification_user_reads
SET dismissed_at = CASE
      WHEN muted_until IS NOT NULL
        AND muted_until > DATE_ADD(COALESCE(read_at, updated_at, created_at), INTERVAL 30 DAY)
      THEN COALESCE(read_at, updated_at, created_at)
      ELSE dismissed_at
    END,
    muted_until = NULL;

-- Cleaner defaults: raw login/logout is digest-only for every account.
INSERT INTO user_notification_type_preferences
  (user_id, notification_type, in_app_enabled, toast_enabled, sound_enabled,
   push_enabled, email_enabled, sms_enabled, digest_enabled,
   toast_duration_mode, toast_duration_seconds)
SELECT u.id, t.notification_type, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, 'timed', 8
FROM users u
CROSS JOIN (
  SELECT 'user_login' AS notification_type
  UNION ALL SELECT 'user_logout'
) t
WHERE TRUE
ON DUPLICATE KEY UPDATE
  in_app_enabled = FALSE,
  toast_enabled = FALSE,
  sound_enabled = FALSE,
  push_enabled = FALSE,
  email_enabled = FALSE,
  sms_enabled = FALSE,
  digest_enabled = TRUE,
  updated_at = CURRENT_TIMESTAMP;

-- Preserve the legacy new-packet toast choice as a per-type override. Login/logout
-- intentionally does not migrate because the cleaner digest-only default supersedes it.
INSERT INTO user_notification_type_preferences
  (user_id, notification_type, toast_enabled, sound_enabled,
   toast_duration_mode, toast_duration_seconds)
SELECT
  up.user_id,
  'new_packet_uploaded',
  CASE LOWER(JSON_UNQUOTE(JSON_EXTRACT(up.toast_preferences, '$.new_packet.toast_enabled')))
    WHEN 'true' THEN 1
    WHEN 'false' THEN 0
    ELSE NULL
  END,
  CASE LOWER(JSON_UNQUOTE(JSON_EXTRACT(up.toast_preferences, '$.new_packet.sound_enabled')))
    WHEN 'true' THEN 1
    WHEN 'false' THEN 0
    ELSE NULL
  END,
  CASE
    WHEN JSON_EXTRACT(up.toast_preferences, '$.new_packet.duration_seconds') IS NULL
      OR JSON_TYPE(JSON_EXTRACT(up.toast_preferences, '$.new_packet.duration_seconds')) = 'NULL'
    THEN 'dismissable'
    ELSE 'timed'
  END,
  CASE
    WHEN JSON_EXTRACT(up.toast_preferences, '$.new_packet.duration_seconds') IS NULL
      OR JSON_TYPE(JSON_EXTRACT(up.toast_preferences, '$.new_packet.duration_seconds')) = 'NULL'
    THEN NULL
    ELSE CAST(JSON_UNQUOTE(JSON_EXTRACT(up.toast_preferences, '$.new_packet.duration_seconds')) AS UNSIGNED)
  END
FROM user_preferences up
WHERE JSON_EXTRACT(up.toast_preferences, '$.new_packet') IS NOT NULL
ON DUPLICATE KEY UPDATE
  toast_enabled = VALUES(toast_enabled),
  sound_enabled = VALUES(sound_enabled),
  toast_duration_mode = VALUES(toast_duration_mode),
  toast_duration_seconds = VALUES(toast_duration_seconds),
  updated_at = CURRENT_TIMESTAMP;

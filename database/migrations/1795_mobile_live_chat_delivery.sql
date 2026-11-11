-- Existing encrypted website-chat transcripts remain the source of truth.
-- Dismissals hide a row only for one staff member; no transcript is deleted.
CREATE TABLE IF NOT EXISTS public_website_chat_staff_dismissals (
  user_id INT NOT NULL,
  session_id CHAR(36) NOT NULL,
  last_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  dismissed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- An event is queued once for each available, authorized staff member. Retries
-- preserve the original notification ID and never include visitor text.
CREATE TABLE IF NOT EXISTS public_website_chat_notification_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  session_id CHAR(36) NOT NULL,
  event_key VARCHAR(64) NOT NULL,
  notification_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  locked_until DATETIME NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(80) NULL,
  UNIQUE KEY uq_website_chat_notification_event (user_id, session_id, event_key),
  KEY ix_website_chat_notification_pending (completed_at, locked_until, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE mobile_device_sessions ADD COLUMN notification_cursor BIGINT UNSIGNED NULL;
-- Existing devices start at the current high-water mark; no historical replay.
UPDATE mobile_device_sessions SET notification_cursor=(SELECT COALESCE(MAX(id),0) FROM notifications);

-- Migration: Per-user notification read state
-- Description: Allow each user to have their own read state for agency-wide notifications.
-- Personal notifications (user_id set) continue using notifications.is_read.
-- Agency-wide notifications (user_id NULL) use this table for per-user read state.

CREATE TABLE IF NOT EXISTS notification_user_reads (
  notification_id INT NOT NULL,
  user_id INT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT TRUE,
  read_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  muted_until TIMESTAMP NULL COMMENT 'Muted until this timestamp (48 hours from read_at)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (notification_id, user_id),
  INDEX idx_user_reads (user_id, is_read),
  INDEX idx_notification_reads (notification_id),
  FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: For agency-wide notifications (user_id IS NULL) that were marked read,
-- create read state only for the user who marked them (read_by_user_id).
-- Others will see them as unread until they mark it themselves.
INSERT IGNORE INTO notification_user_reads (notification_id, user_id, is_read, read_at, muted_until)
SELECT id, read_by_user_id, TRUE, read_at, muted_until
FROM notifications
WHERE user_id IS NULL
  AND is_read = TRUE
  AND read_by_user_id IS NOT NULL;

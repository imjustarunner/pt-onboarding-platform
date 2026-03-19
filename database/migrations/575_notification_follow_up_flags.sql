-- Per-user notification follow-up flags
-- Lets a user mark a notification as "Needs follow-up" to prevent accidental dismissal/deletion.

ALTER TABLE notification_user_reads
  ADD COLUMN requires_follow_up BOOLEAN NOT NULL DEFAULT FALSE AFTER muted_until;

CREATE INDEX idx_notification_user_reads_follow_up
  ON notification_user_reads(user_id, requires_follow_up);

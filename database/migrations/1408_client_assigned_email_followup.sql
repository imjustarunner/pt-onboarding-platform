-- Migration 1408: track 24h unread follow-up email for client_assigned notifications
ALTER TABLE notifications
  ADD COLUMN email_followup_sent_at DATETIME NULL DEFAULT NULL
  COMMENT 'When the deferred unread follow-up email was sent for this notification';

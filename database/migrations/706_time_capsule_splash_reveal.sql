-- Time capsule: in-app reveal splash (ack + snooze) instead of email delivery.
ALTER TABLE time_capsule_entries
  ADD COLUMN splash_acknowledged_at DATETIME NULL DEFAULT NULL,
  ADD COLUMN splash_snooze_until DATETIME NULL DEFAULT NULL,
  ADD INDEX idx_time_capsule_author_pending (author_user_id, reveal_at, splash_acknowledged_at);

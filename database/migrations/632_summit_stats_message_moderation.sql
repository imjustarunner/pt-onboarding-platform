-- Summit Stats Challenge: message moderation support

ALTER TABLE challenge_messages
  ADD COLUMN is_pinned TINYINT(1) NOT NULL DEFAULT 0 AFTER message_text,
  ADD COLUMN pinned_by_user_id INT NULL AFTER is_pinned,
  ADD COLUMN pinned_at DATETIME NULL AFTER pinned_by_user_id,
  ADD COLUMN deleted_by_user_id INT NULL AFTER pinned_at,
  ADD COLUMN deleted_at DATETIME NULL AFTER deleted_by_user_id;

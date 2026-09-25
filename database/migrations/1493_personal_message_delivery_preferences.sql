-- Preserve existing opt-outs and business-day timing; message bodies/replies are opt-in.
ALTER TABLE user_communication_prefs
  ADD COLUMN personal_email_delivery_mode VARCHAR(32) NOT NULL DEFAULT 'notification',
  ADD COLUMN personal_email_delay_mode VARCHAR(24) NOT NULL DEFAULT 'business_day',
  ADD COLUMN personal_email_delay_hours SMALLINT NULL;
ALTER TABLE communication_thread_reminders
  ADD COLUMN reply_token_hash CHAR(64) NULL,
  ADD COLUMN reply_allowed TINYINT(1) NOT NULL DEFAULT 0,
  ADD UNIQUE KEY uq_personal_reminder_reply_token (reply_token_hash);

ALTER TABLE communication_messages
  ADD COLUMN is_group_email TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN personal_reply_reminder_id BIGINT UNSIGNED NULL;

-- Track each chat notification independently so immediate delivery does not
-- repeat old unread messages or swallow newer messages in another thread.
CREATE TABLE IF NOT EXISTS user_chat_email_reminders (
  user_id INT NOT NULL,
  thread_id INT NOT NULL,
  message_id INT NOT NULL,
  delivery_status VARCHAR(24) NOT NULL DEFAULT 'sending',
  claimed_at DATETIME NOT NULL,
  PRIMARY KEY (user_id,message_id),
  KEY idx_chat_reminder_thread (user_id,thread_id,message_id)
);

-- Durable chat topics and inbox-scoped inbound delivery receipts.
CREATE TABLE IF NOT EXISTS chat_topics (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  thread_id INT NOT NULL,
  subject VARCHAR(500) NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_topics_thread (thread_id),
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE chat_messages ADD COLUMN topic_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD INDEX idx_chat_messages_topic (topic_id, id),
  ADD CONSTRAINT fk_chat_messages_topic FOREIGN KEY (topic_id) REFERENCES chat_topics(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS communication_email_receipts (
  inbox_id INT NOT NULL,
  delivery_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  message_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (inbox_id, delivery_hash),
  FOREIGN KEY (inbox_id) REFERENCES communication_inboxes(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES communication_messages(id) ON DELETE SET NULL
) ENGINE=InnoDB;

ALTER TABLE message_logs ADD COLUMN sms_thread_key VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD INDEX idx_message_logs_sms_thread (agency_id, sms_thread_key, id);

-- Existing message_logs already normalize phone numbers on insert. Missing numbers
-- remain legacy/read-only until reviewed; never invent a send destination.
UPDATE message_logs SET sms_thread_key = CONCAT(
  'sms:v2:', IF(client_id IS NOT NULL, CONCAT('client:', client_id), CONCAT('contact:', agency_contact_id)), ':',
  IF(UPPER(direction) = 'INBOUND', to_number, from_number), ':',
  IF(UPPER(direction) = 'INBOUND', from_number, to_number))
WHERE sms_thread_key IS NULL AND (client_id IS NOT NULL OR agency_contact_id IS NOT NULL)
  AND from_number REGEXP '^\\+[1-9][0-9]{6,14}$' AND to_number REGEXP '^\\+[1-9][0-9]{6,14}$';

ALTER TABLE communication_messages MODIFY COLUMN send_status ENUM('sent', 'scheduled', 'sending', 'cancelled', 'failed', 'preparing') NOT NULL DEFAULT 'sent';

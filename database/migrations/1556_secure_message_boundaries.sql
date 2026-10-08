-- A channel belongs to the conversation, never to the current recipient role.
ALTER TABLE chat_threads ADD COLUMN message_channel ENUM('internal', 'secure') NOT NULL DEFAULT 'internal';
ALTER TABLE chat_threads ADD COLUMN client_id INT NULL;
CREATE UNIQUE INDEX uq_client_secure_thread ON chat_threads (client_id, thread_type);
CREATE INDEX idx_chat_thread_message_channel ON chat_threads (agency_id, message_channel);

-- Reuse the shared guardian conversation if one was already provisioned.
UPDATE chat_threads t JOIN guardian_client_threads g ON g.thread_id = t.id
SET t.client_id = g.client_id, t.thread_type = 'client_secure', t.message_channel = 'secure';

-- Preserve the strongest boundary for existing client, guardian and school conversations.
UPDATE chat_threads t
SET t.message_channel = 'secure'
WHERE EXISTS (
  SELECT 1 FROM chat_thread_participants p JOIN users u ON u.id = p.user_id
  WHERE p.thread_id = t.id AND (LOWER(u.role) IN ('client', 'client_guardian')
    OR (t.thread_type = 'direct' AND LOWER(u.role) = 'school_staff'))
);

CREATE TABLE secure_message_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  thread_id INT NULL,
  message_id INT NULL,
  notification_id INT NULL,
  actor_user_id INT NULL,
  event_type VARCHAR(48) NOT NULL,
  ip_hash CHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_secure_event_thread (thread_id, created_at),
  INDEX idx_secure_event_message (message_id, created_at),
  INDEX idx_secure_event_agency (agency_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A chart entry points to the original encrypted message. Inbox hiding cannot erase it.
CREATE TABLE client_secure_message_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  thread_id INT NOT NULL,
  message_id INT NOT NULL,
  sender_user_id INT NOT NULL,
  audience_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_secure_record_message (client_id, message_id),
  INDEX idx_client_secure_records (client_id, created_at),
  CONSTRAINT fk_secure_record_message FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE RESTRICT,
  CONSTRAINT fk_secure_record_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

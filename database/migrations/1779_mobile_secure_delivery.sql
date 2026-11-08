-- A retry of Send & invite must never insert a second message or resend an
-- invitation whose delivery outcome is still unknown. No narrative is stored here.
CREATE TABLE IF NOT EXISTS mobile_secure_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sender_user_id INT NOT NULL,
  request_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  recipient_key VARCHAR(80) NOT NULL,
  content_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  thread_id INT NULL,
  message_id INT NULL,
  recipient_user_id INT NULL,
  delivery_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY mobile_secure_request (sender_user_id, request_key)
);

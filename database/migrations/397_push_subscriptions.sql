-- Push subscriptions for browser push notifications.
-- Stores Web Push API subscription per user (endpoint + keys).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  endpoint VARCHAR(512) NOT NULL,
  p256dh VARCHAR(255) NOT NULL COMMENT 'Public key for encryption',
  auth VARCHAR(255) NOT NULL COMMENT 'Auth secret',
  user_agent VARCHAR(512) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_endpoint (user_id, endpoint(255)),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id)
);

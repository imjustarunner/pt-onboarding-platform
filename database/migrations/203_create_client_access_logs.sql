-- Migration: Client access logs
-- Description: Tracks who accessed a client's info (for auditability; no PHI stored here).

CREATE TABLE IF NOT EXISTS client_access_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  user_id INT NOT NULL,
  user_role VARCHAR(64) NULL,
  action VARCHAR(64) NOT NULL,
  route VARCHAR(255) NULL,
  method VARCHAR(16) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_client_access_client (client_id, created_at),
  INDEX idx_client_access_user (user_id, created_at),
  INDEX idx_client_access_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


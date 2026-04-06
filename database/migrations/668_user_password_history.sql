-- Migration: Create user_password_history table
-- Stores previous bcrypt hashes so users cannot reuse their last 5 passwords.

CREATE TABLE IF NOT EXISTS user_password_history (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_uph_user_id (user_id),
  CONSTRAINT fk_uph_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

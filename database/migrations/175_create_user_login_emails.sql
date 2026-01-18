-- Adds support for multiple login emails mapping to the same user account.
-- Intended for users associated with multiple agencies / brandings.

CREATE TABLE IF NOT EXISTS user_login_emails (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_login_emails_email (email),
  INDEX idx_user_login_emails_user (user_id),
  INDEX idx_user_login_emails_agency (agency_id),
  CONSTRAINT fk_user_login_emails_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_login_emails_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL
);


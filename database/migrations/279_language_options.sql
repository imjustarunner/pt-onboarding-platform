-- Migration: Language options catalog (global)
-- Description: Provides a shared dropdown list for client/guardian primary language fields.

CREATE TABLE IF NOT EXISTS language_options (
  id INT AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(128) NOT NULL,
  label_key VARCHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_language_label_key (label_key),
  INDEX idx_language_active (is_active, label),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Migration 1345: global email opt-out tokens/records + school contact delivery preference

CREATE TABLE IF NOT EXISTS email_opt_out_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  agency_id INT NULL,
  user_id INT NULL,
  expires_at DATETIME NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_email_opt_out_token_hash (token_hash),
  KEY idx_email_opt_out_tokens_email (email),
  KEY idx_email_opt_out_tokens_agency (agency_id),
  CONSTRAINT fk_email_opt_out_tokens_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
  CONSTRAINT fk_email_opt_out_tokens_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_opt_outs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  agency_id INT NULL,
  user_id INT NULL,
  source VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'email_link',
  support_ticket_id INT NULL,
  opted_out_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_email_opt_outs_email_agency (email, agency_id),
  KEY idx_email_opt_outs_email (email),
  KEY idx_email_opt_outs_user (user_id),
  CONSTRAINT fk_email_opt_outs_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL,
  CONSTRAINT fk_email_opt_outs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE school_contacts
  ADD COLUMN email_delivery_preference ENUM('email', 'no_email')
    NOT NULL DEFAULT 'email'
    COMMENT 'School staff group delivery: no_email mutes Google Group mail without removing membership';

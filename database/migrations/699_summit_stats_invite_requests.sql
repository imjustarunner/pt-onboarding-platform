-- Pending invitation requests when SSTC invite-only mode is on (App Store users without a link).
CREATE TABLE IF NOT EXISTS summit_stats_invite_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL COMMENT 'Club (affiliation) id',
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  message VARCHAR(2000) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT 'pending | acknowledged',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  INDEX idx_ssir_agency_created (agency_id, created_at),
  INDEX idx_ssir_agency_email_pending (agency_id, email, status),
  CONSTRAINT fk_ssir_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

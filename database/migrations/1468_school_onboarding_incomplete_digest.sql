-- Migration 1468: Track Mon/Wed/Fri incomplete school-onboarding digests (ITSCO → Rachel Finch).

CREATE TABLE school_onboarding_incomplete_digest_sends (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  window_key VARCHAR(32) NOT NULL COMMENT 'YYYY-MM-DD_mon|wed|fri America/Denver',
  recipient_email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  invite_count INT NOT NULL DEFAULT 0,
  communication_id INT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_so_incomplete_digest_window (agency_id, window_key, recipient_email),
  INDEX idx_so_incomplete_digest_agency (agency_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

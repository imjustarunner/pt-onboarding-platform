-- Migration 1078: Agency-level QR links for self-serve school onboarding

CREATE TABLE IF NOT EXISTS school_onboarding_qr_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  token VARCHAR(64) NOT NULL,
  label VARCHAR(255) NULL DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL DEFAULT NULL,
  revoked_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_onboarding_qr_token (token),
  INDEX idx_school_onboarding_qr_agency (agency_id, is_active),
  CONSTRAINT fk_school_onboarding_qr_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_school_onboarding_qr_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE school_onboarding_invites
  ADD COLUMN source ENUM('invite', 'qr') NOT NULL DEFAULT 'invite'
    COMMENT 'How this onboarding session was started'
    AFTER status,
  ADD COLUMN qr_link_id INT NULL DEFAULT NULL
    COMMENT 'Optional QR link that started this session'
    AFTER source;

ALTER TABLE school_onboarding_invites
  ADD INDEX idx_school_onboarding_source (agency_id, source),
  ADD CONSTRAINT fk_school_onboarding_qr_link
    FOREIGN KEY (qr_link_id) REFERENCES school_onboarding_qr_links(id) ON DELETE SET NULL;

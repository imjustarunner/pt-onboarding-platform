-- Migration: Clinical note supervisor sign-offs
-- Description: Track notes from supervisees that require supervisor sign-off.
--   Used by Momentum List "Notes to sign" section for supervisors.
--   Clinical org agencies only.

CREATE TABLE IF NOT EXISTS clinical_note_signoffs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  clinical_note_id BIGINT NOT NULL COMMENT 'clinical_notes.id in clinical DB',
  provider_user_id INT NOT NULL COMMENT 'Note author (supervisee)',
  supervisor_user_id INT NOT NULL COMMENT 'Assigned supervisor who must sign',
  provider_signed_at DATETIME NULL,
  supervisor_signed_at DATETIME NULL,
  status ENUM('awaiting_provider', 'awaiting_supervisor', 'signed') NOT NULL DEFAULT 'awaiting_provider',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_note_supervisor (clinical_note_id, supervisor_user_id),
  INDEX idx_supervisor_pending (supervisor_user_id, status),
  INDEX idx_agency (agency_id),
  INDEX idx_provider (provider_user_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (supervisor_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Clinical Data Plane (separate clinical DB)
-- Purpose:
--   - Store PHI-heavy booked clinical session artifacts in a dedicated database
--   - Provide auditable retention controls (soft delete, restore, legal hold)

CREATE TABLE IF NOT EXISTS clinical_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  office_event_id INT NOT NULL,
  provider_user_id INT NULL,
  source_timezone VARCHAR(64) NULL,
  scheduled_start_at DATETIME NULL,
  scheduled_end_at DATETIME NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_clinical_session_event_client (office_event_id, client_id),
  INDEX idx_clinical_sessions_agency_client (agency_id, client_id),
  INDEX idx_clinical_sessions_event (office_event_id),
  INDEX idx_clinical_sessions_start (scheduled_start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_notes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  clinical_session_id BIGINT NOT NULL,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  note_payload LONGTEXT NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL,
  deleted_by_user_id INT NULL,
  is_legal_hold TINYINT(1) NOT NULL DEFAULT 0,
  legal_hold_reason VARCHAR(1000) NULL,
  legal_hold_set_at TIMESTAMP NULL,
  legal_hold_set_by_user_id INT NULL,
  legal_hold_released_at TIMESTAMP NULL,
  legal_hold_released_by_user_id INT NULL,
  INDEX idx_clinical_notes_session (clinical_session_id),
  INDEX idx_clinical_notes_agency_client (agency_id, client_id),
  INDEX idx_clinical_notes_is_deleted (is_deleted),
  INDEX idx_clinical_notes_is_legal_hold (is_legal_hold)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_claims (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  clinical_session_id BIGINT NOT NULL,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  claim_number VARCHAR(120) NULL,
  claim_status VARCHAR(60) NOT NULL DEFAULT 'PENDING',
  amount_cents INT NOT NULL DEFAULT 0,
  currency_code VARCHAR(8) NOT NULL DEFAULT 'USD',
  claim_payload LONGTEXT NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL,
  deleted_by_user_id INT NULL,
  is_legal_hold TINYINT(1) NOT NULL DEFAULT 0,
  legal_hold_reason VARCHAR(1000) NULL,
  legal_hold_set_at TIMESTAMP NULL,
  legal_hold_set_by_user_id INT NULL,
  legal_hold_released_at TIMESTAMP NULL,
  legal_hold_released_by_user_id INT NULL,
  INDEX idx_clinical_claims_session (clinical_session_id),
  INDEX idx_clinical_claims_agency_client (agency_id, client_id),
  INDEX idx_clinical_claims_is_deleted (is_deleted),
  INDEX idx_clinical_claims_is_legal_hold (is_legal_hold)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clinical_documents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  clinical_session_id BIGINT NOT NULL,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  document_type VARCHAR(120) NULL,
  storage_path VARCHAR(700) NULL,
  original_name VARCHAR(255) NULL,
  mime_type VARCHAR(128) NULL,
  metadata_json JSON NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at TIMESTAMP NULL,
  deleted_by_user_id INT NULL,
  is_legal_hold TINYINT(1) NOT NULL DEFAULT 0,
  legal_hold_reason VARCHAR(1000) NULL,
  legal_hold_set_at TIMESTAMP NULL,
  legal_hold_set_by_user_id INT NULL,
  legal_hold_released_at TIMESTAMP NULL,
  legal_hold_released_by_user_id INT NULL,
  INDEX idx_clinical_documents_session (clinical_session_id),
  INDEX idx_clinical_documents_agency_client (agency_id, client_id),
  INDEX idx_clinical_documents_is_deleted (is_deleted),
  INDEX idx_clinical_documents_is_legal_hold (is_legal_hold)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


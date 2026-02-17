-- Main DB pointers for records stored in dedicated clinical DB.
-- Contains no PHI payloads, only references and routing metadata.

CREATE TABLE IF NOT EXISTS clinical_record_refs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  office_event_id INT NOT NULL,
  clinical_session_id BIGINT NOT NULL,
  record_type ENUM('note', 'claim', 'document') NOT NULL,
  clinical_record_id BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_clinical_record_ref (record_type, clinical_record_id),
  INDEX idx_clinical_record_refs_lookup (agency_id, client_id, office_event_id),
  INDEX idx_clinical_record_refs_session (clinical_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


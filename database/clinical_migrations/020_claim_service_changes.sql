-- An amendment can request a change to an existing claim, never a second original.
CREATE TABLE IF NOT EXISTS clinical_claim_change_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  clinical_session_id BIGINT NOT NULL,
  clinical_note_id BIGINT NOT NULL,
  addendum_id BIGINT NOT NULL,
  proposed_lines_encrypted MEDIUMTEXT NOT NULL,
  status ENUM('pending','applied','no_claim_change','reconciliation_required','reconciled') NOT NULL DEFAULT 'pending',
  created_by_user_id INT NOT NULL,
  resolved_by_user_id INT NULL,
  resolution_encrypted MEDIUMTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_change_addendum (agency_id,addendum_id),
  INDEX idx_claim_change_queue (agency_id,clinical_session_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

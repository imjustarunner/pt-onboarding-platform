-- Clinical data plane: versioned responses. Questionnaire, answers, scores and review notes
-- are encrypted together using the existing clinical-note encryption key ring.
CREATE TABLE IF NOT EXISTS client_outcome_measure_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  agency_id INT NOT NULL,
  measure_id VARCHAR(64) NOT NULL,
  measure_version VARCHAR(64) NOT NULL,
  request_id CHAR(36) NOT NULL,
  recorded_by_user_id INT NOT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_encrypted LONGTEXT NOT NULL,
  reviewed_by_user_id INT NULL,
  reviewed_at DATETIME NULL,
  review_encrypted LONGTEXT NULL,
  UNIQUE KEY uq_outcome_request (client_id, agency_id, recorded_by_user_id, request_id),
  INDEX idx_outcome_client (client_id, agency_id, recorded_at, id)
);

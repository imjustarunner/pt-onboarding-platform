-- No patient demographics or payer payloads in the work queue.
CREATE TABLE IF NOT EXISTS intake_eligibility_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  submission_id INT NOT NULL DEFAULT 0,
  insurance_fingerprint CHAR(64) NOT NULL,
  status ENUM('pending','processing','completed','review_required','superseded') NOT NULL DEFAULT 'pending',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_intake_eligibility_policy (agency_id,client_id,submission_id,insurance_fingerprint),
  KEY idx_intake_eligibility_pending (status,id)
);

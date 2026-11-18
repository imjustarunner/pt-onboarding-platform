CREATE TABLE IF NOT EXISTS clinical_treatment_plan_provider_signoffs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  treatment_plan_id BIGINT NOT NULL,
  provider_user_id INT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  statement VARCHAR(500) NOT NULL,
  signed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_plan_provider_content (agency_id, treatment_plan_id, provider_user_id, content_hash),
  INDEX idx_plan_provider_signoff (agency_id, client_id, treatment_plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Per-service items for Med Cancel claims (one claim date can include multiple missed services).

CREATE TABLE IF NOT EXISTS payroll_medcancel_claim_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  missed_service_code VARCHAR(16) NOT NULL,
  note TEXT NOT NULL,
  attestation TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_medcancel_claim_items_claim_id (claim_id),
  CONSTRAINT fk_medcancel_claim_items_claim
    FOREIGN KEY (claim_id) REFERENCES payroll_medcancel_claims(id)
    ON DELETE CASCADE
);


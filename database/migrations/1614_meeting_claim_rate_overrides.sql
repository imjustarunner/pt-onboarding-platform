CREATE TABLE IF NOT EXISTS meeting_claim_rate_overrides (
  claim_id INT NOT NULL PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  rate_type VARCHAR(40) NOT NULL,
  hourly_rate DECIMAL(10,2) NULL,
  reason VARCHAR(500) NOT NULL,
  edited_by_user_id INT NOT NULL,
  history_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_meeting_claim_override_agency (agency_id, user_id),
  CONSTRAINT fk_meeting_claim_override_claim FOREIGN KEY (claim_id) REFERENCES payroll_time_claims(id) ON DELETE CASCADE
);

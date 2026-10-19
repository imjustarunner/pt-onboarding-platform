-- A scheduled training can use an explicitly authorized pay category for selected participants.
-- Normal training eligibility and actual recorded attendance still apply.
CREATE TABLE IF NOT EXISTS scheduled_training_compensation_overrides (
  event_id INT NOT NULL,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  rate_type VARCHAR(32) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  authorized_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id,user_id),
  INDEX (agency_id,user_id)
);

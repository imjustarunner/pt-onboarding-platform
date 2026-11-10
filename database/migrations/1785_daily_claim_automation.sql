CREATE TABLE IF NOT EXISTS agency_claim_automation_runs (
  agency_id INT NOT NULL,
  run_date DATE NOT NULL,
  actor_user_id INT NOT NULL,
  status ENUM('processing','completed') NOT NULL DEFAULT 'processing',
  last_claim_id BIGINT NOT NULL DEFAULT 0,
  submitted_count INT NOT NULL DEFAULT 0,
  held_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  PRIMARY KEY (agency_id,run_date)
);

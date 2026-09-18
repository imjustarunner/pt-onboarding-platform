-- Deduplicate family commands across Gmail polls/replicas. Never store email bodies here.
CREATE TABLE IF NOT EXISTS family_email_requests (
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  household_id INT NULL,
  result_json JSON NULL,
  applied_at DATETIME NULL,
  replied_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_family_email_rate (user_id,created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (household_id) REFERENCES family_households(id) ON DELETE CASCADE
);

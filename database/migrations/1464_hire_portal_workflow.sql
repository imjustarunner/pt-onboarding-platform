-- Retain the packet selected for a person and encrypted inline step submissions.
CREATE TABLE IF NOT EXISTS hire_portal_packets (
  user_id INT PRIMARY KEY,
  agency_id INT NOT NULL,
  config_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hire_portal_submissions (
  user_id INT NOT NULL,
  phase ENUM('pre_hire','onboarding') NOT NULL,
  step_key VARCHAR(100) NOT NULL,
  encrypted_value JSON NOT NULL,
  completed_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, phase, step_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

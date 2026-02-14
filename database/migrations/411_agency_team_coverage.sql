-- Day-level coverage: when someone is out, a replacement fills the slot for the day.
-- agency_team_coverage overrides who is visible for a given (agency, role_type, date).

CREATE TABLE agency_team_coverage (
  id INT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  role_type VARCHAR(40) NOT NULL COMMENT 'credentialing, billing, support, account_manager',
  covered_by_user_id INT NOT NULL COMMENT 'Who is filling this slot',
  coverage_date DATE NOT NULL,
  replaces_user_id INT NULL COMMENT 'Optional: who they are covering for',
  note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_coverage (agency_id, role_type, coverage_date),
  INDEX idx_coverage_agency_date (agency_id, coverage_date),
  INDEX idx_coverage_user (covered_by_user_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (covered_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (replaces_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- No transition is activated by this migration. Dates are selected by a superadmin.
CREATE TABLE IF NOT EXISTS office_scheduling_policies (
  agency_id INT NOT NULL PRIMARY KEY,
  transition_date DATE NULL,
  updated_by_user_id INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS office_assignment_usage_reviews (
  assignment_id INT NOT NULL PRIMARY KEY,
  cycle_start_date DATE NOT NULL,
  warned_at DATETIME NULL,
  action_required_at DATETIME NULL,
  deadline_date DATE NULL,
  requested_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  reviewed_by_user_id INT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'monitoring',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX usage_review_status (status, deadline_date)
);
CREATE TABLE IF NOT EXISTS office_scheduling_policy_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  previous_date DATE NULL,
  transition_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Kudos system: peer recognition and notes completion rewards
-- kudos: individual kudos given from one user to another (or system)
-- user_kudos_points: denormalized points per user per agency
-- kudos_notes_completion: idempotency for notes-complete awards (one per user/agency/period)

CREATE TABLE IF NOT EXISTS kudos (
  id INT NOT NULL AUTO_INCREMENT,
  from_user_id INT NULL COMMENT 'NULL for system kudos (e.g. notes_complete)',
  to_user_id INT NOT NULL,
  agency_id INT NOT NULL,
  reason TEXT NOT NULL,
  source ENUM('peer', 'notes_complete') NOT NULL DEFAULT 'peer',
  payroll_period_id INT NULL COMMENT 'For notes_complete: period that was completed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE SET NULL,
  INDEX idx_to_user_agency (to_user_id, agency_id),
  INDEX idx_from_user (from_user_id),
  INDEX idx_agency_created (agency_id, created_at)
);

CREATE TABLE IF NOT EXISTS user_kudos_points (
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  points INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, agency_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  INDEX idx_agency_points (agency_id, points DESC)
);

CREATE TABLE IF NOT EXISTS kudos_notes_completion (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  payroll_period_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY unique_user_agency_period (user_id, agency_id, payroll_period_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE
);

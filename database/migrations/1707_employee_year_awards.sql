-- Agency gift catalog, source-specific service dates, dinner attendance, and gift history.
CREATE TABLE IF NOT EXISTS employee_service_award_definitions (
  agency_id INT NOT NULL,
  milestone_years TINYINT NOT NULL,
  gift_name VARCHAR(120) NOT NULL,
  details TEXT NULL,
  PRIMARY KEY (agency_id, milestone_years)
);
ALTER TABLE employee_service_milestones
  MODIFY COLUMN milestone_date DATE NULL,
  ADD COLUMN fulfilled_on DATE NULL,
  ADD COLUMN eligibility_notified_at DATETIME NULL;
CREATE TABLE IF NOT EXISTS employee_award_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  milestone_id INT NOT NULL,
  actor_user_id INT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_award_notes (milestone_id, id)
);
CREATE TABLE IF NOT EXISTS employee_award_dinners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  scheduled_on DATE NOT NULL,
  scheduled_time VARCHAR(5) NULL,
  location VARCHAR(255) NULL,
  notes TEXT NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_award_dinners (agency_id, scheduled_on)
);
CREATE TABLE IF NOT EXISTS employee_award_dinner_attendees (
  dinner_id INT NOT NULL,
  milestone_id INT NOT NULL,
  attendance ENUM('invited','attended','declined','no_show','cancelled') NOT NULL DEFAULT 'invited',
  PRIMARY KEY (dinner_id, milestone_id),
  INDEX idx_award_dinner_person (milestone_id)
);

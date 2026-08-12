-- Migration 1192: employee service milestones for Employee Relations
CREATE TABLE employee_service_milestones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  milestone_years TINYINT NOT NULL,
  milestone_date DATE NOT NULL,
  status ENUM('upcoming','owed','gift_sent','acknowledged') NOT NULL DEFAULT 'upcoming',
  gift_notes TEXT NULL,
  assigned_to_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_user_years (agency_id, user_id, milestone_years),
  INDEX idx_agency_status (agency_id, status)
);

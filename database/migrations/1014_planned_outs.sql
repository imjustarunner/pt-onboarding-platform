-- Migration 1014: Planned outs (presence board + schedule blocks)
CREATE TABLE IF NOT EXISTS planned_outs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  submitted_by_user_id INT NULL,

  status ENUM('pending', 'approved', 'rejected', 'revision') NOT NULL DEFAULT 'pending',
  span_type ENUM('hours', 'half_day', 'all_day') NOT NULL DEFAULT 'hours',
  half_day_part ENUM('am', 'pm') NULL DEFAULT NULL,

  all_day TINYINT(1) NOT NULL DEFAULT 0,
  start_at DATETIME NULL,
  end_at DATETIME NULL,
  start_date DATE NULL,
  end_date DATE NULL,

  availability ENUM('available', 'unavailable') NOT NULL DEFAULT 'unavailable',
  emergencies ENUM('okay', 'redirect', 'none') NOT NULL DEFAULT 'none',
  emergencies_redirect_user_id INT NULL,
  emergencies_redirect_name VARCHAR(160) NULL,
  contact_preference ENUM('call_only', 'email_only', 'none') NOT NULL DEFAULT 'none',

  details TEXT NULL,
  admin_comment TEXT NULL,

  schedule_event_id INT NULL,
  reviewed_by_user_id INT NULL,
  reviewed_at DATETIME NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_planned_outs_agency_status (agency_id, status),
  INDEX idx_planned_outs_user_window (user_id, start_date, start_at),
  INDEX idx_planned_outs_upcoming (agency_id, status, start_date, start_at),
  CONSTRAINT fk_planned_outs_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_planned_outs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_planned_outs_submitted_by FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_planned_outs_redirect FOREIGN KEY (emergencies_redirect_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_planned_outs_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_planned_outs_event FOREIGN KEY (schedule_event_id) REFERENCES provider_schedule_events(id) ON DELETE SET NULL
);

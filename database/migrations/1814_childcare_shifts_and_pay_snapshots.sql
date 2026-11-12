-- Childcare is a scoped nonclinical service. No users, permissions, rates or live shifts are seeded.
CREATE TABLE IF NOT EXISTS childcare_service_grants (
  agency_id INT NOT NULL, user_id INT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE,
  self_schedule BOOLEAN NOT NULL DEFAULT FALSE, manage_schedule BOOLEAN NOT NULL DEFAULT FALSE, granted_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,user_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id), FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS childcare_shifts (
  id INT AUTO_INCREMENT PRIMARY KEY, agency_id INT NOT NULL, company_event_id INT NOT NULL,
  planned_children INT NOT NULL, actual_children INT NULL, attendance_version INT NOT NULL DEFAULT 0, schedule_version INT NOT NULL DEFAULT 1,
  attendance_review_required BOOLEAN NOT NULL DEFAULT FALSE,
  private_note TEXT NULL, location_name VARCHAR(255) NULL,
  minimum_hourly_rate DECIMAL(12,2) NULL, wage_floor_jurisdiction VARCHAR(255) NULL,
  created_by_user_id INT NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY childcare_event_unique(company_event_id), INDEX childcare_agency(agency_id,status),
  FOREIGN KEY (agency_id) REFERENCES agencies(id), FOREIGN KEY (company_event_id) REFERENCES company_events(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS childcare_attendance_events (
  id INT AUTO_INCREMENT PRIMARY KEY, shift_id INT NOT NULL, actor_user_id INT NOT NULL,
  actual_children INT NOT NULL, effective_at DATETIME(3) NOT NULL, version INT NOT NULL,
  source VARCHAR(32) NOT NULL, needs_review BOOLEAN NOT NULL DEFAULT FALSE, review_note VARCHAR(2000) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY childcare_attendance_version(shift_id,version),
  FOREIGN KEY (shift_id) REFERENCES childcare_shifts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS childcare_action_receipts (
  id INT AUTO_INCREMENT PRIMARY KEY, shift_id INT NOT NULL, user_id INT NOT NULL,
  action VARCHAR(24) NOT NULL, request_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY childcare_request(shift_id,user_id,request_key),
  FOREIGN KEY (shift_id) REFERENCES childcare_shifts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS childcare_pay_snapshots (
  shift_id INT NOT NULL, user_id INT NOT NULL, snapshot_json JSON NOT NULL,
  snapshot_hash CHAR(64) NOT NULL, payroll_time_claim_id INT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(shift_id,user_id), UNIQUE KEY childcare_claim_unique(payroll_time_claim_id),
  FOREIGN KEY (shift_id) REFERENCES childcare_shifts(id),
  FOREIGN KEY (payroll_time_claim_id) REFERENCES payroll_time_claims(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS childcare_reminder_deliveries (
  id INT AUTO_INCREMENT PRIMARY KEY, shift_id INT NOT NULL, user_id INT NOT NULL,
  reminder_type VARCHAR(24) NOT NULL, channel VARCHAR(16) NOT NULL, schedule_version INT NOT NULL DEFAULT 1,
  status VARCHAR(24) NOT NULL DEFAULT 'claimed', reason VARCHAR(255) NULL,
  provider_message_id VARCHAR(255) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY childcare_reminder_once(shift_id,user_id,reminder_type,channel,schedule_version),
  FOREIGN KEY (shift_id) REFERENCES childcare_shifts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

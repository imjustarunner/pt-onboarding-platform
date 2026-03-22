-- Skill Builders provider hub: event applications, portal posts, kiosk punches, payroll fields

ALTER TABLE company_events
  ADD COLUMN skill_builder_direct_hours DECIMAL(6,2) NULL DEFAULT NULL
    COMMENT 'Direct hours credited per kiosk session when payroll rule applies'
    AFTER sms_code,
  ADD COLUMN learning_program_class_id INT NULL DEFAULT NULL
    COMMENT 'Optional link to learning_program_classes for class-scoped features'
    AFTER skill_builder_direct_hours,
  ADD INDEX idx_company_events_learning_program_class (learning_program_class_id),
  ADD CONSTRAINT fk_company_events_learning_program_class
    FOREIGN KEY (learning_program_class_id) REFERENCES learning_program_classes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS company_event_provider_applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('pending','approved','rejected','withdrawn') NOT NULL DEFAULT 'pending',
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_company_event_provider_application (company_event_id, user_id),
  INDEX idx_company_event_provider_app_user (user_id, status),
  INDEX idx_company_event_provider_app_event (company_event_id, status),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS skill_builders_event_portal_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  user_id INT NOT NULL,
  parent_post_id INT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sb_event_portal_posts_event (company_event_id, created_at),
  INDEX idx_sb_event_portal_posts_parent (parent_post_id),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_post_id) REFERENCES skill_builders_event_portal_posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS skill_builders_event_kiosk_punches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  user_id INT NOT NULL,
  client_id INT NULL,
  punch_type ENUM('clock_in','clock_out') NOT NULL,
  punched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  office_location_id INT NULL,
  payroll_time_claim_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sb_kiosk_punches_event_user (company_event_id, user_id, punch_type),
  INDEX idx_sb_kiosk_punches_user_time (user_id, punched_at),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE SET NULL,
  FOREIGN KEY (payroll_time_claim_id) REFERENCES payroll_time_claims(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

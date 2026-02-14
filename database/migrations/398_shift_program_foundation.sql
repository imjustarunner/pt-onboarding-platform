-- Migration: Shift-based program foundation
-- Description: program_sites, program_settings, program_staff_assignments for shift-based programs

-- Program sites (sites belong to programs, link to office_location for kiosk)
CREATE TABLE IF NOT EXISTS program_sites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  program_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT NULL,
  office_location_id INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_program_sites_program
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_program_sites_office_location
    FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE SET NULL,
  INDEX idx_program_sites_program (program_id),
  INDEX idx_program_sites_office_location (office_location_id),
  INDEX idx_program_sites_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Program settings (shift-specific config)
CREATE TABLE IF NOT EXISTS program_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  program_id INT NOT NULL,
  default_direct_hours DECIMAL(5,2) NOT NULL DEFAULT 3.00,
  on_call_pay_amount DECIMAL(10,2) NULL,
  bonus_perfect_attendance DECIMAL(10,2) NULL,
  bonus_shift_coverage DECIMAL(10,2) NULL,
  shift_scheduling_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_program_settings_program (program_id),
  CONSTRAINT fk_program_settings_program
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Staff assignments to program (extends user_programs with role and hour requirements)
CREATE TABLE IF NOT EXISTS program_staff_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  program_id INT NOT NULL,
  user_id INT NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT 'participant',
  min_scheduled_hours_per_week DECIMAL(5,2) NULL,
  min_on_call_hours_per_week DECIMAL(5,2) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_program_staff_program_user (program_id, user_id),
  CONSTRAINT fk_program_staff_program
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_program_staff_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_program_staff_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_program_staff_program (program_id),
  INDEX idx_program_staff_user (user_id),
  INDEX idx_program_staff_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

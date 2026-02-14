-- Migration: Shift-based program time punches
-- Description: program_time_punches for clock in/out at kiosk

CREATE TABLE IF NOT EXISTS program_time_punches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  program_id INT NOT NULL,
  program_site_id INT NOT NULL,
  user_id INT NULL,
  guardian_user_id INT NULL,
  punch_type ENUM('clock_in','clock_out','guardian_check_in','guardian_check_out') NOT NULL,
  punched_at DATETIME NOT NULL,
  kiosk_location_id INT NULL,
  client_id INT NULL COMMENT 'For guardian check-in/out',
  direct_hours DECIMAL(6,2) NULL COMMENT 'Computed on clock_out',
  indirect_hours DECIMAL(6,2) NULL COMMENT 'Computed on clock_out',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_time_punches_program
    FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_time_punches_site
    FOREIGN KEY (program_site_id) REFERENCES program_sites(id) ON DELETE CASCADE,
  CONSTRAINT fk_time_punches_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_time_punches_guardian
    FOREIGN KEY (guardian_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_time_punches_kiosk
    FOREIGN KEY (kiosk_location_id) REFERENCES office_locations(id) ON DELETE SET NULL,
  CONSTRAINT fk_time_punches_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  INDEX idx_time_punches_program (program_id),
  INDEX idx_time_punches_user (user_id),
  INDEX idx_time_punches_guardian (guardian_user_id),
  INDEX idx_time_punches_punched_at (punched_at),
  INDEX idx_time_punches_program_user_date (program_id, user_id, punched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

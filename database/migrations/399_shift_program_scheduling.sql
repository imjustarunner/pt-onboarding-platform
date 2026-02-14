-- Migration: Shift-based program scheduling
-- Description: program_site_shift_slots, program_shift_signups

-- Site shift availability (admin-defined slots)
CREATE TABLE IF NOT EXISTS program_site_shift_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  program_site_id INT NOT NULL,
  weekday TINYINT NOT NULL COMMENT '0=Sunday .. 6=Saturday',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_type ENUM('scheduled','on_call') NOT NULL DEFAULT 'scheduled',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shift_slots_site
    FOREIGN KEY (program_site_id) REFERENCES program_sites(id) ON DELETE CASCADE,
  INDEX idx_shift_slots_site (program_site_id),
  INDEX idx_shift_slots_weekday (weekday),
  INDEX idx_shift_slots_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shift sign-ups (staff self-booking)
CREATE TABLE IF NOT EXISTS program_shift_signups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  program_site_id INT NOT NULL,
  program_site_shift_slot_id INT NULL,
  user_id INT NOT NULL,
  slot_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  signup_type ENUM('scheduled','on_call') NOT NULL DEFAULT 'scheduled',
  status ENUM('confirmed','released','covered') NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_shift_signups_site
    FOREIGN KEY (program_site_id) REFERENCES program_sites(id) ON DELETE CASCADE,
  CONSTRAINT fk_shift_signups_slot
    FOREIGN KEY (program_site_shift_slot_id) REFERENCES program_site_shift_slots(id) ON DELETE SET NULL,
  CONSTRAINT fk_shift_signups_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_shift_signups_site_date (program_site_id, slot_date),
  INDEX idx_shift_signups_user (user_id),
  INDEX idx_shift_signups_date (slot_date),
  INDEX idx_shift_signups_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

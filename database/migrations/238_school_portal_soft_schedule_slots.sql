-- Migration: School portal soft schedule slots + day/provider assignments
-- Description:
-- - Adds explicit school day schedules and which providers appear on each day.
-- - Adds soft_schedule_slots which support empty (open) slots, ordering, and optional client placement.
-- Notes:
-- - Weekdays are limited to Monday-Friday per School Portal spec.
-- - start_time/end_time are nullable to support open slots without times yet.

CREATE TABLE IF NOT EXISTS school_day_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_organization_id INT NOT NULL,
  weekday ENUM('Monday','Tuesday','Wednesday','Thursday','Friday') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_school_day (school_organization_id, weekday),
  INDEX idx_school_day (school_organization_id, weekday),
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS school_day_provider_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_organization_id INT NOT NULL,
  weekday ENUM('Monday','Tuesday','Wednesday','Thursday','Friday') NOT NULL,
  provider_user_id INT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_school_day_provider (school_organization_id, weekday, provider_user_id),
  INDEX idx_school_day_provider (school_organization_id, weekday, provider_user_id),
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS soft_schedule_slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_organization_id INT NOT NULL,
  weekday ENUM('Monday','Tuesday','Wednesday','Thursday','Friday') NOT NULL,
  provider_user_id INT NOT NULL,
  slot_index INT NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  client_id INT NULL,
  note TEXT NULL,
  created_by_user_id INT NOT NULL,
  updated_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_soft_slot (school_organization_id, weekday, provider_user_id, slot_index),
  INDEX idx_soft_slot_lookup (school_organization_id, provider_user_id, weekday),
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Migration: Create school provider schedule entries (school-entered)
-- Description: Allows school staff to enter provider schedules (non-blocking, advisory warnings handled in app).
-- Notes:
-- - day_of_week matches provider_school_assignments enum (Monday-Friday)
-- - start/end are TIME and not validated for overlap at DB-level (warnings handled in API)

CREATE TABLE IF NOT EXISTS school_provider_schedule_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_organization_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday') NOT NULL,
  client_id INT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room VARCHAR(128) NULL,
  teacher VARCHAR(128) NULL,
  notes TEXT NULL,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_sps_school (school_organization_id),
  INDEX idx_sps_provider (provider_user_id),
  INDEX idx_sps_day (day_of_week),
  INDEX idx_sps_client (client_id),
  INDEX idx_sps_time (start_time, end_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


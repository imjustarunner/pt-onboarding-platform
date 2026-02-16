-- Daily automation run log for agency birthday/anniversary announcements.
-- Prevents duplicate sends across retries/restarts/parallel instances.

CREATE TABLE IF NOT EXISTS agency_announcement_automation_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  run_date DATE NOT NULL,
  automation_type ENUM('birthday', 'anniversary') NOT NULL,
  status ENUM('pending', 'sent') NOT NULL DEFAULT 'pending',
  notification_id INT NULL,
  payload_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_aa_automation_run (agency_id, run_date, automation_type),
  INDEX idx_aa_automation_status (status, run_date),
  CONSTRAINT fk_aa_automation_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_aa_automation_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

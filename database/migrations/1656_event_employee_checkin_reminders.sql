CREATE TABLE IF NOT EXISTS company_event_checkin_reminders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  user_id INT NOT NULL,
  event_date DATE NOT NULL,
  channel VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'sending',
  status_reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_checkin_reminder (company_event_id, user_id, event_date, channel),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_event_checkin_sms_receipts (
  provider_message_id VARCHAR(100) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  company_event_id INT NOT NULL,
  action VARCHAR(12) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- New school-event work uses the employee's indirect rate. Existing payroll
-- claims retain the rate slot captured when the work was recorded.
UPDATE payroll_event_type_rate_maps SET rate_slot = 'indirect', use_direct_indirect_split = 0
WHERE LEFT(event_type, 7) = 'school_';

UPDATE payroll_indirect_service_types
SET description = 'Approved travel to and from events and other assignments, paid at the Support Activity rate'
WHERE type_key = 'approved_travel' AND description = 'Approved travel time';

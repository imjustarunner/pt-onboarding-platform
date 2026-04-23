-- Per-date slot count overrides for the facilitator availability scheduling system.
-- When an admin manually overrides the auto-computed slot count (default 2,
-- auto-expands to 4 on 2+ groups or 9+ participants), the override is stored here.
-- The effective slot count = override if set, otherwise auto-computed.

CREATE TABLE IF NOT EXISTS facilitator_availability_slot_overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  company_event_id INT NOT NULL,
  entry_date DATE NOT NULL,
  slot_count INT NOT NULL,
  overridden_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_faso_request_event_date (request_id, company_event_id, entry_date),
  INDEX idx_faso_request (request_id),
  CONSTRAINT fk_faso_request
    FOREIGN KEY (request_id) REFERENCES facilitator_availability_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_faso_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_faso_user
    FOREIGN KEY (overridden_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

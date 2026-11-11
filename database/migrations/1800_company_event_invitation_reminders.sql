-- Durable claims prevent reminder duplicates across workers and retries.
CREATE TABLE IF NOT EXISTS company_event_notification_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  user_id INT NOT NULL,
  channel VARCHAR(12) NOT NULL,
  delivery_kind VARCHAR(32) NOT NULL,
  schedule_key VARCHAR(160) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'claimed',
  status_reason VARCHAR(255) NULL,
  claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  UNIQUE KEY uq_event_notification_slot (company_event_id,user_id,channel,delivery_kind,schedule_key),
  KEY idx_event_notification_status (company_event_id,status),
  FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

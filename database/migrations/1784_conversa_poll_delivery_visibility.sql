-- Preserve receipt times independently of later replies and record actual poll views.
ALTER TABLE company_event_sms_deliveries
  ADD COLUMN sent_at DATETIME NULL,
  ADD COLUMN delivered_at DATETIME NULL,
  ADD COLUMN failed_at DATETIME NULL;
ALTER TABLE company_event_dispatch_logs ADD COLUMN viewed_at DATETIME NULL;
CREATE TABLE IF NOT EXISTS company_event_poll_views (
  company_event_id INT NOT NULL,
  user_id INT NOT NULL,
  first_viewed_at DATETIME NOT NULL,
  last_viewed_at DATETIME NOT NULL,
  PRIMARY KEY (company_event_id, user_id),
  CONSTRAINT fk_poll_view_event FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_poll_view_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE user_notification_type_preferences
  ADD COLUMN delivery_mode VARCHAR(32) NULL;
ALTER TABLE school_closure_notice_deliveries
  MODIFY recipient_email VARCHAR(255) NULL,
  ADD COLUMN delivery_mode VARCHAR(32) NULL,
  ADD COLUMN notification_id INT NULL,
  ADD COLUMN external_reference VARCHAR(255) NULL;
CREATE TABLE IF NOT EXISTS school_closure_dashboard_dismissals (
  user_id INT NOT NULL,
  event_id INT NOT NULL,
  event_revision CHAR(64) NOT NULL,
  dismissed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,event_id,event_revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

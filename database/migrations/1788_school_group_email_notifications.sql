ALTER TABLE communication_messages ADD COLUMN suppress_push TINYINT(1) NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS school_group_email_notification_receipts (
  agency_id INT NOT NULL,
  delivery_hash CHAR(64) NOT NULL,
  user_id INT NOT NULL,
  notification_id INT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (agency_id,delivery_hash,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agency_parent_email_controls (
  agency_id INT PRIMARY KEY,
  routine_emails_paused TINYINT(1) NOT NULL DEFAULT 0,
  reason VARCHAR(500) NULL,
  updated_by_user_id INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

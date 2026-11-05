-- Migration 1763: remember personal-email and text enrollment while an employee is inactive
CREATE TABLE IF NOT EXISTS staff_notification_holds (
  user_id INT NOT NULL PRIMARY KEY,
  personal_email_notify TINYINT NULL,
  had_personal_email_pref TINYINT(1) NOT NULL DEFAULT 0,
  sms_enabled TINYINT NULL,
  had_user_preferences TINYINT(1) NOT NULL DEFAULT 0,
  permissions_json JSON NOT NULL,
  held_at DATETIME NOT NULL,
  restored_at DATETIME NULL,
  CONSTRAINT fk_staff_notification_holds_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

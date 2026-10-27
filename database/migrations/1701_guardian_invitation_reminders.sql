-- Only explicitly sent invitations enroll in this schedule; no historical backfill.
ALTER TABLE co_guardian_invite_deliveries
  ADD COLUMN delivery_kind VARCHAR(24) NOT NULL DEFAULT 'invitation',
  ADD COLUMN automatic_reminder TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE co_guardian_invite_reminders (
  invite_id INT NOT NULL PRIMARY KEY,
  recipient_email VARCHAR(255) NOT NULL,
  first_sent_at DATETIME NOT NULL,
  next_due_at DATETIME NULL,
  reminders_attempted TINYINT UNSIGNED NOT NULL DEFAULT 0,
  state VARCHAR(24) NOT NULL DEFAULT 'active',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_guardian_reminder_due (state, next_due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

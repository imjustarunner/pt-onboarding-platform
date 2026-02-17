/*
Tracks presenter reminder delivery checkpoints to prevent duplicate reminders.
*/

CREATE TABLE IF NOT EXISTS supervision_presenter_reminders (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  presenter_assignment_id BIGINT NOT NULL,
  reminder_type VARCHAR(32) NOT NULL,      /* d7 | h24 | h1 */
  scheduled_for DATETIME NOT NULL,
  sent_at DATETIME NULL,
  notification_id INT NULL,
  channel VARCHAR(32) NOT NULL DEFAULT 'in_app',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_supervision_presenter_reminder (presenter_assignment_id, reminder_type),
  INDEX idx_supervision_presenter_reminder_scheduled (scheduled_for, sent_at),

  CONSTRAINT fk_supervision_presenter_reminder_assignment
    FOREIGN KEY (presenter_assignment_id) REFERENCES supervision_session_presenters(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_supervision_presenter_reminder_notification
    FOREIGN KEY (notification_id) REFERENCES notifications(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

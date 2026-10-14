-- Stable identifiers let presenter changes update generated items without
-- duplicating them or resetting the host's custom agenda order.
ALTER TABLE meeting_agenda_items
  ADD COLUMN generated_key VARCHAR(80) NULL,
  ADD UNIQUE KEY uq_agenda_generated (meeting_agenda_id, generated_key);

ALTER TABLE supervision_sessions MODIFY COLUMN cancel_reason VARCHAR(500) NULL;

-- One receipt per participant and specific schedule change, including retries.
CREATE TABLE meeting_schedule_change_deliveries (
  change_key CHAR(64) NOT NULL,
  user_id INT NOT NULL,
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'sending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (change_key,user_id)
) ENGINE=InnoDB;

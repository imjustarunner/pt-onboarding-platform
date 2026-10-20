-- Preserve withdrawn recipients' saved work without counting them as completed
-- or sending them further invitations and reminders.
ALTER TABLE provider_update_recipients
  MODIFY COLUMN status ENUM('not_started','in_progress','finalized','withdrawn')
  NOT NULL DEFAULT 'not_started';

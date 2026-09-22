-- Add receipt links and retry deduplication after the base meeting settings migration.
ALTER TABLE meeting_email_invitations ADD COLUMN communication_id INT NULL;
ALTER TABLE meeting_schedule_change_queue ADD COLUMN batch_key CHAR(36) NULL;
UPDATE meeting_schedule_change_queue SET batch_key = UUID() WHERE batch_key IS NULL;
ALTER TABLE meeting_schedule_change_queue MODIFY COLUMN batch_key CHAR(36) NOT NULL;
ALTER TABLE meeting_reminder_deliveries
  ADD COLUMN communication_id INT NULL,
  ADD COLUMN delivery_status VARCHAR(24) NOT NULL DEFAULT 'sent';
CREATE TABLE IF NOT EXISTS meeting_change_deliveries (
  batch_key CHAR(36) NOT NULL, snapshot_hash CHAR(64) NOT NULL, user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (batch_key,snapshot_hash,user_id)
);

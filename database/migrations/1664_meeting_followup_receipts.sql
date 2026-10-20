-- Separate the requested historical receipt rollout from the original summary email.
-- Existing delivery history remains intact and prevents duplicate initial notices.
ALTER TABLE meeting_followup_deliveries
  ADD COLUMN delivery_key VARCHAR(80) NOT NULL DEFAULT 'initial',
  ADD COLUMN notification_id INT NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (meeting_type,meeting_id,user_id,delivery_key);

ALTER TABLE supervision_sessions
  ADD COLUMN calendar_deleted_at DATETIME NULL,
  ADD COLUMN cancel_attribution VARCHAR(32) NULL;

CREATE TABLE IF NOT EXISTS supervision_schedule_actions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  action_kind VARCHAR(24) NOT NULL,
  attribution VARCHAR(32) NULL,
  reason VARCHAR(500) NOT NULL,
  details_json JSON NULL,
  dedupe_key VARCHAR(100) NULL,
  delivery_state VARCHAR(24) NOT NULL DEFAULT 'none',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_supervision_schedule_action (dedupe_key),
  KEY idx_supervision_action_delivery (delivery_state,id),
  KEY idx_supervision_action_session (session_id,id)
);

ALTER TABLE meeting_schedule_change_deliveries
  ADD COLUMN meeting_type VARCHAR(24) NULL,
  ADD COLUMN meeting_ids_json JSON NULL,
  ADD COLUMN action_kind VARCHAR(24) NULL,
  ADD COLUMN communication_id BIGINT NULL;

INSERT INTO notification_triggers (trigger_key,name,description,default_enabled,default_channels_json,default_recipients_json)
VALUES ('supervision_missed','Supervision marked missed','Sent only after the assigned supervisor confirms a missed supervision occurrence.',1,
  JSON_OBJECT('inApp',FALSE,'sms',FALSE,'email',TRUE),JSON_OBJECT('provider',TRUE,'supervisor',TRUE))
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description);

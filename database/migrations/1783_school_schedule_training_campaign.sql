CREATE TABLE IF NOT EXISTS school_schedule_training_campaigns (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  campaign_key VARCHAR(100) NOT NULL,
  starts_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  launch_communication_id INT NULL,
  expiry_communication_id INT NULL,
  launch_accepted_at DATETIME NULL,
  expiry_accepted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_schedule_training (agency_id, campaign_key)
);

-- Start the 30-day window when this release is activated, never at build time.
-- Re-running migrations must not renew an existing campaign or resend its emails.
INSERT INTO school_schedule_training_campaigns (agency_id, campaign_key, starts_at, expires_at)
SELECT id, 'school-my-schedule-20261109', UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY)
FROM agencies WHERE slug = 'itsco' AND organization_type = 'agency' AND is_active = 1
ON DUPLICATE KEY UPDATE campaign_key = VALUES(campaign_key);

INSERT IGNORE INTO notification_triggers
  (trigger_key, name, description, default_enabled, default_channels_json, default_recipients_json)
VALUES ('school_schedule_training', 'School provider schedule training',
  'Announce the My Schedule update to school providers and remind ITSCO admin when the video expires.',
  1, JSON_OBJECT('email', TRUE, 'sms', FALSE, 'inApp', FALSE), JSON_OBJECT());

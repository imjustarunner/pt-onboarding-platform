ALTER TABLE provider_schedule_events ADD COLUMN meeting_settings_json JSON NULL;
CREATE TABLE IF NOT EXISTS agency_meeting_types (
  agency_id INT NOT NULL, type_key VARCHAR(32) NOT NULL, settings_json JSON NOT NULL,
  updated_by_user_id INT NOT NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, type_key)
);
CREATE TABLE IF NOT EXISTS meeting_participant_preferences (
  event_id INT NOT NULL, user_id INT NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1, is_cohost TINYINT(1) NOT NULL DEFAULT 0,
  rsvp VARCHAR(16) NOT NULL DEFAULT 'pending', rsvp_at DATETIME NULL,
  PRIMARY KEY (event_id,user_id)
);
CREATE TABLE IF NOT EXISTS meeting_schedule_change_queue (
  event_id INT NOT NULL PRIMARY KEY, baseline_json JSON NOT NULL, current_json JSON NOT NULL,
  ready_at DATETIME NOT NULL, notify_enabled TINYINT(1) NOT NULL DEFAULT 1,
  INDEX (ready_at)
);
CREATE TABLE IF NOT EXISTS meeting_reminder_deliveries (
  event_id INT NOT NULL, user_id INT NOT NULL, reminder_key VARCHAR(40) NOT NULL,
  start_at DATETIME NOT NULL, sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id,user_id,reminder_key,start_at)
);

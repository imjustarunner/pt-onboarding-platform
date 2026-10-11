-- Separate email opt-in; never infer it from planned outs or voice vacation mode.
CREATE TABLE IF NOT EXISTS agency_vacation_templates (
  agency_id INT NOT NULL PRIMARY KEY,
  templates_json JSON NOT NULL,
  support_contact VARCHAR(320) NOT NULL,
  updated_by_user_id INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS user_email_vacation_responders (
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  planned_out_id INT NULL,
  ends_at DATETIME NULL,
  time_zone VARCHAR(64) NOT NULL DEFAULT 'America/Denver',
  template_key VARCHAR(64) NOT NULL DEFAULT 'provider_colorado_springs',
  message_template TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, user_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (planned_out_id) REFERENCES planned_outs(id) ON DELETE SET NULL
);
-- One reply per recipient per day, across threads; atomic claim prevents concurrent duplicate sends.
CREATE TABLE IF NOT EXISTS email_vacation_reply_claims (
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  recipient_hash CHAR(64) NOT NULL,
  claimed_at DATETIME NOT NULL,
  PRIMARY KEY (agency_id, user_id, recipient_hash),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

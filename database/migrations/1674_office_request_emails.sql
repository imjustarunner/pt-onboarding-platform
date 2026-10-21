-- Designated reviewers, not every account sharing an administrative role.
CREATE TABLE IF NOT EXISTS office_approval_email_reviewers (
  office_location_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (office_location_id,user_id),
  FOREIGN KEY (office_location_id) REFERENCES office_locations(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- One durable item per request/recipient. Workers combine ready items into a
-- single email; neither retries nor alternate request entry points add copies.
CREATE TABLE IF NOT EXISTS office_request_email_queue (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(16) NOT NULL,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  request_key VARCHAR(64) NOT NULL,
  payload_json JSON NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  ready_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  sent_at DATETIME NULL,
  communication_id BIGINT NULL,
  last_error VARCHAR(255) NULL,
  UNIQUE KEY office_email_request (kind,user_id,request_key),
  KEY office_email_due (status,ready_at),
  KEY office_email_group (kind,agency_id,user_id,status)
);

INSERT INTO notification_triggers (trigger_key,name,description,default_enabled,default_channels_json,default_recipients_json)
VALUES
 ('office_request_review','New office request','Details and Building Master review link for designated office approvers.',1,JSON_OBJECT('inApp',TRUE,'sms',FALSE,'email',TRUE),JSON_OBJECT('clinicalPracticeAssistant',TRUE)),
 ('office_request_decision','Office request decisions','One provider email after five minutes without another decision, with room details and confirmed session information.',1,JSON_OBJECT('inApp',TRUE,'sms',FALSE,'email',TRUE),JSON_OBJECT('provider',TRUE))
ON DUPLICATE KEY UPDATE name=VALUES(name),description=VALUES(description);

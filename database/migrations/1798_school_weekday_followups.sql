CREATE TABLE IF NOT EXISTS school_weekday_followup_settings (
  agency_id INT NOT NULL PRIMARY KEY,
  owner_user_id INT NOT NULL,
  sender_identity_id INT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sms_delay_hours INT NOT NULL DEFAULT 24,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS school_weekday_followups (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  request_key VARCHAR(64) NOT NULL,
  requested_at DATETIME(3) NOT NULL,
  opened_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  invitation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  invitation_communication_id BIGINT NULL,
  invitation_sent_at DATETIME(3) NULL,
  sms_status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  sms_due_at DATETIME(3) NULL,
  sms_message_id VARCHAR(128) NULL,
  sms_sent_at DATETIME(3) NULL,
  sms_reason VARCHAR(255) NULL,
  thankyou_status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  thankyou_communication_id BIGINT NULL,
  thankyou_sent_at DATETIME(3) NULL,
  last_error VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_weekday_request (agency_id,provider_id,request_key),
  KEY idx_school_weekday_progress (agency_id,provider_id,id),
  KEY idx_school_weekday_due (cancelled_at,completed_at,sms_status,sms_due_at)
);

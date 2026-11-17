CREATE TABLE IF NOT EXISTS school_weekday_email_reminders (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  requested_by_user_id INT NOT NULL,
  request_key VARCHAR(80) NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'reminder',
  requested_at DATETIME(3) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  active_request TINYINT GENERATED ALWAYS AS (IF(status IN ('pending','sending','review'),1,NULL)) STORED,
  communication_id BIGINT NULL,
  sent_at DATETIME(3) NULL,
  last_error VARCHAR(500) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_email_reminder_key (agency_id,provider_id,request_key),
  UNIQUE KEY uq_school_email_reminder_active (agency_id,provider_id,active_request),
  KEY idx_school_email_reminder_progress (agency_id,provider_id,id),
  KEY idx_school_email_reminder_pending (status,agency_id,id)
);

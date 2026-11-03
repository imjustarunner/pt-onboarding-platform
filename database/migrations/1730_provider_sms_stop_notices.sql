-- Delivery state is separate from immutable SMS consent events.
CREATE TABLE IF NOT EXISTS provider_sms_stop_notices (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  permission_event_id BIGINT NOT NULL,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  receipt_json JSON NULL,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_stop_notice (permission_event_id,user_id),
  KEY idx_provider_stop_notice_due (status,next_attempt_at)
);

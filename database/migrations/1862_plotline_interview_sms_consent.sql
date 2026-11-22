CREATE TABLE IF NOT EXISTS hiring_interview_sms_consents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  interview_id INT NOT NULL,
  recorded_by_user_id INT NOT NULL,
  phone VARCHAR(18) NOT NULL,
  number_id INT NOT NULL,
  brand_id VARCHAR(64) NOT NULL,
  campaign_id VARCHAR(64) NOT NULL,
  disclosure TEXT NOT NULL,
  recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  confirmation_status ENUM('pending','sending','sent','failed') NOT NULL DEFAULT 'pending',
  confirmation_message_id VARCHAR(128) NULL,
  KEY interview_latest (interview_id, id),
  KEY confirmation_queue (confirmation_status, id),
  CONSTRAINT hiring_interview_sms_consent_interview_fk FOREIGN KEY (interview_id) REFERENCES hiring_interviews(id) ON DELETE CASCADE
);

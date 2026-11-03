-- Automated keyword replies have no human author. Claim each inbound event
-- before sending; uncertain attempts remain reviewable and are never replayed.
CREATE TABLE IF NOT EXISTS sms_keyword_reply_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  number_id INT NOT NULL,
  inbound_message_id VARCHAR(191) NOT NULL,
  keyword VARCHAR(8) NOT NULL,
  from_number VARCHAR(32) NOT NULL,
  to_number VARCHAR(32) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  provider_message_id VARCHAR(191) NULL,
  error_code VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY keyword_reply_once (number_id,inbound_message_id),
  KEY keyword_reply_review (status,created_at),
  KEY keyword_reply_carrier (provider_message_id)
);

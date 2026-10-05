-- Phone + carrier campaign scope, independent of client records and number purpose.
-- No legacy flags are converted to affirmative consent automatically.
CREATE TABLE IF NOT EXISTS sms_sender_registrations (
  number_id INT NOT NULL PRIMARY KEY,
  campaign_id VARCHAR(64) NOT NULL,
  registration_json JSON NOT NULL,
  updated_by_user_id INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_sms_registration_campaign (campaign_id)
);

CREATE TABLE IF NOT EXISTS sms_recipient_permissions (
  scope_key VARCHAR(80) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  purpose VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL,
  evidence_json JSON NOT NULL,
  expires_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (scope_key, phone, purpose)
);

CREATE TABLE IF NOT EXISTS sms_permission_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  scope_key VARCHAR(80) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  purpose VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL,
  evidence_json JSON NOT NULL,
  provider_message_id VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sms_permission_history (scope_key, phone, created_at),
  UNIQUE KEY uq_sms_permission_provider_event (scope_key, phone, purpose, provider_message_id)
);

CREATE TABLE IF NOT EXISTS sms_consent_requests (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  number_id INT NOT NULL,
  phone VARCHAR(20) NOT NULL,
  signer_role VARCHAR(20) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  disclosure_json JSON NOT NULL,
  disclosure_hash CHAR(64) NOT NULL,
  signed_payload_json JSON NULL,
  activation_json JSON NULL,
  review_token CHAR(64) NULL,
  created_by_user_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  signed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sms_consent_request_token (token_hash),
  KEY idx_sms_consent_request_agency (agency_id, signed_at)
);

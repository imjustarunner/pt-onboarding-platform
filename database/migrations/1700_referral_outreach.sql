ALTER TABLE referral_directory_entries ADD COLUMN service_tags JSON NULL;

CREATE TABLE IF NOT EXISTS referral_outreach_drafts (
  id CHAR(36) PRIMARY KEY,
  agency_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  payload_ciphertext MEDIUMTEXT NOT NULL,
  payload_iv VARCHAR(64) NOT NULL,
  payload_auth_tag VARCHAR(64) NOT NULL,
  encryption_key_id VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  ticket_id INT NULL,
  transport_message_id VARCHAR(255) NULL,
  communication_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_referral_outreach_scope (agency_id, actor_user_id)
);

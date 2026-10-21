CREATE TABLE IF NOT EXISTS family_notification_choices (
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  recipient_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  phone_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  choices_json JSON NOT NULL,
  revision INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, client_id, guardian_user_id),
  INDEX idx_family_choices_recipient (agency_id, recipient_hash),
  INDEX idx_family_choices_phone (agency_id, phone_hash)
);
CREATE TABLE IF NOT EXISTS family_notification_invitations (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  recipient_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_by_user_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_family_notification_invitee (agency_id, client_id, guardian_user_id)
);
CREATE TABLE IF NOT EXISTS family_notification_choice_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  recipient_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  choices_json JSON NOT NULL,
  disclosure_version VARCHAR(40) NOT NULL,
  disclosure_text TEXT NOT NULL,
  revision INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_family_notification_choice_revision (agency_id, client_id, guardian_user_id, revision)
);

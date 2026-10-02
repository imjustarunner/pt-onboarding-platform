CREATE TABLE IF NOT EXISTS guardian_portal_policies (
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  shared_billing TINYINT(1) NOT NULL DEFAULT 0,
  source_invite_id INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,client_id)
);
CREATE TABLE IF NOT EXISTS guardian_payment_preferences (
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  guardian_user_id INT NOT NULL,
  preference_encrypted TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id,client_id,guardian_user_id)
);
CREATE TABLE IF NOT EXISTS family_balance_notifications (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  receivable_id BIGINT NOT NULL,
  guardian_user_id INT NOT NULL,
  status ENUM('pending','sending','sent','held','skipped','unknown') NOT NULL DEFAULT 'pending',
  communication_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY family_balance_recipient (receivable_id,guardian_user_id),
  KEY family_balance_pending (status,agency_id)
);

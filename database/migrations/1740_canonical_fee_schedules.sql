-- Charges quoted for new services. Historical claim/receipt amounts are never
-- rewritten when a fee changes. Rates and visibility choices retain all revisions.
CREATE TABLE IF NOT EXISTS medical_fee_schedule_state (
  owner_key VARCHAR(64) NOT NULL PRIMARY KEY,
  revision INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS medical_fee_schedule_rates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_key VARCHAR(64) NOT NULL,
  agency_id INT NULL,
  revision INT UNSIGNED NOT NULL,
  record_type ENUM('rate','visibility') NOT NULL DEFAULT 'rate',
  mode ENUM('insurance','self_pay') NOT NULL,
  scope_key VARCHAR(128) NOT NULL,
  service_code VARCHAR(32) NOT NULL,
  rate_cents INT UNSIGNED NULL,
  rate_unit ENUM('unit','session','hour') NULL,
  is_hidden TINYINT(1) NULL,
  action VARCHAR(40) NOT NULL,
  reason VARCHAR(1000) NULL,
  actor_user_id INT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_medical_fee_revision (owner_key,revision,record_type,mode,scope_key,service_code),
  KEY idx_medical_fee_latest (owner_key,mode,record_type,scope_key,service_code,id),
  KEY idx_medical_fee_agency (agency_id,id),
  CONSTRAINT fk_medical_fee_state FOREIGN KEY (owner_key) REFERENCES medical_fee_schedule_state(owner_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP TRIGGER IF EXISTS medical_fee_schedule_rates_no_update;
DROP TRIGGER IF EXISTS medical_fee_schedule_rates_no_delete;
CREATE TRIGGER medical_fee_schedule_rates_no_update BEFORE UPDATE ON medical_fee_schedule_rates
FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fee revisions are immutable; append a new revision';
CREATE TRIGGER medical_fee_schedule_rates_no_delete BEFORE DELETE ON medical_fee_schedule_rates
FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fee revision history cannot be deleted';

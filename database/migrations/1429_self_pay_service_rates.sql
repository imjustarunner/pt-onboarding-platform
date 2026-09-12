-- Separate self-pay fee schedules from insurance charges and public finder display rates.
CREATE TABLE self_pay_service_rates (
  agency_id INT NOT NULL,
  tenant_service_id INT UNSIGNED NOT NULL,
  provider_user_id INT NOT NULL DEFAULT 0 COMMENT '0 = agency default',
  rate_cents INT UNSIGNED NOT NULL,
  rate_unit ENUM('session','hour') NOT NULL DEFAULT 'session',
  updated_by_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, tenant_service_id, provider_user_id)
);
CREATE TABLE agency_self_pay_settings (
  agency_id INT NOT NULL PRIMARY KEY,
  self_pay_only TINYINT(1) NOT NULL DEFAULT 0,
  updated_by_user_id INT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

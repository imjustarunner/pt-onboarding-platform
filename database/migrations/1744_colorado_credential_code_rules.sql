-- Migration 1744: practice updates to Colorado credential eligibility.
-- A missing row means the Colorado default in the application still applies.
-- A saved row is the update to use when Colorado changes a rule.

CREATE TABLE IF NOT EXISTS billing_credential_code_rules (
  id INT NOT NULL AUTO_INCREMENT,
  state_code VARCHAR(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CO',
  service_code VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  credential_tier VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  allowed TINYINT(1) NOT NULL DEFAULT 0,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_billing_credential_code_rule (state_code, service_code, credential_tier),
  KEY idx_billing_credential_code_rule_code (state_code, service_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

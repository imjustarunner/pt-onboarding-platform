-- Migration 032: rejection and denial signals the biller can turn into a rule.
-- Rows store payer, service, and reason codes. They do not store patient identifiers.
CREATE TABLE IF NOT EXISTS claim_outcome_signals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  clinical_claim_id BIGINT UNSIGNED NOT NULL,
  outcome ENUM('rejected','denied') NOT NULL,
  reason_code VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  payer_id VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  service_code VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  modifiers_json JSON NULL,
  place_of_service VARCHAR(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  occurred_on DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_claim_outcome_signal (agency_id, clinical_claim_id, outcome, reason_code),
  KEY idx_outcome_pattern (agency_id, reason_code, payer_id, service_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS billing_rule_suggestions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  suggestion_key VARCHAR(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  kind VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  prompt VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  payload_json JSON NOT NULL,
  status ENUM('pending','accepted','dismissed') NOT NULL DEFAULT 'pending',
  match_count INT NOT NULL DEFAULT 1,
  decided_by_user_id INT NULL,
  decided_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_billing_suggestion (agency_id, suggestion_key),
  KEY idx_billing_suggestion_status (agency_id, status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

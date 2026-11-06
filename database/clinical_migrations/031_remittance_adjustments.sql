-- Migration 031: queryable remittance adjustments. No patient names or member ids.
CREATE TABLE IF NOT EXISTS claimmd_remittance_adjustments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  clinical_claim_id BIGINT UNSIGNED NOT NULL,
  remittance_item_id BIGINT UNSIGNED NOT NULL,
  line_number INT NULL,
  procedure_code VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  group_code VARCHAR(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  reason_code VARCHAR(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  amount_cents INT NOT NULL,
  allowed_cents INT NULL,
  remark_codes_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_remit_adj_claim (agency_id, clinical_claim_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

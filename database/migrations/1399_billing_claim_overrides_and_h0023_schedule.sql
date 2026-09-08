-- Migration 1399: billing claim overrides (POS remaps) + H0023 on scheduling catalog

INSERT IGNORE INTO scheduling_service_codes (code, label, is_billable, default_note_type, min_duration_minutes, is_active)
VALUES ('H0023', 'Contact / behavioral health outreach', 1, 'PROGRESS_NOTE', 15, 1);

UPDATE scheduling_service_codes
SET label = 'Contact / behavioral health outreach',
    is_billable = 1,
    default_note_type = 'PROGRESS_NOTE',
    min_duration_minutes = COALESCE(min_duration_minutes, 15),
    is_active = 1
WHERE code = 'H0023';

CREATE TABLE IF NOT EXISTS billing_claim_overrides (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  scope ENUM('payer', 'client', 'claim') NOT NULL,
  payer_name VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  client_id INT NULL,
  claim_id BIGINT UNSIGNED NULL,
  field_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'place_of_service',
  from_value VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  to_value VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  created_by_user_id INT NULL,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bco_agency_scope (agency_id, scope, is_active),
  KEY idx_bco_client (client_id),
  KEY idx_bco_claim (claim_id),
  KEY idx_bco_payer (agency_id, payer_name(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

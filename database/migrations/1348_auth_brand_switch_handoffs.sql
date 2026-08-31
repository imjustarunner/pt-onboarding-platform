-- Migration 1348: One-time tokens for superadmin cross-domain tenant (brand) switch.
-- Auth cookies are host-scoped, so switching plottwisthq.com → app.itsco.health needs a handoff.

CREATE TABLE IF NOT EXISTS auth_brand_switch_handoffs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  jti VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  user_id INT NOT NULL,
  target_host VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  agency_id INT NULL DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_auth_brand_switch_jti (jti),
  KEY idx_auth_brand_switch_expires (expires_at),
  KEY idx_auth_brand_switch_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration 1327: ephemeral Quick View delivery tokens for digests/reminders
-- Does not replace or revoke the persistent URL token (hash-only, shown once).

CREATE TABLE IF NOT EXISTS quick_view_delivery_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NULL,
  purpose VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT 'digest|join_reminder|manual',
  token_hash CHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  deep_link_path VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL
    COMMENT 'Optional path after unlock (e.g. meeting join)',
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_qv_delivery_hash (token_hash),
  KEY idx_qv_delivery_user (user_id, purpose),
  KEY idx_qv_delivery_expires (expires_at),
  CONSTRAINT fk_qv_delivery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

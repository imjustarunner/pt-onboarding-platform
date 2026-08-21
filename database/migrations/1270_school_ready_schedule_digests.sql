-- Migration 1270: Ready-to-schedule school digest queue (Mon/Wed/Fri 10am MT)
CREATE TABLE IF NOT EXISTS school_ready_schedule_digest_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  client_id INT NOT NULL,
  client_initials VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  client_label VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  window_key VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL
    COMMENT 'e.g. 2026-08-20_wed — digest send slot this item belongs to',
  marked_ready_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  digest_communication_id INT NULL DEFAULT NULL
    COMMENT 'user_communications.id for the pending/sent digest draft',
  UNIQUE KEY uq_rts_digest_client_window (school_organization_id, client_id, window_key),
  KEY idx_rts_digest_window (agency_id, school_organization_id, window_key),
  KEY idx_rts_digest_comm (digest_communication_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

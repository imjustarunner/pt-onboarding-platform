-- Migration 1043: track who is in a supervision video room for guest-join locking
CREATE TABLE IF NOT EXISTS supervision_session_join_presence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  join_identity VARCHAR(128) NOT NULL COMMENT 'user-{id} or guest-{uuid}',
  display_name VARCHAR(255) NULL,
  is_guest TINYINT(1) NOT NULL DEFAULT 0,
  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME NULL DEFAULT NULL,
  UNIQUE KEY uq_supv_join_presence_session_identity (session_id, join_identity),
  KEY idx_supv_join_presence_active (session_id, left_at, last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

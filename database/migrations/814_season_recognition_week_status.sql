-- 814_season_recognition_week_status.sql
-- Manager-gated approval table for posting weekly recognition trophies.
-- One row per (season, week). Status starts as 'pending' once a week boundary
-- passes. The manager must explicitly click "Post Trophies" to move it to
-- 'posted', which triggers winner computation and writes the grant ledger.
-- "Dismiss for now" sets snoozed_until so the prompt re-surfaces next login
-- (after 24 h) rather than every page view.

CREATE TABLE IF NOT EXISTS season_recognition_week_status (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  learning_class_id    INT UNSIGNED NOT NULL,
  week_number          SMALLINT UNSIGNED NOT NULL,
  week_start_date      DATE NOT NULL,
  status               ENUM('pending','posted') NOT NULL DEFAULT 'pending',
  snoozed_until        DATETIME NULL COMMENT 'Prompt hidden until this time (manager dismissed for now)',
  posted_at            DATETIME NULL,
  posted_by_user_id    INT UNSIGNED NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_class_week (learning_class_id, week_number),
  INDEX idx_class_status (learning_class_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

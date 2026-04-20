-- 734_challenge_member_award_grants.sql
-- Phase 4 (Trophy Case): dedicated per-member award grant ledger.
--
-- Recognition winners were previously only stored embedded in
-- challenge_weekly_scoreboard.snapshot_json, which is not queryable per-member
-- across seasons. This table holds one row per awarded member per category per
-- period and is written by scoreboard.closeWeek after recognition winners are
-- computed. Historical snapshots are not backfilled (forward-only by design).
--
-- Unique on (learning_class_id, user_id, category_id, week_start_date) so
-- re-closing a week is idempotent — an upsert replaces the existing grant.

CREATE TABLE IF NOT EXISTS challenge_member_award_grants (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  learning_class_id  INT UNSIGNED NOT NULL,
  user_id            INT UNSIGNED NOT NULL,
  category_id        VARCHAR(64)  NOT NULL,
  label              VARCHAR(255) NOT NULL,
  icon               VARCHAR(128) DEFAULT NULL,
  period             ENUM('weekly','monthly','season','challenge') NOT NULL DEFAULT 'weekly',
  metric             VARCHAR(64)  NOT NULL DEFAULT '',
  aggregation        VARCHAR(64)  NOT NULL DEFAULT 'most',
  week_start_date    DATE         DEFAULT NULL,
  metric_value       DECIMAL(14,4) DEFAULT NULL,
  details_json       JSON         DEFAULT NULL,
  granted_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_class_user_category_week (learning_class_id, user_id, category_id, week_start_date),
  INDEX idx_user (user_id),
  INDEX idx_class (learning_class_id),
  INDEX idx_user_label (user_id, label),
  INDEX idx_user_granted (user_id, granted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

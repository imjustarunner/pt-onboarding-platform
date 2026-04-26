-- 815_season_recognition_splash_views.sql
-- Tracks which members have dismissed the recognition splash modal for each
-- posted week. Unique on (class, week, splash_type, user) so the same member
-- never sees the same week's splash twice. Two splash_type values:
--   'weekly'   — who won weekly awards for this week
--   'standings' — who currently leads each season-standing category

CREATE TABLE IF NOT EXISTS season_recognition_splash_views (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  learning_class_id   INT UNSIGNED NOT NULL,
  week_number         SMALLINT UNSIGNED NOT NULL,
  splash_type         ENUM('weekly','standings') NOT NULL DEFAULT 'weekly',
  user_id             INT UNSIGNED NOT NULL,
  viewed_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_splash_view (learning_class_id, week_number, splash_type, user_id),
  INDEX idx_user_class (user_id, learning_class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

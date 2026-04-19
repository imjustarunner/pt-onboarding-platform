-- App Store / Apple Guideline 1.2 (User-Generated Content) compliance:
-- give every user a way to flag objectionable content and to block other users.
-- These tables are intentionally generic so any UGC surface (challenge messages,
-- workout comments, club feed posts, workouts themselves, etc.) can plug in.

CREATE TABLE IF NOT EXISTS user_content_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reporter_user_id INT NOT NULL,
  content_type VARCHAR(64) NOT NULL,
  content_id INT NOT NULL,
  content_owner_user_id INT NULL,
  organization_id INT NULL,
  reason VARCHAR(64) NOT NULL,
  details TEXT NULL,
  status ENUM('open','reviewing','actioned','dismissed') NOT NULL DEFAULT 'open',
  reviewed_by_user_id INT NULL,
  reviewed_at DATETIME NULL,
  reviewer_notes VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ucr_lookup (content_type, content_id),
  KEY idx_ucr_status (status, created_at),
  KEY idx_ucr_reporter (reporter_user_id, created_at),
  KEY idx_ucr_owner (content_owner_user_id, created_at),
  KEY idx_ucr_org (organization_id, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_blocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  blocker_user_id INT NOT NULL,
  blocked_user_id INT NOT NULL,
  reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_blocker_blocked (blocker_user_id, blocked_user_id),
  KEY idx_ub_blocker (blocker_user_id),
  KEY idx_ub_blocked (blocked_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

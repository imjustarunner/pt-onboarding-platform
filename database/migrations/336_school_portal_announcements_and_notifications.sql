-- Migration: School Portal announcements + notifications progress + card icon
-- Purpose:
-- 1) Create time-limited, schedulable school-portal announcements (never student-specific)
-- 2) Track per-user "last seen" for School Portal notifications (unread badge)
-- 3) Add platform/agency icon fields for the Announcements card

-- 1) Announcements table (scoped to a portal org: school/program/learning)
CREATE TABLE IF NOT EXISTS school_portal_announcements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  title VARCHAR(255) NULL,
  message TEXT NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_spa_org_time (organization_id, starts_at, ends_at),
  INDEX idx_spa_org_created (organization_id, created_at),
  FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Per-user unread progress for School Portal notifications
-- JSON map: { "<orgId>": "<lastSeenISO>" }
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS school_portal_notifications_progress JSON NULL AFTER tutorial_progress;

-- 3) School Portal Announcements card icon fields (platform defaults + agency overrides)
ALTER TABLE platform_branding
  ADD COLUMN IF NOT EXISTS school_portal_announcements_icon_id INT NULL;

-- NOTE: Do not add a foreign key constraint on platform_branding here.
-- Some production databases have already reached MySQL's 64-key limit on this table,
-- and adding a FK would fail with ER_TOO_MANY_KEYS (1069). The application treats this
-- as an optional reference, so we keep it as a plain nullable INT.

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS school_portal_announcements_icon_id INT NULL;

ALTER TABLE agencies
  ADD CONSTRAINT fk_agency_school_portal_announcements_icon
    FOREIGN KEY (school_portal_announcements_icon_id) REFERENCES icons(id) ON DELETE SET NULL;

-- NOTE: if this FK fails due to key limits in a particular DB, remove it and rely on the nullable INT
-- (the app tolerates missing FKs). Kept here because agencies typically has far fewer keys than platform_branding.


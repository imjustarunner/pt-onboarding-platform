-- Migration: Labeled external calendars (ICS feeds) per user
-- Purpose:
--   - Allow admins to attach multiple ICS feeds to a user under named calendars
--   - Support schedule overlays by calendar label (busy blocks only)
--   - Backfill from legacy users.external_busy_ics_url into a default calendar/feed

CREATE TABLE IF NOT EXISTS user_external_calendars (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  label VARCHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_external_calendars_user_label (user_id, label),
  INDEX idx_user_external_calendars_user (user_id),
  CONSTRAINT fk_user_external_calendars_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_external_calendars_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_external_calendar_feeds (
  id INT NOT NULL AUTO_INCREMENT,
  calendar_id INT NOT NULL,
  ics_url VARCHAR(1024) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_external_calendar_feeds_calendar_url (calendar_id, ics_url),
  INDEX idx_user_external_calendar_feeds_calendar (calendar_id),
  CONSTRAINT fk_user_external_calendar_feeds_calendar
    FOREIGN KEY (calendar_id) REFERENCES user_external_calendars(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Best-effort backfill from legacy single-URL column.
-- If a user has users.external_busy_ics_url, create a default calendar and add that URL as a feed.
INSERT INTO user_external_calendars (user_id, label, is_active, created_by_user_id)
SELECT u.id, 'Legacy EHR (ICS)', TRUE, NULL
FROM users u
WHERE u.external_busy_ics_url IS NOT NULL
  AND TRIM(u.external_busy_ics_url) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM user_external_calendars c
    WHERE c.user_id = u.id AND c.label = 'Legacy EHR (ICS)'
    LIMIT 1
  );

INSERT INTO user_external_calendar_feeds (calendar_id, ics_url, is_active)
SELECT c.id, u.external_busy_ics_url, TRUE
FROM users u
JOIN user_external_calendars c
  ON c.user_id = u.id AND c.label = 'Legacy EHR (ICS)'
WHERE u.external_busy_ics_url IS NOT NULL
  AND TRIM(u.external_busy_ics_url) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM user_external_calendar_feeds f
    WHERE f.calendar_id = c.id AND f.ics_url = u.external_busy_ics_url
    LIMIT 1
  );


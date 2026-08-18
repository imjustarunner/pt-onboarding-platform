-- Migration 1236: Announcement hub drafts/priority + engagement events

ALTER TABLE agency_scheduled_announcements
  ADD COLUMN publish_status VARCHAR(16) NOT NULL DEFAULT 'published'
    COMMENT 'draft or published';

ALTER TABLE agency_scheduled_announcements
  ADD COLUMN priority VARCHAR(16) NOT NULL DEFAULT 'medium'
    COMMENT 'low, medium, or high';

CREATE TABLE IF NOT EXISTS agency_scheduled_announcement_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  announcement_id INT NOT NULL,
  user_id INT NOT NULL,
  event_type ENUM('impression', 'open', 'dismiss', 'acknowledge') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_asae_user_type (announcement_id, user_id, event_type),
  INDEX idx_asae_agency_created (agency_id, created_at),
  INDEX idx_asae_announcement_type (announcement_id, event_type),
  CONSTRAINT fk_asae_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_asae_announcement FOREIGN KEY (announcement_id) REFERENCES agency_scheduled_announcements(id) ON DELETE CASCADE,
  CONSTRAINT fk_asae_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

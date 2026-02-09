-- Migration: Create social_feed_links table for dashboard/school/guardian social feeds
-- Description: Agency-configurable links for Instagram, Facebook, RSS, or generic links
--   scoped by agency, optional school (organization_id), or program.

CREATE TABLE IF NOT EXISTS social_feed_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  organization_id INT NULL COMMENT 'School org when scope is school',
  program_id INT NULL COMMENT 'Program when scope is program',
  type ENUM('instagram', 'facebook', 'rss', 'link') NOT NULL DEFAULT 'link',
  label VARCHAR(255) NOT NULL,
  url VARCHAR(2048) NULL COMMENT 'Embed URL or primary URL',
  external_url VARCHAR(2048) NULL COMMENT 'Open in new tab (RSS/link)',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_social_feed_agency_active (agency_id, is_active),
  INDEX idx_social_feed_organization (organization_id),
  INDEX idx_social_feed_program (program_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
);

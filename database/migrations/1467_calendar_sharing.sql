CREATE TABLE IF NOT EXISTS calendar_publications (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  scope_key VARCHAR(100) NOT NULL UNIQUE,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  household_id INT NULL,
  calendar_kind ENUM('work','family') NOT NULL,
  detail_mode ENUM('limited','details') NOT NULL DEFAULT 'limited',
  token_hash CHAR(64) NULL UNIQUE,
  google_calendar_id VARCHAR(255) NULL,
  google_subject VARCHAR(255) NULL,
  google_name VARCHAR(255) NULL,
  last_synced_at DATETIME NULL,
  last_error VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_calendar_publication_sync (last_synced_at)
);
CREATE TABLE IF NOT EXISTS calendar_publication_readers (
  publication_id INT NOT NULL,
  email VARCHAR(254) NOT NULL,
  managed_member TINYINT(1) NOT NULL DEFAULT 0,
  google_acl_id VARCHAR(300) NULL,
  PRIMARY KEY(publication_id,email),
  FOREIGN KEY(publication_id) REFERENCES calendar_publications(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS calendar_publication_events (
  publication_id INT NOT NULL,
  event_key VARCHAR(200) NOT NULL,
  google_event_id VARCHAR(255) NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  PRIMARY KEY(publication_id,event_key),
  FOREIGN KEY(publication_id) REFERENCES calendar_publications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_preferences (
  household_id INT NOT NULL PRIMARY KEY,
  settings JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (household_id) REFERENCES family_households(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS family_photos (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  household_id INT NOT NULL,
  image_data MEDIUMTEXT NOT NULL,
  caption VARCHAR(200) NOT NULL DEFAULT '',
  created_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_family_photo_household (household_id,id),
  FOREIGN KEY (household_id) REFERENCES family_households(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS family_recipe_ingredients (
  entry_id INT NOT NULL,
  ingredient_index INT NOT NULL,
  list_kind ENUM('grocery','shopping') NOT NULL,
  list_entry_id INT NOT NULL,
  PRIMARY KEY (entry_id,ingredient_index,list_kind),
  FOREIGN KEY (entry_id) REFERENCES family_entries(id),
  FOREIGN KEY (list_entry_id) REFERENCES family_entries(id)
);
CREATE TABLE IF NOT EXISTS family_calendar_connections (
  household_id INT NOT NULL PRIMARY KEY,
  calendar_id VARCHAR(255) NOT NULL,
  calendar_name VARCHAR(255) NOT NULL,
  connected_by_user_id INT NOT NULL,
  subject_email VARCHAR(255) NOT NULL,
  last_synced_at DATETIME NULL,
  last_error VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_family_google_calendar (calendar_id),
  FOREIGN KEY (household_id) REFERENCES family_households(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS family_google_event_links (
  household_id INT NOT NULL,
  calendar_id VARCHAR(255) NOT NULL,
  entry_id INT NOT NULL,
  google_event_id VARCHAR(255) NOT NULL,
  google_etag VARCHAR(255) NULL,
  local_fingerprint CHAR(64) NULL,
  PRIMARY KEY (household_id,calendar_id,google_event_id),
  UNIQUE KEY uq_family_google_entry (entry_id),
  FOREIGN KEY (household_id) REFERENCES family_households(id) ON DELETE CASCADE,
  FOREIGN KEY (entry_id) REFERENCES family_entries(id)
);

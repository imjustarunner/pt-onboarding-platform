-- Optional employee benefit. Households are private groups, not clinical tenants.
CREATE TABLE IF NOT EXISTS family_households (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  created_by_user_id INT NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Denver',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS family_members (
  household_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('parent','member','pet') NOT NULL DEFAULT 'member',
  display_name VARCHAR(80) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6667d9',
  photo_url TEXT NULL,
  share_work TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (household_id,user_id),
  FOREIGN KEY (household_id) REFERENCES family_households(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS family_device_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  credential_version INT NOT NULL DEFAULT 0,
  passcode_version INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS family_entries (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  household_id INT NOT NULL,
  kind ENUM('event','status','chore','grocery','shopping','packing','meal','announcement','reward') NOT NULL,
  title VARCHAR(200) NOT NULL,
  member_user_id INT NULL,
  start_at DATETIME NULL,
  end_at DATETIME NULL,
  metadata JSON NULL,
  task_id INT NULL,
  completed_at DATETIME NULL,
  archived_at DATETIME NULL,
  created_by_user_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_family_entry_window (household_id,kind,start_at),
  FOREIGN KEY (household_id) REFERENCES family_households(id) ON DELETE CASCADE,
  FOREIGN KEY (member_user_id) REFERENCES users(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS family_schedule_links (
  entry_id INT NOT NULL,
  schedule_event_id INT NOT NULL,
  PRIMARY KEY (entry_id,schedule_event_id),
  UNIQUE KEY uq_family_schedule (schedule_event_id),
  FOREIGN KEY (entry_id) REFERENCES family_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_event_id) REFERENCES provider_schedule_events(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS family_activity (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  household_id INT NOT NULL,
  entry_id INT NOT NULL,
  user_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  occurrence_key VARCHAR(40) NOT NULL,
  points INT NOT NULL DEFAULT 0,
  state ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_family_occurrence (entry_id,user_id,occurrence_key),
  FOREIGN KEY (household_id) REFERENCES family_households(id) ON DELETE CASCADE,
  FOREIGN KEY (entry_id) REFERENCES family_entries(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS family_invites (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  household_id INT NOT NULL,
  role ENUM('parent','member','pet') NOT NULL DEFAULT 'member',
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  FOREIGN KEY (household_id) REFERENCES family_households(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS family_launch_tokens (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  agency_id INT NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL
);

-- Skills Groups: time-limited groups with multi-day meeting patterns.
-- Providers may be assigned even if not directly affiliated to the org.
-- Group participants are existing clients with clients.skills = TRUE.

CREATE TABLE IF NOT EXISTS skills_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL COMMENT 'agencies.id (school/program/learning)',
  agency_id INT NOT NULL COMMENT 'parent agency id',
  name VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_by_user_id INT NOT NULL,
  updated_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_skills_groups_org (organization_id, start_date, end_date),
  INDEX idx_skills_groups_agency (agency_id, start_date, end_date),
  FOREIGN KEY (organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS skills_group_meetings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  skills_group_id INT NOT NULL,
  weekday ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_skills_group_meeting (skills_group_id, weekday, start_time, end_time),
  INDEX idx_skills_group_meetings_group (skills_group_id),
  FOREIGN KEY (skills_group_id) REFERENCES skills_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS skills_group_providers (
  skills_group_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (skills_group_id, provider_user_id),
  INDEX idx_skills_group_providers_provider (provider_user_id),
  FOREIGN KEY (skills_group_id) REFERENCES skills_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS skills_group_clients (
  skills_group_id INT NOT NULL,
  client_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (skills_group_id, client_id),
  INDEX idx_skills_group_clients_client (client_id),
  FOREIGN KEY (skills_group_id) REFERENCES skills_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Migration 1062: School needs board for Provider Year Update (open placements providers can apply for)

CREATE TABLE IF NOT EXISTS provider_year_update_school_needs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  school_year VARCHAR(16) NOT NULL COMMENT 'e.g. 2026-27',
  title VARCHAR(255) NULL DEFAULT NULL,
  body TEXT NULL,
  slots_needed INT NOT NULL DEFAULT 1,
  days_json JSON NULL COMMENT 'Optional required weekdays, e.g. ["Monday","Wednesday"]. Empty/null = provider chooses preferred day.',
  status ENUM('open', 'filled', 'closed') NOT NULL DEFAULT 'open',
  posted_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pyu_school_needs_agency_year (agency_id, school_year, status),
  INDEX idx_pyu_school_needs_school (school_organization_id),
  CONSTRAINT fk_pyu_school_needs_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pyu_school_needs_school
    FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pyu_school_needs_posted_by
    FOREIGN KEY (posted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_year_update_school_need_applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  need_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  preferred_day VARCHAR(32) NULL DEFAULT NULL COMMENT 'Required when the need has no fixed day(s)',
  notes TEXT NULL,
  home_school_roundtrip_miles DECIMAL(10, 2) NULL DEFAULT NULL COMMENT 'Home↔School RT miles at apply time',
  status ENUM('pending', 'approved', 'denied', 'withdrawn') NOT NULL DEFAULT 'pending',
  reviewed_by_user_id INT NULL DEFAULT NULL,
  reviewed_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pyu_school_need_app (need_id, provider_user_id),
  INDEX idx_pyu_school_need_apps_need (need_id, status),
  INDEX idx_pyu_school_need_apps_provider (provider_user_id),
  CONSTRAINT fk_pyu_school_need_apps_need
    FOREIGN KEY (need_id) REFERENCES provider_year_update_school_needs(id) ON DELETE CASCADE,
  CONSTRAINT fk_pyu_school_need_apps_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pyu_school_need_apps_reviewed_by
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

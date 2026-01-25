-- Migration: Availability intake queues + supervised availability + available skills
-- Purpose:
-- - Provider-submitted availability requests for office/school assignment by staff
-- - Supervised biweekly block confirmations (after-school + weekend blocks)
-- - Per-agency available skill tags for supervised staffing searches

-- 1) Per-agency skills picklist
CREATE TABLE IF NOT EXISTS agency_available_skills (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  skill_key VARCHAR(64) NOT NULL,
  skill_label VARCHAR(128) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agency_available_skills_key (agency_id, skill_key),
  INDEX idx_agency_available_skills_agency_active (agency_id, is_active),
  CONSTRAINT fk_agency_available_skills_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_available_skills (
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  skill_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, provider_id, skill_id),
  INDEX idx_provider_available_skills_provider (provider_id),
  INDEX idx_provider_available_skills_skill (agency_id, skill_id),
  CONSTRAINT fk_provider_available_skills_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_available_skills_provider
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_available_skills_skill
    FOREIGN KEY (skill_id) REFERENCES agency_available_skills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Provider -> Office availability request queue (staff assigns to an office slot temporarily)
CREATE TABLE IF NOT EXISTS provider_office_availability_requests (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  preferred_office_ids_json JSON NULL,
  notes TEXT NULL,
  status ENUM('PENDING','ASSIGNED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  resolved_office_location_id INT NULL,
  resolved_standing_assignment_id INT NULL,
  resolved_at DATETIME NULL,
  resolved_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_provider_office_availability_requests_agency_status (agency_id, status, created_at),
  INDEX idx_provider_office_availability_requests_provider (provider_id, status, created_at),
  CONSTRAINT fk_provider_office_availability_requests_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_office_availability_requests_provider
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_office_availability_requests_resolved_office
    FOREIGN KEY (resolved_office_location_id) REFERENCES office_locations(id) ON DELETE SET NULL,
  CONSTRAINT fk_provider_office_availability_requests_resolved_assignment
    FOREIGN KEY (resolved_standing_assignment_id) REFERENCES office_standing_assignments(id) ON DELETE SET NULL,
  CONSTRAINT fk_provider_office_availability_requests_resolved_by
    FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_office_availability_request_slots (
  id INT NOT NULL AUTO_INCREMENT,
  request_id INT NOT NULL,
  weekday TINYINT NOT NULL COMMENT '0=Sunday .. 6=Saturday',
  start_hour TINYINT NOT NULL COMMENT '24h start hour, inclusive',
  end_hour TINYINT NOT NULL COMMENT '24h end hour, exclusive',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_provider_office_availability_request_slots_req (request_id),
  INDEX idx_provider_office_availability_request_slots_day_time (weekday, start_hour, end_hour),
  CONSTRAINT fk_provider_office_availability_request_slots_request
    FOREIGN KEY (request_id) REFERENCES provider_office_availability_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3) Provider -> School availability request queue (staff assigns to a school/day/time)
CREATE TABLE IF NOT EXISTS provider_school_availability_requests (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  preferred_school_org_ids_json JSON NULL,
  notes TEXT NULL,
  status ENUM('PENDING','ASSIGNED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  resolved_school_organization_id INT NULL,
  resolved_provider_school_assignment_id INT NULL,
  resolved_at DATETIME NULL,
  resolved_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_provider_school_availability_requests_agency_status (agency_id, status, created_at),
  INDEX idx_provider_school_availability_requests_provider (provider_id, status, created_at),
  CONSTRAINT fk_provider_school_availability_requests_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_school_availability_requests_provider
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_school_availability_requests_resolved_school
    FOREIGN KEY (resolved_school_organization_id) REFERENCES agencies(id) ON DELETE SET NULL,
  CONSTRAINT fk_provider_school_availability_requests_resolved_by
    FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Note: provider_school_assignments table already exists in the legacy school scheduling system.
-- We store the assignment id as an INT without a hard FK to keep older deployments/migrations flexible.

CREATE TABLE IF NOT EXISTS provider_school_availability_request_blocks (
  id INT NOT NULL AUTO_INCREMENT,
  request_id INT NOT NULL,
  day_of_week VARCHAR(16) NOT NULL,
  block_type ENUM('AFTER_SCHOOL','WEEKEND','CUSTOM') NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_provider_school_availability_request_blocks_req (request_id),
  INDEX idx_provider_school_availability_request_blocks_day (day_of_week, start_time),
  CONSTRAINT fk_provider_school_availability_request_blocks_request
    FOREIGN KEY (request_id) REFERENCES provider_school_availability_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4) Supervised biweekly availability confirmations
CREATE TABLE IF NOT EXISTS supervised_availability_confirmations (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  provider_id INT NOT NULL,
  cycle_start_date DATE NOT NULL,
  cycle_end_date DATE NOT NULL,
  confirmed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_supervised_availability_confirmations_cycle (agency_id, provider_id, cycle_start_date),
  INDEX idx_supervised_availability_confirmations_agency_cycle (agency_id, cycle_start_date),
  INDEX idx_supervised_availability_confirmations_provider (provider_id, cycle_start_date),
  CONSTRAINT fk_supervised_availability_confirmations_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_supervised_availability_confirmations_provider
    FOREIGN KEY (provider_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supervised_availability_blocks (
  id INT NOT NULL AUTO_INCREMENT,
  confirmation_id INT NOT NULL,
  week_start_date DATE NOT NULL,
  day_of_week ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
  block_type ENUM('AFTER_SCHOOL','WEEKEND') NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_supervised_availability_blocks_unique (confirmation_id, week_start_date, day_of_week, block_type),
  INDEX idx_supervised_availability_blocks_week (week_start_date, day_of_week, block_type),
  CONSTRAINT fk_supervised_availability_blocks_confirmation
    FOREIGN KEY (confirmation_id) REFERENCES supervised_availability_confirmations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


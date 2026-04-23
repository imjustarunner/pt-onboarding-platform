-- Facilitator availability collection system.
-- Admins create structured availability requests tied to selected program events,
-- push them to employees, and employees respond with per-day availability,
-- per-session location rankings, day-level comments, waitlist opt-in, and on-call flag.

CREATE TABLE IF NOT EXISTS facilitator_availability_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(500) NULL DEFAULT NULL,
  description TEXT NULL DEFAULT NULL,
  status ENUM('draft', 'active', 'closed') NOT NULL DEFAULT 'draft',
  on_call_enabled TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Show/hide the on-call toggle on the employee form.',
  deadline DATETIME NULL DEFAULT NULL,
  push_sent_at DATETIME NULL DEFAULT NULL,
  push_sent_by INT NULL DEFAULT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_far_agency_status (agency_id, status),
  CONSTRAINT fk_far_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_far_push_sent_by
    FOREIGN KEY (push_sent_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_far_created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which company_events are included in a request, with admin-configured locations.
CREATE TABLE IF NOT EXISTS facilitator_availability_request_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  company_event_id INT NOT NULL,
  locations_json JSON NULL DEFAULT NULL
    COMMENT 'Array of location label strings available for this session.',
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_fare_request_event (request_id, company_event_id),
  INDEX idx_fare_request (request_id),
  CONSTRAINT fk_fare_request
    FOREIGN KEY (request_id) REFERENCES facilitator_availability_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_fare_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One submission row per employee per request (stores global flags + timestamps).
CREATE TABLE IF NOT EXISTS facilitator_availability_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  user_id INT NOT NULL,
  is_on_call TINYINT(1) NOT NULL DEFAULT 0,
  general_notes TEXT NULL DEFAULT NULL,
  submitted_at DATETIME NULL DEFAULT NULL
    COMMENT 'NULL = saved as draft; non-NULL = formally submitted.',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_fas_request_user (request_id, user_id),
  INDEX idx_fas_user (user_id),
  CONSTRAINT fk_fas_request
    FOREIGN KEY (request_id) REFERENCES facilitator_availability_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_fas_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-day availability entry for each employee.
CREATE TABLE IF NOT EXISTS facilitator_availability_date_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  request_id INT NOT NULL,
  user_id INT NOT NULL,
  company_event_id INT NOT NULL,
  session_date_id INT NULL DEFAULT NULL
    COMMENT 'References company_event_session_dates.id when the date was materialized.',
  entry_date DATE NOT NULL,
  availability ENUM('available', 'waitlist', 'unavailable') NOT NULL DEFAULT 'unavailable',
  comment TEXT NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_fade_submission_event_date (submission_id, company_event_id, entry_date),
  INDEX idx_fade_request_user (request_id, user_id),
  CONSTRAINT fk_fade_submission
    FOREIGN KEY (submission_id) REFERENCES facilitator_availability_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_fade_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Location ranking per session (event) per employee.
CREATE TABLE IF NOT EXISTS facilitator_availability_location_ranks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  submission_id INT NOT NULL,
  request_event_id INT NOT NULL,
  location VARCHAR(255) NOT NULL,
  rank_order TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_falr_submission_event_location (submission_id, request_event_id, location),
  INDEX idx_falr_submission (submission_id),
  CONSTRAINT fk_falr_submission
    FOREIGN KEY (submission_id) REFERENCES facilitator_availability_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_falr_request_event
    FOREIGN KEY (request_event_id) REFERENCES facilitator_availability_request_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

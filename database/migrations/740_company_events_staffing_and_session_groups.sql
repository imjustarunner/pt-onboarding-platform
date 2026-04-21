-- Program events (non–Skill Builders): staffing config, session groups, provider requests, and approvals.
-- This is additive and guarded by feature flags in UI; existing events keep working.

ALTER TABLE company_events
  ADD COLUMN staffing_config_json JSON NULL DEFAULT NULL
    COMMENT 'Event staffing rules for program sessions (non-SB).'
    AFTER sms_draft_json;

CREATE TABLE IF NOT EXISTS company_event_session_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  session_date_id INT NOT NULL,
  label VARCHAR(64) NOT NULL,
  age_min INT NULL DEFAULT NULL,
  age_max INT NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_event_session_group_label (company_event_id, session_date_id, label),
  INDEX idx_event_session_groups_session (session_date_id),
  CONSTRAINT fk_event_session_groups_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_session_groups_session
    FOREIGN KEY (session_date_id) REFERENCES company_event_session_dates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_event_client_group_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  session_date_id INT NOT NULL,
  group_id INT NULL DEFAULT NULL,
  created_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_event_client_session_group (company_event_id, client_id, session_date_id),
  INDEX idx_event_client_group_session (session_date_id),
  INDEX idx_event_client_group_group (group_id),
  CONSTRAINT fk_event_client_group_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_client_group_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_client_group_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_client_group_session
    FOREIGN KEY (session_date_id) REFERENCES company_event_session_dates(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_client_group_group
    FOREIGN KEY (group_id) REFERENCES company_event_session_groups(id) ON DELETE SET NULL,
  CONSTRAINT fk_event_client_group_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_event_session_provider_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  agency_id INT NOT NULL,
  session_date_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  request_type VARCHAR(16) NOT NULL DEFAULT 'regular' COMMENT 'regular|waitlist|on_call',
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending|approved|denied|withdrawn',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  decided_by_user_id INT NULL DEFAULT NULL,
  decided_at DATETIME NULL DEFAULT NULL,
  decision_note VARCHAR(255) NULL DEFAULT NULL,
  UNIQUE KEY uniq_event_session_provider_request (session_date_id, provider_user_id),
  INDEX idx_event_session_provider_requests_event (company_event_id, session_date_id, status),
  CONSTRAINT fk_event_session_provider_requests_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_session_provider_requests_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_session_provider_requests_session
    FOREIGN KEY (session_date_id) REFERENCES company_event_session_dates(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_session_provider_requests_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_session_provider_requests_decider
    FOREIGN KEY (decided_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_event_session_providers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_event_id INT NOT NULL,
  agency_id INT NOT NULL,
  session_date_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  assigned_by_user_id INT NULL DEFAULT NULL,
  assigned_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_event_session_provider (session_date_id, provider_user_id),
  INDEX idx_event_session_providers_event (company_event_id, session_date_id),
  CONSTRAINT fk_event_session_providers_event
    FOREIGN KEY (company_event_id) REFERENCES company_events(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_session_providers_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_session_providers_session
    FOREIGN KEY (session_date_id) REFERENCES company_event_session_dates(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_session_providers_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_session_providers_assigner
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


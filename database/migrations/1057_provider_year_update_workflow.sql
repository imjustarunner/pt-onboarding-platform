-- Migration 1057: Provider Year Update workflow (parallel to school collaborative year update)

CREATE TABLE IF NOT EXISTS provider_year_update_campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  school_year VARCHAR(16) NOT NULL COMMENT 'e.g. 2026-27',
  status ENUM('draft', 'enabled', 'pushed') NOT NULL DEFAULT 'draft',
  enabled_at DATETIME NULL DEFAULT NULL,
  enabled_by_user_id INT NULL DEFAULT NULL,
  pushed_at DATETIME NULL DEFAULT NULL,
  pushed_by_user_id INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_year_update_campaign (agency_id, school_year),
  CONSTRAINT fk_pyu_campaign_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pyu_campaign_enabled_by
    FOREIGN KEY (enabled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_pyu_campaign_pushed_by
    FOREIGN KEY (pushed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_year_update_cycles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  school_year VARCHAR(16) NOT NULL COMMENT 'e.g. 2026-27',
  status ENUM('not_started', 'in_progress', 'finalized') NOT NULL DEFAULT 'not_started',
  finalized_at DATETIME NULL DEFAULT NULL,
  finalized_by_actor_type ENUM('provider', 'admin') NULL DEFAULT NULL,
  finalized_by_user_id INT NULL DEFAULT NULL,
  finalized_by_display_name VARCHAR(255) NULL DEFAULT NULL,
  snapshot_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_year_update_cycle (agency_id, provider_user_id, school_year),
  INDEX idx_pyu_cycles_agency_year (agency_id, school_year),
  INDEX idx_pyu_cycles_provider (provider_user_id, school_year),
  CONSTRAINT fk_pyu_cycles_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pyu_cycles_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pyu_cycles_finalized_by
    FOREIGN KEY (finalized_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_year_update_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(64) NOT NULL,
  cycle_id INT NOT NULL,
  agency_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  created_by_user_id INT NULL DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  marked_sent_at DATETIME NULL DEFAULT NULL,
  marked_sent_by_user_id INT NULL DEFAULT NULL,
  locked_at DATETIME NULL DEFAULT NULL,
  click_count INT NOT NULL DEFAULT 0,
  last_viewed_at DATETIME NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_year_update_token (token),
  INDEX idx_pyu_tokens_cycle (cycle_id),
  INDEX idx_pyu_tokens_agency_provider (agency_id, provider_user_id),
  CONSTRAINT fk_pyu_tokens_cycle
    FOREIGN KEY (cycle_id) REFERENCES provider_year_update_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_pyu_tokens_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pyu_tokens_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pyu_tokens_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_pyu_tokens_marked_by
    FOREIGN KEY (marked_sent_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_year_update_section_progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  section_key VARCHAR(64) NOT NULL,
  reviewed TINYINT(1) NOT NULL DEFAULT 0,
  reviewed_at DATETIME NULL DEFAULT NULL,
  reviewed_by_actor_type ENUM('provider', 'admin') NULL DEFAULT NULL,
  reviewed_by_user_id INT NULL DEFAULT NULL,
  reviewed_by_display_name VARCHAR(255) NULL DEFAULT NULL,
  completed TINYINT(1) NOT NULL DEFAULT 0,
  data_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_year_update_section (cycle_id, section_key),
  CONSTRAINT fk_pyu_section_cycle
    FOREIGN KEY (cycle_id) REFERENCES provider_year_update_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_pyu_section_reviewed_by
    FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_year_update_view_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  token_id INT NULL DEFAULT NULL,
  user_id INT NULL DEFAULT NULL,
  actor_display_name VARCHAR(255) NULL DEFAULT NULL,
  section_key VARCHAR(64) NULL DEFAULT NULL,
  event_type VARCHAR(32) NOT NULL DEFAULT 'view'
    COMMENT 'view|token_click|section_open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pyu_views_cycle (cycle_id, created_at),
  CONSTRAINT fk_pyu_views_cycle
    FOREIGN KEY (cycle_id) REFERENCES provider_year_update_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_pyu_views_token
    FOREIGN KEY (token_id) REFERENCES provider_year_update_tokens(id) ON DELETE SET NULL,
  CONSTRAINT fk_pyu_views_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_year_update_dismissals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cycle_id INT NOT NULL,
  user_id INT NOT NULL,
  dismissed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dismiss_until DATETIME NULL DEFAULT NULL,
  UNIQUE KEY uq_provider_year_update_dismiss (cycle_id, user_id),
  CONSTRAINT fk_pyu_dismiss_cycle
    FOREIGN KEY (cycle_id) REFERENCES provider_year_update_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_pyu_dismiss_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

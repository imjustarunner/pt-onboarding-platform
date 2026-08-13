-- Migration 1215: 24-hour provider client-action outreach links
CREATE TABLE provider_action_links (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(64) NOT NULL,
  agency_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  created_by_user_id INT NULL,
  client_count INT NOT NULL DEFAULT 0,
  seconds_per_client INT NOT NULL DEFAULT 15,
  estimated_seconds INT NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  first_opened_at DATETIME NULL,
  last_seen_at DATETIME NULL,
  last_heartbeat_at DATETIME NULL,
  open_count INT NOT NULL DEFAULT 0,
  active_seconds INT NOT NULL DEFAULT 0,
  completed_count INT NOT NULL DEFAULT 0,
  remaining_count INT NULL,
  last_pdf_downloaded_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_provider_action_links_token (token),
  KEY idx_pal_agency_provider (agency_id, provider_user_id, created_at),
  KEY idx_pal_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE provider_action_link_clients (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  link_id INT NOT NULL,
  client_id INT NOT NULL,
  action_key VARCHAR(64) NULL,
  action_label VARCHAR(191) NULL,
  started_status_key VARCHAR(64) NULL,
  completed_at DATETIME NULL,
  outcome VARCHAR(191) NULL,
  UNIQUE KEY uq_pal_clients_link_client (link_id, client_id),
  KEY idx_pal_clients_link (link_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE provider_action_link_events (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  link_id INT NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  client_id INT NULL,
  action_key VARCHAR(64) NULL,
  outcome VARCHAR(191) NULL,
  meta_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pal_events_link (link_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

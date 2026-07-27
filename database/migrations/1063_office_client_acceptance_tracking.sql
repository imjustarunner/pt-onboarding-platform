-- Migration 1063: Track office client assignments vs early Client Exchange posts (acceptance ratio)

ALTER TABLE clients
  ADD COLUMN provider_assigned_at DATETIME NULL DEFAULT NULL
  COMMENT 'When the current provider_id was set (office acceptance tracking)';

CREATE TABLE IF NOT EXISTS office_client_assignment_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  client_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_by_user_id INT NULL DEFAULT NULL,
  exchanged_at DATETIME NULL DEFAULT NULL
    COMMENT 'First time this provider posted the client to Client Exchange after this assignment',
  exchange_listing_id BIGINT UNSIGNED NULL DEFAULT NULL,
  exchanged_before_current TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 if exchanged before the client was marked current under this assignment',
  marked_current_at DATETIME NULL DEFAULT NULL
    COMMENT 'When client became current while still assigned to this provider',
  ended_at DATETIME NULL DEFAULT NULL
    COMMENT 'When provider_id changed away from this provider (or unassigned)',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_oca_events_agency_provider (agency_id, provider_user_id, assigned_at),
  INDEX idx_oca_events_client_open (client_id, ended_at),
  INDEX idx_oca_events_provider_open (provider_user_id, ended_at),
  CONSTRAINT fk_oca_events_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_oca_events_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_oca_events_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_oca_events_assigned_by
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_oca_events_listing
    FOREIGN KEY (exchange_listing_id) REFERENCES client_exchange_listings(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

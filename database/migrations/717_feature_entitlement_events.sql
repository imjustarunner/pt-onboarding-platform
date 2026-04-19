-- Dual-axis feature pricing: event log + current-state denormalization.
--
-- Every tenant or user enable/disable becomes an immutable event row recording
-- who, when, and why. Current-state tables are denormalizations to keep gating
-- checks fast; billing pro-ration walks the event log directly.

CREATE TABLE IF NOT EXISTS agency_feature_entitlement_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  feature_key VARCHAR(100) NOT NULL,
  event_type ENUM('enabled','disabled') NOT NULL,
  actor_user_id INT NULL,
  actor_role VARCHAR(50) NULL,
  effective_at DATETIME NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_afee_agency_feature_time (agency_id, feature_key, effective_at),
  KEY idx_afee_actor (actor_user_id),
  CONSTRAINT fk_afee_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_feature_entitlement_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  feature_key VARCHAR(100) NOT NULL,
  event_type ENUM('enabled','disabled') NOT NULL,
  actor_user_id INT NULL,
  actor_role VARCHAR(50) NULL,
  effective_at DATETIME NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ufee_agency_feature_user_time (agency_id, feature_key, user_id, effective_at),
  KEY idx_ufee_user_feature_time (user_id, feature_key, effective_at),
  KEY idx_ufee_actor (actor_user_id),
  CONSTRAINT fk_ufee_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_ufee_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agency_feature_entitlements_current (
  agency_id INT NOT NULL,
  feature_key VARCHAR(100) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  last_event_id BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agency_id, feature_key),
  KEY idx_afec_feature (feature_key),
  CONSTRAINT fk_afec_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_feature_entitlements_current (
  user_id INT NOT NULL,
  feature_key VARCHAR(100) NOT NULL,
  agency_id INT NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  last_event_id BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, feature_key),
  KEY idx_ufec_agency_feature (agency_id, feature_key),
  KEY idx_ufec_feature (feature_key),
  CONSTRAINT fk_ufec_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_ufec_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

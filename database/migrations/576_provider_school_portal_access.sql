-- Track provider access timestamps per school portal.
-- Used by admin "Provider App Tracker" reporting.

CREATE TABLE IF NOT EXISTS provider_school_portal_access (
  provider_user_id INT NOT NULL,
  school_organization_id INT NOT NULL,
  first_access_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_access_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (provider_user_id, school_organization_id),
  INDEX idx_provider_school_portal_access_school (school_organization_id, last_access_at),
  CONSTRAINT fk_provider_school_portal_access_provider
    FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_school_portal_access_school
    FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

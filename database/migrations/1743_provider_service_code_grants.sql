-- Migration 1743: per-provider exceptions for service codes that stay off by default.
-- H0002 is off for every credential. ITSCO turns it on for Aneta Czepiel only.

CREATE TABLE IF NOT EXISTS provider_service_code_grants (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  service_code VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_provider_service_code_grant (agency_id, user_id, service_code),
  KEY idx_provider_service_code_grant_user (agency_id, user_id),
  CONSTRAINT fk_provider_service_grant_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_service_grant_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO provider_service_code_grants (agency_id, user_id, service_code, is_enabled)
SELECT ua.agency_id, u.id, 'H0002', 1
FROM users u
JOIN user_agencies ua ON ua.user_id = u.id AND COALESCE(ua.is_active, 1) = 1
JOIN agencies a ON a.id = ua.agency_id AND a.slug = 'itsco'
WHERE u.first_name = 'Aneta'
  AND u.last_name = 'Czepiel'
  AND NOT EXISTS (
    SELECT 1
    FROM provider_service_code_grants existing
    WHERE existing.agency_id = ua.agency_id
      AND existing.user_id = u.id
      AND existing.service_code = 'H0002'
  );

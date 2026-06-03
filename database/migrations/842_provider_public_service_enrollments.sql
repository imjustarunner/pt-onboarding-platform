/*
Migration 842: Provider public service enrollments.

Tracks which providers appear in which public-facing service finders.
Enrollment is explicit (not inferred from role or specialty) and per-agency,
so a provider shared across agencies can opt into different finders per org.
*/

CREATE TABLE provider_public_service_enrollments (
  id INT NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  service_type VARCHAR(32) NOT NULL COMMENT 'counseling | tutoring',
  is_active TINYINT NOT NULL DEFAULT 1,
  enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_provider_service_enrollment (agency_id, user_id, service_type),
  KEY idx_provider_svc_enrollment_agency_type (agency_id, service_type, is_active),
  KEY idx_provider_svc_enrollment_user (user_id),
  CONSTRAINT fk_provider_svc_enrollment_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_provider_svc_enrollment_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

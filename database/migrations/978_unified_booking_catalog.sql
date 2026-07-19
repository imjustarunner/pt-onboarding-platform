-- Migration 978: Tenant business types, bookable services, and staff assignments (unified booking Phase 1)

CREATE TABLE IF NOT EXISTS agency_business_types (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  business_type VARCHAR(64) NOT NULL
    COMMENT 'healthcare|mental_health|learning|tutoring|coaching|consulting|mentorship|skills_development|other',
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agency_business_type (agency_id, business_type),
  KEY idx_agency_business_types_agency (agency_id),
  CONSTRAINT fk_agency_business_types_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tenant_services (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  business_type VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  default_duration_minutes INT NOT NULL DEFAULT 60,
  allows_individual TINYINT(1) NOT NULL DEFAULT 1,
  allows_group TINYINT(1) NOT NULL DEFAULT 0,
  max_participants INT NULL DEFAULT NULL,
  modality VARCHAR(32) NOT NULL DEFAULT 'EITHER'
    COMMENT 'IN_PERSON|TELEHEALTH|EITHER',
  price_cents INT NULL DEFAULT NULL,
  billing_method VARCHAR(64) NOT NULL DEFAULT 'self_pay'
    COMMENT 'self_pay|package|insurance|org|grant|other',
  is_publicly_bookable TINYINT(1) NOT NULL DEFAULT 0,
  is_staff_bookable TINYINT(1) NOT NULL DEFAULT 1,
  package_eligible TINYINT(1) NOT NULL DEFAULT 1,
  program_eligible TINYINT(1) NOT NULL DEFAULT 1,
  buffer_before_minutes INT NOT NULL DEFAULT 0,
  buffer_after_minutes INT NOT NULL DEFAULT 0,
  min_notice_hours INT NULL DEFAULT NULL,
  max_advance_days INT NULL DEFAULT NULL,
  cancellation_policy_id INT UNSIGNED NULL DEFAULT NULL,
  reminder_defaults_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tenant_services_agency (agency_id),
  KEY idx_tenant_services_type (agency_id, business_type),
  KEY idx_tenant_services_active (agency_id, is_active),
  CONSTRAINT fk_tenant_services_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_service_assignments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  tenant_service_id INT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  modality VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'NULL = inherit service; else IN_PERSON|TELEHEALTH|EITHER',
  office_location_id INT NULL DEFAULT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_staff_service_user (tenant_service_id, user_id),
  KEY idx_staff_service_agency (agency_id),
  KEY idx_staff_service_user (user_id),
  CONSTRAINT fk_staff_service_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_service_service
    FOREIGN KEY (tenant_service_id) REFERENCES tenant_services(id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_service_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

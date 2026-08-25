-- Migration 1295: Persist district schedule hide (schools / providers) for public links
-- Tenant agency admins can hide entries from the public district schedule view.

CREATE TABLE IF NOT EXISTS district_schedule_hidden_schools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  district_slug VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  school_organization_id INT NOT NULL,
  hidden_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dshs_agency_district_school (agency_id, district_slug, school_organization_id),
  INDEX idx_dshs_agency_district (agency_id, district_slug),
  CONSTRAINT fk_dshs_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_dshs_school FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_dshs_hidden_by FOREIGN KEY (hidden_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS district_schedule_hidden_providers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agency_id INT NOT NULL,
  district_slug VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  school_organization_id INT NOT NULL,
  provider_user_id INT NOT NULL,
  hidden_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dshp_agency_district_school_provider (agency_id, district_slug, school_organization_id, provider_user_id),
  INDEX idx_dshp_agency_district (agency_id, district_slug),
  CONSTRAINT fk_dshp_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_dshp_school FOREIGN KEY (school_organization_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_dshp_provider FOREIGN KEY (provider_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_dshp_hidden_by FOREIGN KEY (hidden_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

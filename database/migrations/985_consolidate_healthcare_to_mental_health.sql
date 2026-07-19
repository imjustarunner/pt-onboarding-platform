-- Migration 985: consolidate business_type healthcare → mental_health (safe de-dupe)
-- Also creates user_agency_practice_categories for Provider practice categories.

-- 1) agency_business_types: prefer mental_health when both exist
UPDATE agency_business_types abt_h
INNER JOIN agency_business_types abt_m
  ON abt_m.agency_id = abt_h.agency_id
 AND abt_m.business_type = 'mental_health'
SET abt_m.is_enabled = GREATEST(abt_m.is_enabled, abt_h.is_enabled)
WHERE abt_h.business_type = 'healthcare';

DELETE abt_h FROM agency_business_types abt_h
INNER JOIN agency_business_types abt_m
  ON abt_m.agency_id = abt_h.agency_id
 AND abt_m.business_type = 'mental_health'
WHERE abt_h.business_type = 'healthcare';

UPDATE agency_business_types
SET business_type = 'mental_health'
WHERE business_type = 'healthcare';

-- 2) Soft-deactivate tenant_services that would collide after remap (same agency + name under mental_health)
UPDATE tenant_services ts_h
INNER JOIN tenant_services ts_m
  ON ts_m.agency_id = ts_h.agency_id
 AND ts_m.business_type = 'mental_health'
 AND LOWER(TRIM(ts_m.name)) = LOWER(TRIM(ts_h.name))
 AND ts_m.is_active = 1
SET ts_h.is_active = 0
WHERE ts_h.business_type = 'healthcare'
  AND ts_h.is_active = 1;

-- Prefer keeping mental_health row when same service_code exists
UPDATE tenant_services ts_h
INNER JOIN tenant_services ts_m
  ON ts_m.agency_id = ts_h.agency_id
 AND ts_m.business_type = 'mental_health'
 AND ts_m.service_code IS NOT NULL
 AND ts_h.service_code IS NOT NULL
 AND UPPER(TRIM(ts_m.service_code)) = UPPER(TRIM(ts_h.service_code))
 AND ts_m.is_active = 1
SET ts_h.is_active = 0
WHERE ts_h.business_type = 'healthcare'
  AND ts_h.is_active = 1;

UPDATE tenant_services
SET business_type = 'mental_health'
WHERE business_type = 'healthcare';

-- 3) booking_packages
UPDATE booking_packages bp_h
INNER JOIN booking_packages bp_m
  ON bp_m.agency_id = bp_h.agency_id
 AND bp_m.business_type = 'mental_health'
 AND LOWER(TRIM(bp_m.name)) = LOWER(TRIM(bp_h.name))
 AND bp_m.is_active = 1
SET bp_h.is_active = 0
WHERE bp_h.business_type = 'healthcare'
  AND bp_h.is_active = 1;

UPDATE booking_packages
SET business_type = 'mental_health'
WHERE business_type = 'healthcare';

UPDATE booking_package_entitlements
SET business_type = 'mental_health'
WHERE business_type = 'healthcare';

-- 4) appointments
UPDATE appointments
SET business_type = 'mental_health'
WHERE business_type = 'healthcare';

-- 5) cancellation policies scoped to healthcare
UPDATE booking_cancellation_policies
SET business_type = 'mental_health'
WHERE business_type = 'healthcare';

-- 6) Practice categories (Provider multi-select, agency-scoped)
CREATE TABLE IF NOT EXISTS user_agency_practice_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  agency_id INT NOT NULL,
  user_id INT NOT NULL,
  category VARCHAR(64) NOT NULL
    COMMENT 'mental_health|tutoring|coaching|consulting',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_agency_practice_category (agency_id, user_id, category),
  KEY idx_uapc_user (user_id),
  KEY idx_uapc_agency (agency_id),
  CONSTRAINT fk_uapc_agency
    FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_uapc_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

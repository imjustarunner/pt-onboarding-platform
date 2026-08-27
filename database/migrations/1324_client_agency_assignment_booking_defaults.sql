-- Migration 1324: Per-tenant default office / place of service on client agency memberships
ALTER TABLE client_agency_assignments
  ADD COLUMN default_office_location_id INT NULL DEFAULT NULL
    COMMENT 'Office location default scoped to this tenant membership',
  ADD COLUMN default_place_of_service VARCHAR(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL
    COMMENT 'CMS place of service default for this tenant membership',
  ADD COLUMN default_service_location_id INT NULL DEFAULT NULL
    COMMENT 'Optional service location default for this tenant membership';

-- Soft-archive any non-tenant rows mistakenly stored as client tenant memberships
UPDATE client_agency_assignments ca
INNER JOIN agencies a ON a.id = ca.agency_id
SET ca.is_active = FALSE,
    ca.updated_at = CURRENT_TIMESTAMP
WHERE ca.is_active = TRUE
  AND LOWER(TRIM(COALESCE(a.organization_type, 'agency'))) <> 'agency';

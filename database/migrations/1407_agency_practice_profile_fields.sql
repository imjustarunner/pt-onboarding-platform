-- Migration 1407: tenant practice profile fields + Patient's Residence POS label
-- Timezone already exists (642). Adds account owner, website, EIN/SSN tax id.
-- Medical tenants surface this as "Practice" profile in the admin UI.

ALTER TABLE agencies
  ADD COLUMN account_owner_user_id INT NULL
    COMMENT 'Primary account owner user for this tenant/practice',
  ADD COLUMN website_url VARCHAR(512)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL
    COMMENT 'Public practice / company website URL',
  ADD COLUMN tax_id_type ENUM('ein', 'ssn')
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL
    COMMENT 'Whether tax_id is an EIN (business) or SSN (sole prop)',
  ADD COLUMN tax_id VARCHAR(32)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL
    COMMENT 'EIN or SSN (digits/dashes). Prefer encrypted columns when set.',
  ADD COLUMN tax_id_ciphertext TEXT NULL,
  ADD COLUMN tax_id_iv VARCHAR(64)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL,
  ADD COLUMN tax_id_auth_tag VARCHAR(64)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL,
  ADD COLUMN tax_id_key_id VARCHAR(64)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL,
  ADD COLUMN tax_id_last4 VARCHAR(4)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    NULL DEFAULT NULL
    COMMENT 'Last 4 of EIN/SSN for display without revealing full value';

-- No FK on account_owner_user_id: agencies already at MySQL's 64-key limit.
-- Application code validates the user id when saving.

-- Backfill website from theme_settings.publicWebsiteUrl when present
UPDATE agencies
SET website_url = NULLIF(
  TRIM(BOTH '"' FROM JSON_UNQUOTE(JSON_EXTRACT(theme_settings, '$.publicWebsiteUrl'))),
  ''
)
WHERE website_url IS NULL
  AND theme_settings IS NOT NULL
  AND JSON_EXTRACT(theme_settings, '$.publicWebsiteUrl') IS NOT NULL
  AND TRIM(BOTH '"' FROM JSON_UNQUOTE(JSON_EXTRACT(theme_settings, '$.publicWebsiteUrl'))) <> '';

-- Default tenant timezone to Mountain when unset for known CO practices
UPDATE agencies
SET timezone = 'America/Denver'
WHERE timezone IS NULL
  AND slug IN ('itsco', 'nlu', 'nextlevelup', 'nextleveluplcc', 'tisi', 'inner-strength', 'innerstrength', 'theinnerstrengthinstitute');

-- Rename seeded POS 12 templates from Home → Patient's Residence
UPDATE agency_service_locations
SET name = 'Patient''s Residence'
WHERE place_of_service = '12'
  AND location_kind = 'office_pos'
  AND is_active = 1
  AND (
    name = 'Home'
    OR LOWER(name) = 'home'
  );

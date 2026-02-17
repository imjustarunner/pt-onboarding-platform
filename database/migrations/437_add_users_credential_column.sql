-- Add a hard credential column on users and backfill from legacy user-info values.
ALTER TABLE users
  ADD COLUMN credential VARCHAR(255) NULL AFTER service_focus;

-- Backfill from existing provider credential-style user-info fields.
-- We preserve any existing non-empty users.credential value.
UPDATE users u
JOIN (
  SELECT
    uiv.user_id,
    SUBSTRING_INDEX(
      GROUP_CONCAT(
        NULLIF(TRIM(COALESCE(uiv.value, '')), '')
        ORDER BY uiv.updated_at DESC, uiv.id DESC
        SEPARATOR '||'
      ),
      '||',
      1
    ) AS resolved_credential
  FROM user_info_values uiv
  JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
  WHERE uifd.field_key IN ('provider_credential', 'provider_credential_license_type_number')
  GROUP BY uiv.user_id
) src ON src.user_id = u.id
SET u.credential = src.resolved_credential
WHERE src.resolved_credential IS NOT NULL
  AND TRIM(src.resolved_credential) <> ''
  AND (u.credential IS NULL OR TRIM(u.credential) = '');

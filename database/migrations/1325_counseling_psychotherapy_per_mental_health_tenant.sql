-- Migration 1325: Ensure each mental_health tenant has an in-office Counseling and Psychotherapy clinical program
-- Keeps existing NLU slug counseling-and-psychotherapy; other tenants get counseling-and-psychotherapy-{agencyId}.

INSERT INTO agencies (
  name,
  official_name,
  slug,
  portal_url,
  organization_type,
  is_active,
  is_archived,
  color_palette,
  feature_flags
)
SELECT
  'Counseling and Psychotherapy',
  'Counseling and Psychotherapy',
  CONCAT('counseling-and-psychotherapy-', a.id),
  NULL,
  'clinical',
  1,
  0,
  COALESCE(
    a.color_palette,
    CAST('{"primary":"#059669","secondary":"#10b981","accent":"#f59e0b"}' AS JSON)
  ),
  CAST('{
    "noteAidEnabled": true,
    "focusMusicEnabled": true,
    "focusPackageEnabled": true,
    "clinicalNoteGeneratorEnabled": true,
    "inOfficeCounselingProgram": true
  }' AS JSON)
FROM agencies a
INNER JOIN agency_business_types abt
  ON abt.agency_id = a.id
 AND abt.business_type = 'mental_health'
 AND COALESCE(abt.is_enabled, 1) = 1
WHERE LOWER(TRIM(COALESCE(a.organization_type, 'agency'))) = 'agency'
  AND COALESCE(a.is_archived, 0) = 0
  AND NOT EXISTS (
    SELECT 1
    FROM organization_affiliations oa
    INNER JOIN agencies child ON child.id = oa.organization_id
    WHERE oa.agency_id = a.id
      AND COALESCE(oa.is_active, 0) = 1
      AND LOWER(TRIM(COALESCE(child.organization_type, ''))) = 'clinical'
      AND (
        LOWER(TRIM(COALESCE(child.slug, ''))) = 'counseling-and-psychotherapy'
        OR LOWER(TRIM(COALESCE(child.slug, ''))) = CONCAT('counseling-and-psychotherapy-', a.id)
        OR LOWER(TRIM(COALESCE(child.name, ''))) = 'counseling and psychotherapy'
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM agencies x
    WHERE x.slug = CONCAT('counseling-and-psychotherapy-', a.id)
  );

INSERT INTO organization_affiliations (agency_id, organization_id, is_active)
SELECT
  a.id,
  child.id,
  1
FROM agencies a
INNER JOIN agencies child
  ON child.slug = CONCAT('counseling-and-psychotherapy-', a.id)
 AND LOWER(TRIM(COALESCE(child.organization_type, ''))) = 'clinical'
INNER JOIN agency_business_types abt
  ON abt.agency_id = a.id
 AND abt.business_type = 'mental_health'
 AND COALESCE(abt.is_enabled, 1) = 1
WHERE LOWER(TRIM(COALESCE(a.organization_type, 'agency'))) = 'agency'
  AND COALESCE(a.is_archived, 0) = 0
  AND NOT EXISTS (
    SELECT 1
    FROM organization_affiliations oa
    WHERE oa.agency_id = a.id
      AND oa.organization_id = child.id
  );

-- Reactivate inactive counseling program affiliations for mental_health tenants
UPDATE organization_affiliations oa
INNER JOIN agencies parent ON parent.id = oa.agency_id
INNER JOIN agencies child ON child.id = oa.organization_id
INNER JOIN agency_business_types abt
  ON abt.agency_id = parent.id
 AND abt.business_type = 'mental_health'
 AND COALESCE(abt.is_enabled, 1) = 1
SET oa.is_active = 1,
    oa.updated_at = CURRENT_TIMESTAMP
WHERE COALESCE(oa.is_active, 0) = 0
  AND LOWER(TRIM(COALESCE(parent.organization_type, 'agency'))) = 'agency'
  AND LOWER(TRIM(COALESCE(child.organization_type, ''))) = 'clinical'
  AND (
    LOWER(TRIM(COALESCE(child.slug, ''))) = 'counseling-and-psychotherapy'
    OR LOWER(TRIM(COALESCE(child.slug, ''))) LIKE 'counseling-and-psychotherapy-%'
    OR LOWER(TRIM(COALESCE(child.name, ''))) = 'counseling and psychotherapy'
  );

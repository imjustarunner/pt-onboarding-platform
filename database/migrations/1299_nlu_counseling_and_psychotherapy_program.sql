-- Migration 1299: Next Level Up — Counseling and Psychotherapy clinical program org
-- Join counseling lane prefers organization_type clinical over program, so counseling
-- intakes land here (clinical client_type) instead of other NLU program affiliations.

SET @nlu_agency_id = (
  SELECT id
  FROM agencies
  WHERE LOWER(COALESCE(organization_type, '')) = 'agency'
    AND COALESCE(is_archived, 0) = 0
    AND (
      LOWER(COALESCE(slug, '')) IN ('nextlevelup', 'next-level-up', 'nextleveluplcc', 'nlu')
      OR LOWER(COALESCE(portal_url, '')) IN ('nextlevelup', 'next-level-up', 'nextleveluplcc', 'nlu')
      OR LOWER(COALESCE(name, '')) LIKE '%next level up%'
    )
  ORDER BY
    CASE LOWER(COALESCE(slug, ''))
      WHEN 'nlu' THEN 0
      WHEN 'nextlevelup' THEN 1
      WHEN 'nextleveluplcc' THEN 2
      ELSE 3
    END,
    id ASC
  LIMIT 1
);

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
  'counseling-and-psychotherapy',
  NULL,
  'clinical',
  1,
  0,
  CAST('{"primary":"#059669","secondary":"#10b981","accent":"#f59e0b"}' AS JSON),
  CAST('{
    "noteAidEnabled": true,
    "focusMusicEnabled": true,
    "focusPackageEnabled": true,
    "clinicalNoteGeneratorEnabled": true
  }' AS JSON)
FROM DUAL
WHERE @nlu_agency_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agencies WHERE slug = 'counseling-and-psychotherapy'
  );

SET @nlu_counseling_org_id = (
  SELECT id
  FROM agencies
  WHERE slug = 'counseling-and-psychotherapy'
    AND LOWER(COALESCE(organization_type, '')) = 'clinical'
  LIMIT 1
);

INSERT INTO organization_affiliations (agency_id, organization_id, is_active)
SELECT @nlu_agency_id, @nlu_counseling_org_id, 1
FROM DUAL
WHERE @nlu_agency_id IS NOT NULL
  AND @nlu_counseling_org_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM organization_affiliations
    WHERE agency_id = @nlu_agency_id
      AND organization_id = @nlu_counseling_org_id
  );

-- Re-activate affiliation if org already existed but link was inactive
UPDATE organization_affiliations oa
INNER JOIN agencies child ON child.id = oa.organization_id
SET oa.is_active = 1,
    oa.updated_at = CURRENT_TIMESTAMP
WHERE oa.agency_id = @nlu_agency_id
  AND child.slug = 'counseling-and-psychotherapy'
  AND COALESCE(oa.is_active, 0) = 0;

-- Migration 1340: Ensure Next Level Up has full Note Aid + clinical generator
-- and mental_health business type so admin toggles / tools stay visible.

UPDATE agencies
SET feature_flags = JSON_SET(
  COALESCE(feature_flags, JSON_OBJECT()),
  '$.noteAidEnabled', TRUE,
  '$.clinicalNoteGeneratorEnabled', TRUE
)
WHERE id = 6
   OR LOWER(COALESCE(slug, portal_url, '')) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up');

INSERT INTO agency_business_types (agency_id, business_type, is_enabled, sort_order)
SELECT a.id, 'mental_health', 1, 0
FROM agencies a
WHERE (
    a.id = 6
    OR LOWER(COALESCE(a.slug, a.portal_url, '')) IN ('nlu', 'nextlevelup', 'nextleveluplcc', 'next-level-up')
  )
  AND NOT EXISTS (
    SELECT 1 FROM agency_business_types abt
    WHERE abt.agency_id = a.id AND abt.business_type = 'mental_health'
  );

-- Migration 1301: Enable medical billing for Next Level Up and ITSCO
-- Note Aid chart/plan APIs gate on medicalBillingEnabled for the client's agency.

UPDATE agencies
SET feature_flags = JSON_SET(
  COALESCE(feature_flags, JSON_OBJECT()),
  '$.medicalBillingEnabled',
  CAST('true' AS JSON)
),
updated_at = CURRENT_TIMESTAMP
WHERE COALESCE(is_archived, 0) = 0
  AND (
    LOWER(COALESCE(slug, '')) IN (
      'itsco',
      'itsco-demo',
      'demo',
      'nlu',
      'nextlevelup',
      'next-level-up',
      'nextleveluplcc'
    )
    OR LOWER(COALESCE(portal_url, '')) IN (
      'itsco',
      'itsco-demo',
      'demo',
      'nlu',
      'nextlevelup',
      'next-level-up',
      'nextleveluplcc'
    )
    OR LOWER(COALESCE(name, '')) LIKE '%itsco%'
    OR LOWER(COALESCE(name, '')) LIKE '%next level up%'
  );

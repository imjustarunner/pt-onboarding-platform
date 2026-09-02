-- Migration 1250: Permanently enable ITSCO payroll wizard Compliance step.
-- Should have unlocked during pay period 2026-08-15 → 2026-08-28; set retroactively so
-- processors see the Compliance phase on all future payroll runs.

SET @itsco_id = (
  SELECT id FROM agencies
  WHERE organization_type = 'agency'
    AND (
      LOWER(COALESCE(slug, '')) IN ('itsco')
      OR LOWER(COALESCE(portal_url, '')) IN ('itsco')
    )
  ORDER BY id ASC
  LIMIT 1
);

UPDATE agencies
SET payroll_compliance_unlocked_at = COALESCE(payroll_compliance_unlocked_at, CURRENT_TIMESTAMP)
WHERE id = @itsco_id
  AND @itsco_id IS NOT NULL;

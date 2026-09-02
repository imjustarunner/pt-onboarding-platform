-- Migration 1355: Enable payroll wizard Compliance for all healthcare / mental_health tenants.
-- Feature was gated on selecting pay period 2026-08-15 → 2026-08-28; unlock permanently for
-- every agency-type tenant with an enabled mental_health (or legacy healthcare) business type.

UPDATE agencies a
INNER JOIN agency_business_types abt
  ON abt.agency_id = a.id
 AND abt.business_type IN ('mental_health', 'healthcare')
 AND COALESCE(abt.is_enabled, 1) = 1
SET a.payroll_compliance_unlocked_at = COALESCE(a.payroll_compliance_unlocked_at, CURRENT_TIMESTAMP)
WHERE LOWER(TRIM(COALESCE(a.organization_type, 'agency'))) = 'agency'
  AND COALESCE(a.is_archived, 0) = 0;

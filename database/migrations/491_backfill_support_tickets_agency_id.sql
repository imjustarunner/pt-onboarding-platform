-- Backfill support_tickets.agency_id for tickets with NULL agency_id.
--
-- Problem: Some tickets were created with agency_id = NULL when the school's parent agency
-- could not be resolved at creation time. Admin staff scope tickets by agency_id and
-- school_organization_id, so NULL agency_id can cause tickets to be missed.
--
-- Fix: Set agency_id from organization_affiliations (primary) or agency_schools (legacy)
-- for each ticket that has school_organization_id but NULL agency_id.

UPDATE support_tickets t
SET t.agency_id = COALESCE(
  (SELECT oa.agency_id
   FROM organization_affiliations oa
   WHERE oa.organization_id = t.school_organization_id
     AND oa.is_active = TRUE
   ORDER BY oa.updated_at DESC, oa.id DESC
   LIMIT 1),
  (SELECT s.agency_id
   FROM agency_schools s
   WHERE s.school_organization_id = t.school_organization_id
     AND s.is_active = TRUE
   ORDER BY s.updated_at DESC, s.id DESC
   LIMIT 1)
)
WHERE t.agency_id IS NULL
  AND t.school_organization_id IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM organization_affiliations oa2
      WHERE oa2.organization_id = t.school_organization_id AND oa2.is_active = TRUE
    )
    OR EXISTS (
      SELECT 1 FROM agency_schools s2
      WHERE s2.school_organization_id = t.school_organization_id AND s2.is_active = TRUE
    )
  );

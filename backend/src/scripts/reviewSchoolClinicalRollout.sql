-- Read-only, pre-migration inventory. Counts are chart-agency pairs, including history.
-- Each active agency affiliation has its own row per chart before aggregation.
WITH chart_scope AS (
  SELECT c.id AS client_id, c.agency_id FROM clients c
  UNION
  SELECT ca.client_id, ca.agency_id FROM client_agency_assignments ca WHERE ca.is_active=1
), evidence AS (
  SELECT cs.agency_id, c.id,
    (c.client_type='school' AND c.agency_id=cs.agency_id) AS legacy_school,
    MAX(CASE WHEN o.organization_type='school' THEN 1 ELSE 0 END) AS assigned_school,
    MAX(CASE WHEN o.organization_type='clinical' AND
        (o.slug IN ('counseling-and-psychotherapy',CONCAT('counseling-and-psychotherapy-',cs.agency_id))
         OR JSON_UNQUOTE(JSON_EXTRACT(o.feature_flags,'$.inOfficeCounselingProgram')) IN ('true','1'))
      THEN 1 ELSE 0 END) AS clinical_group,
    MAX(CASE WHEN COALESCE(o.organization_type,'') <> 'clinical'
      AND (LOWER(TRIM(o.name)) IN ('counseling and psychotherapy','counseling and therapy')
        OR o.slug IN ('counseling-and-psychotherapy',CONCAT('counseling-and-psychotherapy-',cs.agency_id)))
      THEN 1 ELSE 0 END) AS ambiguous_group
  FROM chart_scope cs JOIN clients c ON c.id=cs.client_id
  LEFT JOIN agencies o ON o.is_active=1 AND COALESCE(o.is_archived,0)=0
    AND (o.id=c.organization_id AND NOT EXISTS (SELECT 1 FROM client_organization_assignments old
          WHERE old.client_id=c.id AND old.organization_id=o.id AND old.is_active=0)
      OR EXISTS (SELECT 1 FROM client_organization_assignments ca WHERE ca.client_id=c.id AND ca.organization_id=o.id AND ca.is_active=1))
    AND (o.id=cs.agency_id OR (c.agency_id=cs.agency_id AND c.organization_id=o.id)
      OR EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=o.id AND oa.agency_id=cs.agency_id AND oa.is_active=1)
      OR EXISTS (SELECT 1 FROM agency_schools s WHERE s.school_organization_id=o.id AND s.agency_id=cs.agency_id AND s.is_active=1))
  GROUP BY cs.agency_id,c.id,c.client_type,c.agency_id
)
SELECT agency_id, COUNT(*) AS chart_agency_pairs,
  SUM(assigned_school) AS active_school_assignments,
  SUM(legacy_school) AS legacy_school_charts,
  SUM(legacy_school AND NOT assigned_school) AS review_legacy_school_without_active_assignment,
  SUM(clinical_group) AS verified_clinical_group_charts,
  SUM(ambiguous_group) AS review_organization_identity
FROM evidence GROUP BY agency_id ORDER BY agency_id

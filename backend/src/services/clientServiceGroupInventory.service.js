// Migrations 1299 and 1325 created clinical organizations with these identities.
export async function inventoryClientServiceGroups(db, agencyId) {
  if (!Number.isSafeInteger(agencyId) || agencyId < 1) throw new Error('A positive agency ID is required.');
  const [groups] = await db.execute(`
    WITH scoped_clients AS (
      SELECT c.id,c.agency_id,c.organization_id FROM clients c WHERE c.agency_id=?
        OR EXISTS (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1)
    ), assignments AS (
      SELECT c.id AS client_id,c.organization_id FROM scoped_clients c WHERE c.agency_id=?
        AND NOT EXISTS (SELECT 1 FROM client_organization_assignments co WHERE co.client_id=c.id AND co.organization_id=c.organization_id AND co.is_active=0)
      UNION
      SELECT co.client_id,co.organization_id FROM client_organization_assignments co
        JOIN scoped_clients c ON c.id=co.client_id JOIN organization_affiliations oa ON oa.organization_id=co.organization_id
        WHERE co.is_active=1 AND oa.agency_id=? AND oa.is_active=1
      UNION
      SELECT e.client_id,e.organization_id FROM client_service_enrollments e JOIN scoped_clients c ON c.id=e.client_id
        WHERE e.agency_id=? AND e.is_active=1
    )
    SELECT o.id,o.organization_type,o.slug,o.name,
      JSON_UNQUOTE(JSON_EXTRACT(o.feature_flags,'$.inOfficeCounselingProgram')) AS seeded_flag,
      COUNT(DISTINCT link.client_id) AS chart_count
    FROM agencies o LEFT JOIN assignments link ON link.organization_id=o.id
    WHERE (link.client_id IS NOT NULL OR EXISTS (SELECT 1 FROM organization_affiliations oa
      WHERE oa.organization_id=o.id AND oa.agency_id=? AND oa.is_active=1))
      AND (LOWER(TRIM(o.name)) IN ('counseling and psychotherapy','counseling and therapy')
        OR o.slug='counseling-and-psychotherapy' OR o.slug=CONCAT('counseling-and-psychotherapy-', ?)
        OR JSON_UNQUOTE(JSON_EXTRACT(o.feature_flags,'$.inOfficeCounselingProgram')) IN ('true','1'))
    GROUP BY o.id,o.organization_type,o.slug,o.name,seeded_flag ORDER BY o.id`, Array(7).fill(agencyId));
  return groups.map(row => {
    const seeded = ['counseling-and-psychotherapy', `counseling-and-psychotherapy-${agencyId}`].includes(row.slug)
      || ['true','1'].includes(String(row.seeded_flag));
    return {organizationId:Number(row.id), organizationType:row.organization_type, charts:Number(row.chart_count),
      classification:seeded && row.organization_type === 'clinical' ? 'verified clinical group' : 'review identity'};
  });
}

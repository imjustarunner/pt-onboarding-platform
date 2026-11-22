import pool from '../config/database.js';

// Every entry is tied to this participant and agency. Staff and guardians authorize the chart separately.
export async function programParticipation(clientId, agencyId, db=pool) {
  const [rows] = await db.execute(`SELECT 'event' AS kind, e.id, e.title AS name, e.registration_audience AS audience, e.medicaid_eligible,
      CASE WHEN COALESCE(e.is_active,1)=0 OR m.is_active=0 THEN 'past'
        WHEN COALESCE((SELECT MAX(d.ends_at) FROM company_event_session_dates d WHERE d.company_event_id=e.id),e.ends_at)<NOW()
        AND COALESCE(DATE(JSON_UNQUOTE(JSON_EXTRACT(e.recurrence_json,'$.untilDate'))),DATE(e.ends_at))<CURRENT_DATE THEN 'past'
        ELSE 'current' END AS period
    FROM company_event_clients m JOIN company_events e ON e.id=m.company_event_id AND e.agency_id=m.agency_id
    WHERE m.client_id=? AND m.agency_id=?
    UNION
    SELECT 'event',e.id,e.title,e.registration_audience,e.medicaid_eligible,
      IF(COALESCE(e.is_active,1)=0 OR g.end_date<CURRENT_DATE,'past','current')
    FROM skills_group_clients m JOIN skills_groups g ON g.id=m.skills_group_id JOIN company_events e ON e.id=g.company_event_id AND e.agency_id=g.agency_id
    WHERE m.client_id=? AND g.agency_id=? AND NOT EXISTS (SELECT 1 FROM company_event_clients ec WHERE ec.company_event_id=e.id AND ec.client_id=m.client_id)
    UNION
    SELECT 'class',k.id,k.class_name,k.registration_audience,k.medicaid_eligible,
      IF(m.membership_status IN ('removed','completed') OR k.status IN ('closed','archived') OR k.ends_at<NOW(),'past','current')
    FROM learning_class_client_memberships m JOIN learning_program_classes k ON k.id=m.learning_class_id
    JOIN clients c ON c.id=m.client_id JOIN agencies o ON o.id=k.organization_id
    WHERE m.client_id=? AND c.agency_id=? AND o.organization_type IN ('agency','clinical','program','school','learning')
      AND (k.organization_id=c.agency_id OR EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=k.organization_id AND oa.agency_id=c.agency_id))
    UNION
    SELECT h.kind,h.offering_id,h.name,h.audience,0,'past'
    FROM client_program_past_participants h WHERE h.client_id=? AND h.agency_id=?
    UNION
    SELECT 'program',h.organization_id,h.organization_name,'unclassified',0,'past'
    FROM client_program_retirement_history h WHERE h.client_id=? AND h.agency_id=?
    UNION
    SELECT 'program',o.id,o.name,'unclassified',0,IF(m.is_active=1,'current','past')
    FROM client_organization_assignments m JOIN agencies o ON o.id=m.organization_id AND o.organization_type='program'
    JOIN clients c ON c.id=m.client_id WHERE m.client_id=? AND c.agency_id=?
      AND (c.organization_id=o.id OR EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.agency_id=c.agency_id AND oa.organization_id=o.id))
    ORDER BY period,name`,Array.from({length:6},()=>[clientId,agencyId]).flat());
  const unique = new Map();
  for (const row of rows) {
    const key=`${row.kind}/${row.id}/${row.period}`;
    if (!unique.has(key) || Number(row.medicaid_eligible)) unique.set(key,row);
  }
  return [...unique.values()];
}

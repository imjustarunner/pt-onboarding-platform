import {inventoryClientServiceGroups} from './clientServiceGroupInventory.service.js';

// This cutoff identifies the test-era enrollments. Later enrollments belong to the new catalog.
export const legacyEnrollmentCutoff = '2026-11-22 18:33:56';
const cutoff = legacyEnrollmentCutoff;
const affiliation = 'EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=k.organization_id AND oa.agency_id=? AND oa.is_active=1)';

async function collectOfferings(db, agencyId) {
  const [classes] = await db.execute(`SELECT k.id,k.organization_id,k.class_name AS name,IF(k.medicaid_eligible,'clinical',k.registration_audience) AS audience,
    (k.registration_eligible=1 OR EXISTS (SELECT 1 FROM learning_class_client_memberships m WHERE
      m.learning_class_id=k.id AND m.membership_status IN ('active','invited'))) AS needs_retirement,
    (k.starts_at>? OR k.ends_at>? OR EXISTS (SELECT 1 FROM learning_class_sessions s WHERE s.learning_class_id=k.id
      AND (s.status='live' OR (s.status='scheduled' AND COALESCE(s.ends_at,s.starts_at,'9999-12-31')>?)))) AS future_session,
    EXISTS (SELECT 1 FROM booking_package_entitlements e WHERE e.learning_program_class_id=k.id AND
      (e.sessions_remaining>0 OR e.sessions_reserved>0 OR e.payment_status IN ('PENDING','PARTIAL')) AND e.status<>'CANCELLED') AS outstanding_credit,
    EXISTS (SELECT 1 FROM learning_class_client_memberships m JOIN clients c ON c.id=m.client_id WHERE m.learning_class_id=k.id
      AND m.membership_status IN ('active','invited') AND (c.agency_id<>? OR m.updated_at>?)) AS other_enrollment,
    EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=k.organization_id AND oa.agency_id<>? AND oa.is_active=1) AS shared_agency
    FROM learning_program_classes k JOIN agencies o ON o.id=k.organization_id
    WHERE (k.organization_id=? OR ${affiliation}) AND o.organization_type IN ('agency','clinical','learning','program','school')
      AND NOT EXISTS (SELECT 1 FROM client_program_retired_offerings h WHERE h.agency_id=? AND h.kind='class' AND h.offering_id=k.id)
      AND k.created_at<=?
`,
    [cutoff,cutoff,cutoff,agencyId,cutoff,agencyId,agencyId,agencyId,agencyId,cutoff]);
  const [events] = await db.execute(`SELECT e.id,e.organization_id,e.title AS name,IF(e.medicaid_eligible,'clinical',e.registration_audience) AS audience, COALESCE(e.is_active,1) AS needs_retirement,
    (COALESCE(e.ends_at,e.starts_at)>? OR DATE(JSON_UNQUOTE(JSON_EXTRACT(e.recurrence_json,'$.untilDate')))>=DATE(?)
      OR EXISTS (SELECT 1 FROM company_event_session_dates d WHERE d.company_event_id=e.id AND d.ends_at>?)
      OR EXISTS (SELECT 1 FROM skills_groups g WHERE g.company_event_id=e.id AND g.end_date>=DATE(?))
      OR EXISTS (SELECT 1 FROM skill_builders_event_sessions s WHERE s.company_event_id=e.id AND s.ends_at>?)) AS future_session,
    EXISTS (SELECT 1 FROM company_event_clients m WHERE m.company_event_id=e.id AND m.is_active=1 AND m.enrolled_at>?) AS other_enrollment
    FROM company_events e LEFT JOIN agencies o ON o.id=e.organization_id WHERE e.agency_id=? AND e.created_at<=?
      AND NOT EXISTS (SELECT 1 FROM client_program_retired_offerings h WHERE h.agency_id=e.agency_id AND h.kind='event' AND h.offering_id=e.id)
      AND (o.organization_type='program' OR e.event_type IN ('skills_group','guardian_program_class') OR LEFT(e.event_type,8)='program_' OR EXISTS (SELECT 1 FROM skills_groups sg
      WHERE sg.agency_id=e.agency_id AND sg.company_event_id=e.id))`,
    [cutoff,cutoff,cutoff,cutoff,cutoff,cutoff,agencyId,cutoff]);
  return [...classes.map(row=>({...row,kind:'class'})), ...events.map(row=>({...row,kind:'event'}))];
}

function conflictReasons(row) {
  return [['future_session','Scheduled session or program end after cutoff'],['outstanding_credit','Unused or pending package credit'],
    ['other_enrollment','Newer enrollment or participant from another agency'],['shared_agency','Class is shared with another agency'],
    ['open_order','Registration payment or fulfillment pending']].filter(([key])=>Number(row[key])).map(([,reason])=>reason);
}

export async function retireLegacyPrograms(db, agencyId, {apply=false}={}) {
  if (!Number.isSafeInteger(agencyId) || agencyId<1) throw new Error('A positive agency ID is required.');
  const conflicts = [], heldOrgs = new Set();
  const counts = {classes:0,events:0,programEnrollments:0};
  await db.query(apply ? 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE' : 'SET TRANSACTION READ ONLY');
  await db.beginTransaction();
  try {
    const identityReview = new Set((await inventoryClientServiceGroups(db,agencyId))
      .filter(group=>group.classification==='review identity').map(group=>group.organizationId));
    for (const id of identityReview) {
      conflicts.push({kind:'organization',id,reasons:['Confirm the identity of the legacy counseling organization']});
      heldOrgs.add(id);
    }
    const offerings = await collectOfferings(db,agencyId);
    for (const row of offerings) {
      if (identityReview.has(Number(row.organization_id))) continue;
      const source = row.kind==='class' ? 'class_registration' : 'event_registration';
      const [[order]] = await db.execute(`SELECT 1 AS open_order FROM family_receivables r
        LEFT JOIN family_fulfillment_jobs j ON j.receivable_id=r.id
        WHERE r.agency_id=? AND r.source_type=? AND r.source_key LIKE CONCAT(?,':%')
        AND (r.status IN ('review','open') OR (r.status='paid' AND COALESCE(j.status,'pending')<>'completed')) LIMIT 1`,
        [agencyId,source,String(row.id)]);
      if (!Number(row.needs_retirement) && !Number(row.outstanding_credit) && !order) continue;
      const reasons = conflictReasons({...row,...order});
      if (reasons.length) {
        heldOrgs.add(Number(row.organization_id));
        conflicts.push({kind:row.kind,id:row.id,reasons});
        continue;
      }
      if (apply) {
        await db.execute('INSERT INTO client_program_retired_offerings (agency_id,kind,offering_id) VALUES (?,?,?)',[agencyId,row.kind,row.id]);
        const roster = row.kind==='class' ? 'SELECT client_id FROM learning_class_client_memberships WHERE learning_class_id=?'
          : `SELECT client_id FROM company_event_clients WHERE company_event_id=? AND agency_id=?
             UNION SELECT m.client_id FROM skills_group_clients m JOIN skills_groups g ON g.id=m.skills_group_id WHERE g.company_event_id=? AND g.agency_id=?`;
        await db.execute(`INSERT INTO client_program_past_participants (agency_id,kind,offering_id,client_id,name,audience)
          SELECT ?,?,?,r.client_id,?,? FROM (${roster}) r JOIN clients c ON c.id=r.client_id AND c.agency_id=?`,
          [agencyId,row.kind,row.id,row.name,row.audience,...(row.kind==='class'?[row.id]:[row.id,agencyId,row.id,agencyId]),agencyId]);
      }
      if (row.kind==='class') {
        counts.classes++;
        if (!apply) continue;
        await db.execute("UPDATE learning_program_classes SET status='closed',registration_eligible=0 WHERE id=?",[row.id]);
        await db.execute("UPDATE learning_class_client_memberships SET membership_status=IF(membership_status='invited','removed','completed') WHERE learning_class_id=? AND membership_status IN ('active','invited')",[row.id]);
      } else {
        counts.events++;
        if (apply) await db.execute('UPDATE company_events SET registration_eligible=0,is_active=0 WHERE agency_id=? AND id=?',[agencyId,row.id]);
      }
    }

    const [members] = await db.execute(`SELECT c.id AS client_id,o.id AS organization_id,o.name,
      EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=o.id AND oa.is_active=1 AND oa.agency_id<>?) AS shared_agency
      FROM clients c JOIN agencies o ON o.organization_type='program'
        AND (o.id=c.organization_id OR EXISTS (SELECT 1 FROM client_organization_assignments m WHERE m.organization_id=o.id AND m.client_id=c.id))
      LEFT JOIN client_organization_assignments m ON m.client_id=c.id AND m.organization_id=o.id
      WHERE c.agency_id=? AND COALESCE(m.is_active,1)=1 AND COALESCE(m.updated_at,c.created_at)<=?
      AND NOT EXISTS (SELECT 1 FROM client_program_retirement_history h WHERE h.client_id=c.id AND h.agency_id=? AND h.organization_id=o.id)`,
      [agencyId,agencyId,cutoff,agencyId]);
    const reportedOrgs = new Set();
    for (const m of members) {
      if (heldOrgs.has(Number(m.organization_id))) continue;
      if (Number(m.shared_agency)) {
        if (!reportedOrgs.has(m.organization_id)) conflicts.push({kind:'program',id:m.organization_id,reasons:['Program assignment is shared with another agency']});
        reportedOrgs.add(m.organization_id);
        continue;
      }
      counts.programEnrollments++;
      if (!apply) continue;
      await db.execute('INSERT INTO client_program_retirement_history (agency_id,client_id,organization_id,organization_name) VALUES (?,?,?,?)',
        [agencyId,m.client_id,m.organization_id,m.name]);
      await db.execute(`INSERT INTO client_organization_assignments (client_id,organization_id,is_primary,is_active) VALUES (?,?,0,0)
        ON DUPLICATE KEY UPDATE is_active=0,is_primary=0`,[m.client_id,m.organization_id]);
      // Office charts use the owning agency as their required legacy organization ID.
      await db.execute('UPDATE clients SET organization_id=agency_id WHERE id=? AND agency_id=? AND organization_id=?',[m.client_id,agencyId,m.organization_id]);
    }
    await db.commit();
    return {agencyId,cutoffUtc:cutoff,applied:apply,counts,conflicts};
  } catch (error) { await db.rollback(); throw error; }
}

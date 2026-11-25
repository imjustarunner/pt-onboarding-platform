import { decryptIntakeSubmissionRow } from './intakeResponsesEncryption.service.js';
import { classifyClientTotals, hasExampleRegistrationEmail } from '../utils/clientTotalsHygiene.js';

export const CLIENT_TOTALS_AUTOMATION = 'client-totals-hygiene-v1';
export const REGISTRATION_EVIDENCE_VERSION_SQL = `SHA2(CONCAT_WS('|',s.id,UNIX_TIMESTAMP(s.updated_at),
  COALESCE(SHA2(s.payload_encrypted,256),''),COALESCE(SHA2(s.signer_email,256),''),
  COALESCE(SHA2(CAST(s.intake_data AS CHAR),256),'')),256)`;
const activeProvider = alias => `COALESCE(${alias}.is_active,1)=1 AND COALESCE(${alias}.is_archived,0)=0
  AND UPPER(COALESCE(${alias}.status,'')) NOT IN ('ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','DELETED')`;
export const ACTIVE_CLIENT_ASSIGNMENT_SQL = `(
  EXISTS(SELECT 1 FROM client_provider_assignments cp JOIN users p ON p.id=cp.provider_user_id
    WHERE cp.client_id=c.id AND cp.is_active=1 AND ${activeProvider('p')})
  OR (NOT EXISTS(SELECT 1 FROM client_provider_assignments cp WHERE cp.client_id=c.id)
    AND EXISTS(SELECT 1 FROM users p WHERE p.id=c.provider_id AND ${activeProvider('p')}))
  OR EXISTS(SELECT 1 FROM client_service_enrollments se JOIN users p ON p.id=se.provider_user_id
    WHERE se.client_id=c.id AND se.is_active=1 AND COALESCE(se.service_status,'active')='active' AND ${activeProvider('p')})
  OR EXISTS(SELECT 1 FROM appointment_participants ap JOIN appointments a ON a.id=ap.appointment_id
    JOIN users p ON p.id=a.provider_user_id WHERE ap.client_id=c.id AND a.end_at>=UTC_TIMESTAMP()
    AND a.status IN ('scheduled','confirmed','client_confirmed','in_progress','draft') AND ${activeProvider('p')})
  OR EXISTS(SELECT 1 FROM office_booking_plans bp WHERE bp.is_active=1
    AND (bp.active_until_date IS NULL OR bp.active_until_date>=UTC_DATE())
    AND CAST(JSON_UNQUOTE(JSON_EXTRACT(bp.session_context_json,'$.clientId')) AS UNSIGNED)=c.id)
  OR EXISTS(SELECT 1 FROM skills_group_clients gc JOIN skills_groups sg ON sg.id=gc.skills_group_id
    JOIN skills_group_providers gp ON gp.skills_group_id=sg.id JOIN users p ON p.id=gp.provider_user_id
    WHERE gc.client_id=c.id AND (sg.end_date IS NULL OR sg.end_date>=UTC_DATE()) AND ${activeProvider('p')})
)`;

export const HYGIENE_CLIENTS_SQL = `SELECT c.id,c.agency_id,c.organization_id,c.status,c.client_status_id,
  c.is_demo,c.created_via_dev_fill,c.created_at,c.updated_at,c.submission_date,c.last_activity_at,
  c.services_started_at,c.first_service_at,c.compliance_archived_at,cs.status_key AS client_status_key,
  o.name AS organization_name,o.slug AS organization_slug,
  EXISTS(SELECT 1 FROM client_organization_assignments co JOIN agencies school ON school.id=co.organization_id
    WHERE co.client_id=c.id AND LOWER(CONCAT(school.name,' ',school.slug)) REGEXP '(^|[^a-z])columbia([^a-z]|$)') AS has_columbia_affiliation,
  ${ACTIVE_CLIENT_ASSIGNMENT_SQL} AS has_active_assignment
  FROM clients c LEFT JOIN client_statuses cs ON cs.id=c.client_status_id
  LEFT JOIN agencies o ON o.id=c.organization_id WHERE c.agency_id=?`;

// UNION deduplicates a child's primary and sibling links. Every child on a
// registration containing a reserved mailbox is a test, even if their own
// guardian email happens to be different.
export const HYGIENE_REGISTRATIONS_SQL = `SELECT s.id,s.client_id AS primary_client_id,links.client_id,
  ${REGISTRATION_EVIDENCE_VERSION_SQL} AS evidence_version,
  s.signer_email,s.intake_data,s.payload_encrypted,s.payload_iv_b64,s.payload_auth_tag_b64,s.payload_key_id,
  COALESCE(s.submitted_at,s.created_at) AS activity_at FROM intake_submissions s JOIN (
    SELECT id AS submission_id,client_id FROM intake_submissions WHERE client_id IS NOT NULL
    UNION SELECT intake_submission_id,client_id FROM intake_submission_clients WHERE client_id IS NOT NULL
  ) links ON links.submission_id=s.id JOIN clients c ON c.id=links.client_id WHERE c.agency_id=?`;

export const HYGIENE_CONTACTS_SQL = `SELECT cg.client_id,
  CONVERT(CONCAT('guardian:',cg.id) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS evidence_key,
  SHA2(CONCAT_WS('|',cg.id,COALESCE(SHA2(u.email,256),''),COALESCE(SHA2(u.personal_email,256),'')),256) COLLATE utf8mb4_unicode_ci AS evidence_version,
  CONVERT(u.email USING utf8mb4) COLLATE utf8mb4_unicode_ci AS email,
  CONVERT(u.personal_email USING utf8mb4) COLLATE utf8mb4_unicode_ci AS personal_email
  FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id
  JOIN clients c ON c.id=cg.client_id WHERE c.agency_id=?
  UNION ALL SELECT ca.client_id,
    CONVERT(CONCAT('contact:',ca.id) USING utf8mb4) COLLATE utf8mb4_unicode_ci,
    SHA2(CONCAT_WS('|',ca.id,COALESCE(SHA2(ac.email,256),'')),256) COLLATE utf8mb4_unicode_ci,
    CONVERT(ac.email USING utf8mb4) COLLATE utf8mb4_unicode_ci,NULL FROM client_contact_affiliations ca
    JOIN agency_contacts ac ON ac.id=ca.agency_contact_id JOIN clients c ON c.id=ca.client_id WHERE c.agency_id=?`;

export const HYGIENE_ACTIVITY_SQL = `SELECT n.client_id,MAX(n.created_at) AS activity_at
  FROM client_notes n JOIN clients c ON c.id=n.client_id WHERE c.agency_id=? GROUP BY n.client_id
  UNION ALL SELECT n.client_id,MAX(n.updated_at) FROM client_daily_notes n
    JOIN clients c ON c.id=n.client_id WHERE c.agency_id=? GROUP BY n.client_id
  UNION ALL SELECT p.client_id,MAX(a.start_at) FROM appointment_participants p
    JOIN appointments a ON a.id=p.appointment_id JOIN clients c ON c.id=p.client_id
    WHERE c.agency_id=? AND a.start_at<=UTC_TIMESTAMP()
      AND a.status NOT IN ('cancelled','canceled','canceled_by_client','canceled_by_organization','voided') GROUP BY p.client_id
  UNION ALL SELECT d.client_id,MAX(d.uploaded_at) FROM client_phi_documents d
    JOIN clients c ON c.id=d.client_id WHERE c.agency_id=? GROUP BY d.client_id
  UNION ALL SELECT e.client_id,MAX(e.end_at) FROM office_events e
    JOIN clients c ON c.id=e.client_id WHERE c.agency_id=? AND e.status<>'CANCELLED' GROUP BY e.client_id
  UNION ALL SELECT e.client_id,MAX(e.end_at) FROM provider_schedule_events e
    JOIN clients c ON c.id=e.client_id WHERE c.agency_id=? AND e.status='ACTIVE' GROUP BY e.client_id`;

export const HYGIENE_CLINICAL_ACTIVITY_SQL = `SELECT client_id,MAX(GREATEST(created_at,updated_at,
  COALESCE(LEAST(scheduled_start_at,UTC_TIMESTAMP()),created_at))) AS activity_at
  FROM clinical_sessions WHERE agency_id=? AND encounter_status NOT IN ('cancelled','canceled','voided') GROUP BY client_id
  UNION ALL SELECT client_id,MAX(updated_at) FROM clinical_notes WHERE agency_id=? AND is_deleted=0 GROUP BY client_id`;

export function buildClientTotalsHygienePlan({ clients, registrations, contacts, activities }, { now = new Date(), decrypt = decryptIntakeSubmissionRow } = {}) {
  const examples = new Set();
  const latest = new Map();
  const addActivity = (id, value) => {
    if (!value) return;
    const date = new Date(value);
    if (Number.isFinite(date.getTime()) && (!latest.has(Number(id)) || date > latest.get(Number(id)))) latest.set(Number(id), date);
  };
  for (const row of clients) for (const field of ['created_at','last_activity_at','services_started_at','first_service_at']) addActivity(row.id,row[field]);
  for (const row of activities) addActivity(row.client_id,row.activity_at);
  const decoded = new Map();
  for (const row of registrations) {
    if (!decoded.has(row.id)) {
      // Check both representations during an encryption backfill. Never write
      // decrypted registration contents or addresses into plans or audit logs.
      const encryptedOnly = { ...row, signer_email:null, intake_data:null };
      const payload = row.payload_encrypted ? decrypt(encryptedOnly) : null;
      decoded.set(row.id, hasExampleRegistrationEmail([row.signer_email,row.intake_data,payload?.signer_email,payload?.intake_data]));
    }
    if (decoded.get(row.id)) examples.add(Number(row.client_id));
    addActivity(row.client_id,row.activity_at);
  }
  for (const row of contacts) if (hasExampleRegistrationEmail([row.email,row.personal_email])) examples.add(Number(row.client_id));
  const changes = [];
  for (const client of clients) {
    const classification = classifyClientTotals(client,{registrationHasExampleEmail:examples.has(Number(client.id)),lastActivityAt:latest.get(Number(client.id)),now});
    if (classification) changes.push({clientId:Number(client.id),agencyId:Number(client.agency_id),...classification,
      expectedUpdatedAt:client.updated_at,previousDemo:Number(client.is_demo)||0,previousStatus:client.status,
      previousStatusId:client.client_status_id,lastActivityAt:latest.get(Number(client.id))?.toISOString() || null,
      registrationEvidence:registrations.filter(row=>Number(row.client_id)===Number(client.id)).map(row=>({id:row.id,version:row.evidence_version})),
      contactEvidence:contacts.filter(row=>Number(row.client_id)===Number(client.id)).map(row=>({key:row.evidence_key,version:row.evidence_version}))});
  }
  return { automationIdentity:CLIENT_TOTALS_AUTOMATION,asOf:now.toISOString(),changes,
    summary:{scanned:clients.length,demo:changes.filter(c=>c.action==='demo').length,inactive:changes.filter(c=>c.action==='inactive').length} };
}

export async function loadClientTotalsHygieneEvidence(db, clinicalDb, agencyId, {clientId=null}={}) {
  const scoped=(sql,clinical=false)=>{
    const pattern=clinical?'WHERE agency_id=?':'WHERE c.agency_id=?';
    const count=sql.split(pattern).length-1;
    return [clientId?sql.replaceAll(pattern,`${pattern} AND ${clinical?'client_id':'c.id'}=?`):sql,
      Array.from({length:count},()=>clientId?[agencyId,clientId]:[agencyId]).flat()];
  };
  const results=await Promise.allSettled([
    db.execute(...scoped(HYGIENE_CLIENTS_SQL)),db.execute(...scoped(HYGIENE_REGISTRATIONS_SQL)),
    db.execute(...scoped(HYGIENE_CONTACTS_SQL)),db.execute(...scoped(HYGIENE_ACTIVITY_SQL)),
    clinicalDb.execute(...scoped(HYGIENE_CLINICAL_ACTIVITY_SQL,true))
  ]);
  // Missing or unreadable evidence must stop inactivation, never look like an
  // empty history. Await every query before releasing a connection.
  const failed=results.find(result=>result.status==='rejected');
  if(failed)throw failed.reason;
  const rows=results.map(result=>result.value[0]);
  return {clients:rows[0],registrations:rows[1],contacts:rows[2],activities:[...rows[3],...rows[4]]};
}

async function recordHygieneChange(db, client, change, identity) {
  const note=`Automation ${identity}: ${change.reason}. Referral history and original audit records retained.`;
  let statusId=null;
  if(change.action==='inactive') {
    const [[status]]=await db.execute("SELECT id FROM client_statuses WHERE agency_id=? AND status_key='inactive' AND is_active=1 ORDER BY id LIMIT 1",[client.agency_id]);
    if(!status)throw new Error('Configure the inactive client status before applying inactivity rules');
    statusId=status.id;
  }
  await db.execute(`INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES(?,NULL,?,?)`,[
    'automation_client_totals_classified',client.agency_id,JSON.stringify({actor_type:'automation',automation_identity:identity,
      clientId:client.id,reason:change.reason,before:{is_demo:client.is_demo,status:client.status,clientStatusId:client.client_status_id},
      after:change.action==='demo'?{is_demo:1}:{status:'ARCHIVED',clientStatusId:statusId},lastActivityAt:change.lastActivityAt||null})]);
  const transitions=change.action==='demo'?[['is_demo',client.is_demo,1]]
    :[['status',client.status,'ARCHIVED'],['client_status_id',client.client_status_id,statusId]];
  for(const [field,from,to] of transitions)await db.execute(`INSERT INTO client_status_history
    (client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES(?,NULL,?,?,?,?)`,
    [client.id,field,String(from??''),String(to),note]);
  if(change.action==='demo')await db.execute('UPDATE clients SET is_demo=1,updated_by_user_id=NULL WHERE id=?',[client.id]);
  // This rule has already established that no active care is assigned. Keep
  // former assignments and referrals intact; no termination, cancellation or
  // consent workflow is implied by automatic inactivity.
  else await db.execute("UPDATE clients SET client_status_id=?,status='ARCHIVED',updated_by_user_id=NULL WHERE id=?",[statusId,client.id]);
}

/** Immediate classification for newly saved primary or sibling registrations.
 * This never inactivates clients and never clears an existing demo flag. */
export async function markIntakeRegistrationDemos(submissionId,{db,identity=CLIENT_TOTALS_AUTOMATION}={}) {
  if(!db||!Number.isSafeInteger(Number(submissionId))||Number(submissionId)<1)throw new Error('A saved registration is required');
  const connection=await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows]=await connection.execute(`SELECT s.id,s.signer_email,s.intake_data,s.payload_encrypted,
      s.payload_iv_b64,s.payload_auth_tag_b64,s.payload_key_id FROM intake_submissions s WHERE s.id=? FOR UPDATE`,[submissionId]);
    if(!rows.length){await connection.commit();return {demo:0};}
    const row=rows[0];
    const payload=row.payload_encrypted?decryptIntakeSubmissionRow({...row,signer_email:null,intake_data:null}):null;
    const example=hasExampleRegistrationEmail([row.signer_email,row.intake_data,payload?.signer_email,payload?.intake_data]);
    const [clients]=await connection.execute(`${HYGIENE_CLIENTS_SQL.replace('WHERE c.agency_id=?',`WHERE c.id IN (
      SELECT client_id FROM intake_submissions WHERE id=? UNION SELECT client_id FROM intake_submission_clients WHERE intake_submission_id=?)`)} FOR UPDATE`,[submissionId,submissionId]);
    let demo=0;
    for(const client of clients) {
      const classification=classifyClientTotals(client,{registrationHasExampleEmail:example,now:new Date()});
      if(classification?.action!=='demo')continue;
      await recordHygieneChange(connection,client,classification,identity);demo++;
    }
    await connection.commit();return {demo};
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
}

/** ITSCO worker. Opt-in deployment configuration supplies its automation
 * identity. Revalidate evidence under the same locks used by scheduling. */
export async function reconcileClientTotals({db,clinicalDb,identity,agencyId=2,now=new Date()}={}) {
  if(Number(agencyId)!==2||!identity||identity!==CLIENT_TOTALS_AUTOMATION)throw new Error('Authorized ITSCO totals automation is required');
  const initial=buildClientTotalsHygienePlan(await loadClientTotalsHygieneEvidence(db,clinicalDb,agencyId),{now});
  const result={demo:0,inactive:0,changedSincePreview:0};
  // Exclude test records even when a real client's roster closure needs review.
  const proposedChanges=[...initial.changes].sort((a,b)=>(a.action==='demo'?0:1)-(b.action==='demo'?0:1)||a.clientId-b.clientId);
  for(const proposed of proposedChanges) {
    const connection=await db.getConnection();let locked=false;
    try {
      const [[lock]]=await connection.execute('SELECT GET_LOCK(?,8) acquired',[`client-schedule:${proposed.clientId}`]);
      locked=Number(lock?.acquired)===1;
      if(!locked)throw new Error('Scheduling is changing; retry totals reconciliation');
      await connection.beginTransaction();
      await connection.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[proposed.clientId,agencyId]);
      await connection.execute('SELECT id FROM client_provider_assignments WHERE client_id=? FOR UPDATE',[proposed.clientId]);
      await connection.execute('SELECT id FROM client_service_enrollments WHERE client_id=? FOR UPDATE',[proposed.clientId]);
      const evidence=await loadClientTotalsHygieneEvidence(connection,clinicalDb,agencyId,{clientId:proposed.clientId});
      const fresh=buildClientTotalsHygienePlan(evidence,{now});
      const change=fresh.changes.find(row=>row.clientId===proposed.clientId);
      const client=evidence.clients.find(row=>Number(row.id)===proposed.clientId);
      if(!change||change.action!==proposed.action){result.changedSincePreview++;await connection.commit();continue;}
      await recordHygieneChange(connection,client,change,identity);
      await connection.commit();result[change.action]++;
    }catch(error){await connection.rollback();throw error;}
    finally {
      if(locked)await connection.execute('SELECT RELEASE_LOCK(?)',[`client-schedule:${proposed.clientId}`]).catch(()=>{});
      connection.release();
    }
  }
  return result;
}

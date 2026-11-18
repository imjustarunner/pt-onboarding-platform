import pool from '../config/database.js';
import { TRANSITION_PRACTICES } from '../content/transitionWeek.js';
import { rankPayrollProviders, PAYROLL_RANKING_SOURCE } from '../utils/transitionPayrollRanking.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export async function transitionPractices(actor, db = pool) {
  if (!['admin','super_admin'].includes(actor?.role)) fail(403, 'Practice administrator access is required.');
  const [rows] = await db.execute(`SELECT ua.agency_id FROM user_agencies ua JOIN users u ON u.id=ua.user_id
    WHERE ua.user_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
    AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED')
    AND ua.agency_id IN (2,6,377)`, [actor.id]);
  return [2,6,377].filter(id => rows.some(row => Number(row.agency_id) === id)).map(id => TRANSITION_PRACTICES.find(p => p.id === id));
}
export async function transitionStaff(agencyId, db = pool) {
  const [rows] = await db.execute(`SELECT DISTINCT u.id,CONCAT_WS(' ',COALESCE(NULLIF(TRIM(u.preferred_name),''),u.first_name),u.last_name) name,u.role,u.has_provider_access,ua.agency_role
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    WHERE ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
    AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING')
    AND u.role NOT IN ('client','client_guardian','guardian','parent','family_member','school_staff','school_support','school_admin','school','kiosk','prehire','candidate')
    ORDER BY name,u.id`, [agencyId]);
  return rows.map(row => ({ id: Number(row.id), name: row.name, role: row.role, agencyRole:row.agency_role||null, hasProviderAccess:Number(row.has_provider_access)===1 }));
}
export function isTransitionProvider(person) {
  const role=String(person.agencyRole||person.role||'').toLowerCase();
  // Transition eligibility is not app care/scheduling readiness. A provider can
  // need this migration precisely because app care access has not been enabled.
  if (['provider','provider_plus','intern','intern_plus','facilitator','qbha','supervisor','tutor'].includes(role)) return true;
  return person.hasProviderAccess===true && (!person.agencyRole || ['admin','super_admin'].includes(role));
}
export async function transitionWorkspaceData(agencyId, db = pool, now = new Date()) {
  const staff = await transitionStaff(agencyId, db);
  const providers = staff.filter(isTransitionProvider);
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const [periods] = await db.execute(`SELECT pp.id,DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
    DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,pp.status
    FROM payroll_periods pp WHERE pp.agency_id=? AND pp.period_end<? AND pp.status IN ('ran','posted','finalized')
    AND EXISTS (SELECT 1 FROM payroll_summaries ps WHERE ps.payroll_period_id=pp.id AND ps.agency_id=pp.agency_id)
    ORDER BY pp.period_end DESC,pp.id DESC LIMIT 3`, [agencyId,today]);
  let summaries=[],entries=[];
  if (periods.length) {
    const ids=periods.map(p=>Number(p.id)),marks=ids.map(()=>'?').join(',');
    [summaries]=await db.execute(`SELECT user_id,payroll_period_id,direct_hours,total_hours,tier_credits_current,total_units
      FROM payroll_summaries WHERE agency_id=? AND payroll_period_id IN (${marks})`,[agencyId,...ids]);
    // Only the latest import per period, with in-period services. Units are not
    // session counts (some codes use minutes). No client or compensation data.
    [entries]=await db.execute(`SELECT pir.user_id,COUNT(DISTINCT COALESCE(NULLIF(pir.row_fingerprint,''),CONCAT('row:',pir.id))) service_entries
      FROM payroll_import_rows pir JOIN payroll_periods pp ON pp.id=pir.payroll_period_id AND pp.agency_id=pir.agency_id
      WHERE pir.agency_id=? AND pir.payroll_period_id IN (${marks}) AND pir.user_id IS NOT NULL AND pir.unit_count>0
      AND pir.service_date BETWEEN pp.period_start AND pp.period_end
      AND pir.payroll_import_id=(SELECT pi.id FROM payroll_imports pi WHERE pi.agency_id=pir.agency_id AND pi.payroll_period_id=pir.payroll_period_id ORDER BY pi.created_at DESC,pi.id DESC LIMIT 1)
      GROUP BY pir.user_id`,[agencyId,...ids]);
  }
  const people=rankPayrollProviders(providers,summaries,entries);
  return {people,staff,payroll:{sourceType:PAYROLL_RANKING_SOURCE,periods:periods.map(p=>({...p,id:Number(p.id)})),
    excludedWithoutActivity:providers.length-people.length,
    description:periods.length?`Payroll workload from ${periods.length} completed pay periods: ${periods.map(p=>`${p.periodStart}–${p.periodEnd}`).join(', ')}`:'No completed payroll periods with calculated activity are available.'}};
}
export async function transitionWorkspaceRoster(agencyId, db = pool) {
  return (await transitionWorkspaceData(agencyId,db)).people;
}
export async function transitionClients(agencyId, providerId, db = pool) {
  if (!(await transitionStaff(agencyId, db)).some(p => p.id === Number(providerId))) fail(404, 'Choose an active employee in this practice.');
  const [rows] = await db.execute(`SELECT c.id,COALESCE(NULLIF(c.full_name,''),c.initials,CONCAT('Chart #',c.id)) name,c.status,
    (SELECT MIN(a.start_at) FROM appointments a JOIN appointment_participants ap ON ap.appointment_id=a.id
      WHERE ap.client_id=c.id AND a.agency_id=c.agency_id AND a.provider_user_id=? AND a.start_at>=UTC_TIMESTAMP()
      AND LOWER(COALESCE(a.status,'')) NOT REGEXP 'cancel|void|rescheduled') nextAppointmentAt
    FROM clients c WHERE c.agency_id=? AND (c.provider_id=? OR EXISTS (
      SELECT 1 FROM client_provider_assignments ca WHERE ca.client_id=c.id AND ca.provider_user_id=? AND ca.is_active=1))
    ORDER BY COALESCE(NULLIF(c.full_name,''),c.initials),c.id LIMIT 2001`, [providerId,agencyId,providerId,providerId]);
  if (rows.length > 2000) fail(409, 'This caseload needs a paginated records review. Open Client Management to review all charts.');
  return rows.map(row => ({ ...row, id: Number(row.id) }));
}
export async function assertTransitionClient(agencyId, providerId, clientId, db = pool) {
  const [[client]] = await db.execute(`SELECT c.id FROM clients c WHERE c.id=? AND c.agency_id=? AND
    (c.provider_id=? OR EXISTS (SELECT 1 FROM client_provider_assignments ca WHERE ca.client_id=c.id AND ca.provider_user_id=? AND ca.is_active=1))`, [clientId,agencyId,providerId,providerId]);
  if (!client) fail(404, 'This chart is not assigned to this employee in this practice.');
}
export async function transitionMeetings(agencyId, actorId, db = pool) {
  // Only meetings the manager actually hosts or attends. Agency membership alone
  // does not expose private staff meetings or their RSVP information.
  const [events] = await db.execute(`SELECT e.id,e.title,e.start_at,e.end_at,e.event_timezone,e.provider_id
    FROM provider_schedule_events e WHERE e.agency_id=? AND e.kind='TEAM_MEETING'
    AND COALESCE(e.meeting_subtype,'') <> 'interview' AND e.status='ACTIVE' AND e.end_at>UTC_TIMESTAMP() AND e.meeting_completed_at IS NULL
    AND (e.provider_id=? OR EXISTS (SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id=e.id AND a.user_id=?))
    ORDER BY e.start_at LIMIT 150`, [agencyId,actorId,actorId]);
  return events.map(row => ({ ...row, id: Number(row.id) }));
}
export async function assertTransitionMeeting(agencyId, actorId, eventId, db = pool) {
  const events = await transitionMeetings(agencyId, actorId, db);
  if (!events.some(e => e.id === eventId)) fail(403, 'Choose an upcoming meeting you host or attend in this practice.');
}
export async function transitionEmailRecipients(agencyId, selectedIds, db = pool) {
  const ids = [...new Set(String(selectedIds || '').split(',').map(Number))];
  const staff = await transitionStaff(agencyId, db);
  if (!ids.length || ids.length > 50 || ids.some(id=>!Number.isSafeInteger(id)||!staff.some(p=>p.id===id))) fail(400,'Choose up to 50 active employees in this practice.');
  const [users] = await db.execute(`SELECT id,first_name,last_name,email,work_email FROM users WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);
  const {resolveMeetingRecipient} = await import('./meetingRecipientIdentity.service.js');
  const recipients=[];
  for(const user of users){const identity=await resolveMeetingRecipient({agencyId,user});if(!identity.email)fail(409,'One selected employee needs a delivery email reviewed before drafting.');recipients.push({id:Number(user.id),name:staff.find(p=>p.id===Number(user.id)).name,email:identity.email});}
  if(recipients.length!==ids.length)fail(409,'The staff list changed. Refresh before drafting.');
  return recipients;
}

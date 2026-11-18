import pool from '../config/database.js';
import { TRANSITION_PRACTICES } from '../content/transitionWeek.js';
import { sessionBookingProviders } from './clientSessionBookingRollout.service.js';

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
  const [rows] = await db.execute(`SELECT DISTINCT u.id,CONCAT_WS(' ',COALESCE(NULLIF(TRIM(u.preferred_name),''),u.first_name),u.last_name) name,u.role
    FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    WHERE ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
    AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING')
    AND u.role NOT IN ('client','client_guardian','guardian','parent','family_member','school_staff','school_support','school_admin','school','kiosk','prehire','candidate')
    ORDER BY name,u.id`, [agencyId]);
  return rows.map(row => ({ id: Number(row.id), name: row.name, role: row.role }));
}
export async function transitionWorkspaceRoster(agencyId, db = pool) {
  const staff = await transitionStaff(agencyId, db);
  const providers = await sessionBookingProviders(agencyId, db);
  // Count canonical appointments once, never calendar mirrors or billing units.
  // These are suggestions: the previous EHR may contain sessions absent here.
  const [counts] = await db.execute(`SELECT provider_user_id,
    SUM(CASE WHEN start_at >= '2026-10-19 06:00:00' AND start_at < '2026-11-16 07:00:00' AND LOWER(status)='completed' THEN 1 ELSE 0 END) completed,
    SUM(CASE WHEN start_at >= '2026-11-16 07:00:00' AND start_at < '2026-11-23 07:00:00' AND LOWER(COALESCE(status,'')) NOT REGEXP 'cancel|void|rescheduled|no.show' THEN 1 ELSE 0 END) upcoming
    FROM appointments WHERE agency_id=? AND start_at >= '2026-10-19 06:00:00' AND start_at < '2026-11-23 07:00:00'
    GROUP BY provider_user_id`, [agencyId]);
  return staff.map(person => {
    const count = counts.find(row => Number(row.provider_user_id) === person.id);
    return { ...person, clientFacing: providers.some(p => p.id === person.id), appCompleted: Number(count?.completed || 0), appUpcoming: Number(count?.upcoming || 0) };
  });
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

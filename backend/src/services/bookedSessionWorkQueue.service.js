import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import NoteAidWorkQueueItem from '../models/NoteAidWorkQueueItem.model.js';
import ClinicalEligibilityService from './clinicalEligibility.service.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';

const roles = new Set(['provider','provider_plus','supervisor','intern','intern_plus','admin','super_admin','clinical_practice_assistant']);
const asDate = value => value instanceof Date ? value : new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(String(value)) ? value : `${String(value).replace(' ','T')}Z`);
export function bookedWorkItem(appointment, session, client) {
  const start = asDate(appointment.start_at), end = asDate(appointment.end_at);
  const timezone = appointment.source_timezone || session.source_timezone || 'UTC';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(start).map(p=>[p.type,p.value]));
  const code = String(appointment.service_code || '').toUpperCase();
  const addons = typeof appointment.addon_service_codes_json === 'string' ? JSON.parse(appointment.addon_service_codes_json) : appointment.addon_service_codes_json;
  return { clientKey:`booked_session_${session.id}`,agencyId:Number(appointment.agency_id),clientId:Number(session.client_id),
  clinicalSessionId:Number(session.id),appointmentId:Number(appointment.id),officeEventId:appointment.office_event_id || null,
  clientName:client.full_name || client.initials || `Client #${session.client_id}`,
  date:`${parts.year}-${parts.month}-${parts.day}`,timeLabel:start.toLocaleTimeString('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit'}),
  serviceCode:code,noteKind:['90791','H0031'].includes(code)?'intake':'progress',
  status:appointment.draft_id?'started':'not_started',draftId:appointment.draft_id || null,
  startedAt:appointment.draft_created_at ? asDate(appointment.draft_created_at).toISOString() : null,
  action:'Document booked session',sourceTimezone:timezone,scheduledStart:start.toISOString(),scheduledEnd:end.toISOString(),
  durationMinutes:Math.round((end-start)/60000),locationLabel:appointment.location_label || '',
  addonServiceCodes:Array.isArray(addons)?addons:[] };
}

// Materialize documentation tasks only. Attendance, notes, billing and appointment
// history stay unchanged. Only exact, saved appointment/session associations qualify.
export async function reconcileBookedSessionWork(user, {agencyId=null,db=pool,clinical=clinicalPool,queue=NoteAidWorkQueueItem,
  agencyAccess=ClinicalEligibilityService.ensureAgencyAccess.bind(ClinicalEligibilityService),clientAccess=resolveClientRecordAccess}={}) {
  if (!roles.has(user?.role) || !Number(user?.id)) return [];
  const [appointments] = await db.execute(`SELECT a.id,a.agency_id,a.provider_user_id,a.clinical_session_id,a.start_at,a.end_at,
    a.service_code,a.addon_service_codes_json,a.source_timezone,a.office_event_id,a.location_label,
    (SELECT d.id FROM clinical_note_drafts d WHERE d.user_id=a.provider_user_id AND d.clinical_session_id=a.clinical_session_id
      AND d.archived_at IS NULL ORDER BY d.updated_at DESC,d.id DESC LIMIT 1) AS draft_id,
    (SELECT d.created_at FROM clinical_note_drafts d WHERE d.user_id=a.provider_user_id AND d.clinical_session_id=a.clinical_session_id
      AND d.archived_at IS NULL ORDER BY d.updated_at DESC,d.id DESC LIMIT 1) AS draft_created_at
    FROM appointments a WHERE a.provider_user_id=? AND a.clinical_session_id IS NOT NULL
    AND a.end_at<=UTC_TIMESTAMP() AND a.status IN ('scheduled','confirmed','checked_in','completed')
    ${agencyId?'AND a.agency_id=?':''}
    AND NOT EXISTS (SELECT 1 FROM note_aid_work_queue_items q WHERE q.user_id=a.provider_user_id AND q.clinical_session_id=a.clinical_session_id)
    ORDER BY a.start_at,a.id`,agencyId?[user.id,agencyId]:[user.id]);
  if (!appointments.length) return [];
  const sessionIds=[...new Set(appointments.map(a=>Number(a.clinical_session_id)))];
  const [sessions] = await clinical.execute(`SELECT s.id,s.agency_id,s.client_id,s.appointment_id,s.provider_user_id,s.source_timezone
    FROM clinical_sessions s WHERE s.provider_user_id=? AND s.id IN (${sessionIds.map(()=>'?').join(',')})
    AND NOT EXISTS (SELECT 1 FROM clinical_notes n WHERE n.clinical_session_id=s.id AND n.is_deleted=0 AND n.provider_signed_at IS NOT NULL)`,[user.id,...sessionIds]);
  const byId=new Map(sessions.map(s=>[Number(s.id),s])), agencies=new Map(), clients=new Map(), added=[];
  for (const appointment of appointments) {
    const session=byId.get(Number(appointment.clinical_session_id));
    if (!session || Number(session.appointment_id)!==Number(appointment.id) || Number(session.agency_id)!==Number(appointment.agency_id)) continue;
    if (!agencies.has(appointment.agency_id)) {
      try { await agencyAccess({reqUser:user,agencyId:appointment.agency_id});agencies.set(appointment.agency_id,true); }
      catch(error) { if(error.status===403){agencies.set(appointment.agency_id,false);}else throw error; }
    }
    if (!agencies.get(appointment.agency_id)) continue;
    if (!clients.has(session.client_id)) clients.set(session.client_id,await clientAccess({userId:user.id,role:user.role,clientId:session.client_id}));
    const access=clients.get(session.client_id);
    if (!access?.ok || Number(access.client?.agency_id)!==Number(appointment.agency_id)) continue;
    const item = await queue.createIfMissingForUser(user.id,bookedWorkItem(appointment,session,access.client));
    if (item) added.push(item);
  }
  return added;
}

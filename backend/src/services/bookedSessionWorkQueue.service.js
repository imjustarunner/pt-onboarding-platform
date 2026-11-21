import pool from '../config/database.js';
import { visibleClinicalWork } from './clinicalWorkArchiveRead.service.js';
import clinicalPool from '../config/clinicalDatabase.js';
import NoteAidWorkQueueItem from '../models/NoteAidWorkQueueItem.model.js';
import ClinicalEligibilityService from './clinicalEligibility.service.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import { listClientAgencyMembershipIds } from '../utils/noteAidClientAgency.js';
import { SESSION_DOCUMENTATION_LEAD_MS } from '../utils/sessionDocumentationTiming.js';

const roles = new Set(['provider','provider_plus','supervisor','intern','intern_plus','admin','super_admin','clinical_practice_assistant']);
const asDate = value => value instanceof Date ? value : new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(String(value)) ? value : `${String(value).replace(' ','T')}Z`);
function jsonObject(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}') || {}; } catch { return {}; }
}
export function bookedWorkItem(appointment, session, client) {
  const start = asDate(appointment.start_at), end = asDate(appointment.end_at);
  const timezone = appointment.source_timezone || session.source_timezone || 'UTC';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(start).map(p=>[p.type,p.value]));
  const code = String(appointment.service_code || session.service_code || '').toUpperCase();
  const addons = typeof appointment.addon_service_codes_json === 'string' ? jsonObject(appointment.addon_service_codes_json) : appointment.addon_service_codes_json;
  return { clientKey:`booked_session_${session.id}`,agencyId:Number(appointment.agency_id),clientId:Number(session.client_id),
  clinicalSessionId:Number(session.id),appointmentId:Number(appointment.id) || null,officeEventId:appointment.office_event_id || session.office_event_id || null,
  clientName:client.full_name || client.initials || `Client #${session.client_id}`,
  date:`${parts.year}-${parts.month}-${parts.day}`,timeLabel:start.toLocaleTimeString('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit'}),
  serviceCode:code,noteKind:['90791','H0031'].includes(code)?'intake':'progress',
  status:appointment.draft_id?'started':'not_started',draftId:appointment.draft_id || null,
  startedAt:appointment.draft_created_at ? asDate(appointment.draft_created_at).toISOString() : null,
  action:'Document booked session',sourceTimezone:timezone,scheduledStart:start.toISOString(),scheduledEnd:Number.isFinite(+end) ? end.toISOString() : null,
  durationMinutes:Number.isFinite(+end) && end > start ? Math.round((end-start)/60000) : Number(session.duration_minutes) || null,locationLabel:appointment.location_label || session.location_label
    || (['TELEHEALTH','VIRTUAL','VIDEO'].includes(String(appointment.modality || '').toUpperCase()) ? 'Telehealth' : ''),
  addonServiceCodes:Array.isArray(addons)?addons:[] };
}

// Materialize documentation tasks only. Attendance, notes, billing and appointment
// history stay unchanged. Only exact, saved appointment/session associations qualify.
export async function reconcileBookedSessionWork(user, {agencyId=null,db=pool,clinical=clinicalPool,queue=NoteAidWorkQueueItem,
  agencyAccess=ClinicalEligibilityService.ensureAgencyAccess.bind(ClinicalEligibilityService),clientAccess=resolveClientRecordAccess,clientAgencies=listClientAgencyMembershipIds,now=new Date()}={}) {
  if (!roles.has(user?.role) || !Number(user?.id)) return [];
  const eligibleThrough = new Date(+now + SESSION_DOCUMENTATION_LEAD_MS);
  const [appointments] = await db.execute(`SELECT a.id,a.agency_id,a.provider_user_id,a.clinical_session_id,a.start_at,a.end_at,
    a.service_code,a.addon_service_codes_json,a.source_timezone,a.office_event_id,a.location_label,a.modality,
    (SELECT d.id FROM clinical_note_drafts d WHERE d.user_id=a.provider_user_id AND d.clinical_session_id=a.clinical_session_id
      AND d.archived_at IS NULL ORDER BY d.updated_at DESC,d.id DESC LIMIT 1) AS draft_id,
    (SELECT d.created_at FROM clinical_note_drafts d WHERE d.user_id=a.provider_user_id AND d.clinical_session_id=a.clinical_session_id
      AND d.archived_at IS NULL ORDER BY d.updated_at DESC,d.id DESC LIMIT 1) AS draft_created_at
    FROM appointments a WHERE a.provider_user_id=? AND a.clinical_session_id IS NOT NULL
    AND a.start_at<=? AND a.status IN ('scheduled','confirmed','client_confirmed','checked_in','completed')
    ${agencyId?'AND a.agency_id=?':''}
    AND NOT EXISTS (SELECT 1 FROM note_aid_work_queue_items q WHERE q.user_id=a.provider_user_id AND q.clinical_session_id=a.clinical_session_id)
    ORDER BY a.start_at,a.id`,agencyId?[user.id,eligibleThrough,agencyId]:[user.id,eligibleThrough]);
  const sessionIds=[...new Set(appointments.map(a=>Number(a.clinical_session_id)))];
  const [sessions] = sessionIds.length ? await clinical.execute(`SELECT s.id,s.agency_id,s.client_id,s.appointment_id,s.provider_user_id,s.source_timezone,s.service_code
    FROM clinical_sessions s WHERE s.provider_user_id=? AND s.id IN (${sessionIds.map(()=>'?').join(',')})
    AND NOT EXISTS (SELECT 1 FROM clinical_notes n WHERE n.clinical_session_id=s.id AND n.is_deleted=0 AND n.provider_signed_at IS NOT NULL)`,[user.id,...sessionIds]) : [[]];
  const byId=new Map(sessions.map(s=>[Number(s.id),s])), agencies=new Map(), clients=new Map(), added=[];
  const authorizedClient = async (session, ownerAgencyId) => {
    if (!agencies.has(ownerAgencyId)) {
      try { await agencyAccess({reqUser:user,agencyId:ownerAgencyId});agencies.set(ownerAgencyId,true); }
      catch(error) { if(error.status===403)agencies.set(ownerAgencyId,false);else throw error; }
    }
    if (!agencies.get(ownerAgencyId)) return null;
    if (!clients.has(session.client_id)) clients.set(session.client_id,await clientAccess({userId:user.id,role:user.role,clientId:session.client_id}));
    const access=clients.get(session.client_id);
    if (!access?.ok) return null;
    if (Number(access.client?.agency_id)!==Number(ownerAgencyId)
      && !(await clientAgencies(session.client_id)).map(Number).includes(Number(ownerAgencyId))) return null;
    return access.client;
  };
  for (const appointment of await visibleClinicalWork(appointments, { db, kind: 'appointment' })) {
    const session=byId.get(Number(appointment.clinical_session_id));
    if (!session || Number(appointment.provider_user_id)!==Number(user.id) || Number(session.provider_user_id)!==Number(user.id)
      || Number(session.appointment_id)!==Number(appointment.id) || Number(session.agency_id)!==Number(appointment.agency_id)) continue;
    if (!(asDate(appointment.start_at) <= eligibleThrough)) continue;
    const client = await authorizedClient(session,appointment.agency_id);
    if (!client) continue;
    const item = await queue.createIfMissingForUser(user.id,bookedWorkItem(appointment,session,client));
    if (item) added.push(item);
  }

  // Legacy office bookings can have an exact clinical-session/event link without
  // a newer appointments row. They are still the clinician's documentation work.
  const [officeSessions] = await clinical.execute(`SELECT s.id,s.agency_id,s.client_id,s.office_event_id,s.provider_user_id,
    s.source_timezone,s.service_code,s.scheduled_start_at,s.scheduled_end_at,s.duration_minutes,s.is_telehealth
    FROM clinical_sessions s WHERE s.provider_user_id=? AND s.appointment_id IS NULL AND s.office_event_id IS NOT NULL
      AND s.scheduled_start_at<=?
      ${agencyId?'AND s.agency_id=?':''}
      AND COALESCE(s.encounter_status,'scheduled') NOT IN ('cancelled','canceled','voided','no_show')
      AND NOT EXISTS (SELECT 1 FROM clinical_notes n WHERE n.clinical_session_id=s.id AND n.is_deleted=0 AND n.provider_signed_at IS NOT NULL)
    ORDER BY s.scheduled_start_at,s.id`,agencyId?[user.id,eligibleThrough,agencyId]:[user.id,eligibleThrough]);
  const candidates = (await visibleClinicalWork(officeSessions, { db, kind: 'clinical_session' })).filter(session => Number(session.office_event_id)>0 && Number(session.provider_user_id)===Number(user.id));
  if (!candidates.length) return added;
  const eventIds = [...new Set(candidates.map(session => Number(session.office_event_id)))];
  const [events] = await db.execute(`SELECT e.id,e.start_at,e.end_at,e.client_id,e.clinical_session_id,e.booked_provider_id,e.assigned_provider_id,
    e.status,e.status_outcome,e.session_context_json,l.timezone AS location_timezone,l.name AS location_label
    FROM office_events e JOIN office_locations l ON l.id=e.office_location_id
    WHERE e.id IN (${eventIds.map(()=>'?').join(',')})`,eventIds);
  const ids = candidates.map(session => Number(session.id));
  const [drafts] = await db.execute(`SELECT id,clinical_session_id,created_at FROM clinical_note_drafts
    WHERE user_id=? AND archived_at IS NULL AND clinical_session_id IN (${ids.map(()=>'?').join(',')})
    ORDER BY updated_at DESC,id DESC`,[user.id,...ids]);
  const eventById = new Map(events.map(event => [Number(event.id),event]));
  for (const session of candidates) {
    const event = eventById.get(Number(session.office_event_id));
    if (!event || Number(event.booked_provider_id || event.assigned_provider_id)!==Number(user.id)
      || (event.client_id && Number(event.client_id)!==Number(session.client_id))
      || (event.clinical_session_id && Number(event.clinical_session_id)!==Number(session.id))
      || ['CANCELLED','CANCELED','VOIDED','NO_SHOW'].includes(String(event.status||'').toUpperCase())
      || ['CANCELLED','CANCELED','VOIDED','NO_SHOW'].includes(String(event.status_outcome||'').toUpperCase())) continue;
    const context = jsonObject(event.session_context_json);
    const timezone = session.source_timezone || context.sourceTimezone || event.location_timezone || 'UTC';
    if (!(asDate(event.start_at || session.scheduled_start_at) <= eligibleThrough)) continue;
    const client = await authorizedClient(session,session.agency_id);
    if (!client) continue;
    const draft = drafts.find(row => Number(row.clinical_session_id)===Number(session.id));
    const item = await queue.createIfMissingForUser(user.id,bookedWorkItem({
      agency_id:session.agency_id,office_event_id:event.id,start_at:event.start_at || session.scheduled_start_at,
      end_at:event.end_at || session.scheduled_end_at,source_timezone:timezone,service_code:session.service_code,
      location_label:event.location_label,modality:session.is_telehealth?'TELEHEALTH':'IN_PERSON',
      addon_service_codes_json:context.addonServiceCodes || [],draft_id:draft?.id,draft_created_at:draft?.created_at
    },session,client));
    if (item) added.push(item);
  }
  return added;
}

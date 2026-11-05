import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import staffTools from './appointmentStaffTools.service.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';
import ClinicalEligibilityService from './clinicalEligibility.service.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { listClientDiagnosisAlerts } from './clinicalDiagnosisPolicy.service.js';

const fail = (status, message, code = 'APPOINTMENT_ALERT_REVIEW_REQUIRED') => Object.assign(new Error(message), { status, code });
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
export function appointmentDate(value, timezone = 'America/Denver') {
  const date = value instanceof Date ? value : new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(String(value)) ? value : `${String(value).replace(' ', 'T')}Z`);
  if (!Number.isFinite(+date)) return null;
  try { return new Intl.DateTimeFormat('en-CA', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
  catch { return null; }
}
export function createClinicalAppointmentAlerts({ db=pool, clinical=clinicalPool, tools=staffTools, clientAccess=resolveClientRecordAccess, agencyAccess=ClinicalEligibilityService.ensureAgencyAccess.bind(ClinicalEligibilityService), decrypt=maybeDecryptNotePayload, diagnosisAlerts=listClientDiagnosisAlerts }={}) {
  async function context(user, input={}) {
    const agencyId=positive(input.agencyId), clientId=positive(input.clientId);
    if (!agencyId || !clientId) throw fail(400,'Choose an agency and client before reviewing session alerts.');
    await agencyAccess({reqUser:user,agencyId});
    const access=await clientAccess({userId:user.id,role:user.role,clientId});
    if(!access.ok) throw fail(403,'Client record access is required to review these alerts.');
    let session=null;
    if(positive(input.clinicalSessionId)) {
      const [[row]]=await clinical.execute('SELECT id,agency_id,client_id,provider_user_id,appointment_id,office_event_id,scheduled_start_at,source_timezone,metadata_json FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=? LIMIT 1',[Number(input.clinicalSessionId),agencyId,clientId]);
      if(!row) throw fail(404,'Clinical session not found for this client.');
      session=row;
    }
    const date=String(input.dateOfService || (session?.scheduled_start_at ? appointmentDate(session.scheduled_start_at,session.source_timezone || 'America/Denver') : '')).slice(0,10);
    const appointmentId=positive(session?.appointment_id || input.appointmentId),officeEventId=positive(session?.office_event_id || input.officeEventId);
    const match=[],args=[agencyId,clientId];
    if(appointmentId){match.push('a.id=?');args.push(appointmentId);}
    if(officeEventId){match.push('a.office_event_id=?');args.push(officeEventId);}
    if(session?.id){match.push('a.clinical_session_id=?');args.push(session.id);}
    const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date));
    let sessionMetadata={};try{sessionMetadata=typeof session?.metadata_json==='string'?JSON.parse(session.metadata_json):session?.metadata_json || {};}catch{sessionMetadata={};}
    // Once the actual encounter is known, alerts on other same-day visits do not
    // belong to this note. A standalone note-aid draft can still use its DOS.
    const allowDateFallback=!appointmentId && !officeEventId && (!session?.id || sessionMetadata.source==='note_aid_draft');
    if(validDate && allowDateFallback){match.push('(a.start_at >= ? AND a.start_at < ?)');args.push(new Date(Date.parse(date)-14*3600000),new Date(Date.parse(date)+38*3600000));}
    if(!match.length)return {agencyId,clientId,appointments:[],diagnosisAlerts:await diagnosisAlerts({agencyId,clientId})};
    const [rows]=await db.execute(`SELECT DISTINCT a.id,a.provider_user_id,a.start_at,a.source_timezone,a.office_event_id,a.clinical_session_id,s.alert_text,s.revision,s.updated_at,
      ack.acknowledged_at FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id
      JOIN appointment_staff_alerts s ON s.appointment_id=a.id AND s.alert_text IS NOT NULL
      LEFT JOIN appointment_staff_alert_acknowledgements ack ON ack.appointment_id=a.id AND ack.revision=s.revision AND ack.acknowledged_by_user_id=?
      WHERE a.agency_id=? AND p.client_id=? AND (${match.join(' OR ')})`,[user.id,...args]);
    const appointments=[];
    for(const row of rows){
      const explicit=Number(row.id)===appointmentId || (officeEventId && Number(row.office_event_id)===officeEventId) || (session?.id && Number(row.clinical_session_id)===Number(session.id));
      if(!explicit && (!allowDateFallback || appointmentDate(row.start_at,row.source_timezone || 'America/Denver')!==date))continue;
      // Never expose another provider's private alert merely because the client is shared.
      try { await tools.get(user,Number(row.id)); } catch(error){if(error.status===403)continue;throw error;}
      appointments.push({appointmentId:Number(row.id),text:decrypt(row.alert_text),revision:Number(row.revision),updatedAt:row.updated_at,acknowledgedAt:row.acknowledged_at || null,needsAcknowledgement:!row.acknowledged_at});
    }
    return {agencyId,clientId,appointments,diagnosisAlerts:await diagnosisAlerts({agencyId,clientId})};
  }
  async function assertReviewed(user,input) {
    if(!positive(input?.clientId))return;
    const review=await context(user,input);
    if(review.appointments.some(alert=>alert.needsAcknowledgement)) throw Object.assign(fail(409,'Review and acknowledge the schedule clip before starting or continuing this note.'),{appointmentAlerts:review.appointments});
    return review;
  }
  async function acknowledge(user,appointmentId,revision) {
    await tools.get(user,positive(appointmentId));
    if(!Number.isSafeInteger(Number(revision)) || Number(revision)<1)throw fail(400,'The alert revision being acknowledged is required.');
    const conn=await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('SELECT id FROM appointments WHERE id=? FOR UPDATE',[appointmentId]);
      const [[current]]=await conn.execute('SELECT revision,alert_text FROM appointment_staff_alerts WHERE appointment_id=? FOR UPDATE',[appointmentId]);
      if(!current?.alert_text || Number(current.revision)!==Number(revision))throw fail(409,'This schedule clip changed. Reload and review its current text before acknowledging.');
      await conn.execute('INSERT IGNORE INTO appointment_staff_alert_acknowledgements (appointment_id,revision,acknowledged_by_user_id) VALUES (?,?,?)',[appointmentId,Number(revision),user.id]);
      await conn.commit();
      return {appointmentId,revision:Number(revision),acknowledged:true};
    }catch(error){await conn.rollback();throw error;}finally{conn.release();}
  }
  return {context,assertReviewed,acknowledge};
}
export default createClinicalAppointmentAlerts();

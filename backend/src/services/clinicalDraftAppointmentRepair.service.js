import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import ClinicalNoteDraft from '../models/ClinicalNoteDraft.model.js';
import Appointment from '../models/Appointment.model.js';
import {parseUtcDate} from '../utils/officeEventDateTime.util.js';
import {resolveClinicalDraftSessionContext} from './clinicalDraftSessionContext.service.js';
const fail=message=>Object.assign(new Error(message),{status:409});
const backed=s=>s&&(s.appointment_id||s.office_event_id||s.billing_encounter_id);
export async function draftAppointmentOptions(draft, deps={}) {
  const db=deps.clinicalDatabase||clinicalPool, sessions=deps.sessions||ClinicalSession;
  const old=draft.clinical_session_id?await sessions.findById(draft.clinical_session_id):null;
  if(backed(old))return {linked:true,options:[]};
  if(!draft.client_id||!draft.date_of_service||!draft.service_code)return {linked:false,options:[],message:'Save the client, service date and service code first.'};
  const [rows]=await db.execute(`SELECT s.* FROM clinical_sessions s WHERE s.agency_id=? AND s.client_id=? AND s.provider_user_id=?
    AND (s.appointment_id IS NOT NULL OR s.office_event_id IS NOT NULL)
    AND s.service_code=? AND s.encounter_status NOT IN ('cancelled','canceled','voided','no_show')
    AND NOT EXISTS(SELECT 1 FROM clinical_notes n WHERE n.clinical_session_id=s.id AND n.provider_signed_at IS NOT NULL)
    ORDER BY s.scheduled_start_at DESC LIMIT 100`,[draft.agency_id,draft.client_id,draft.user_id,draft.service_code]);
  const options=[];
  for(const row of rows){
    try{await resolveClinicalDraftSessionContext({agencyId:draft.agency_id,clientId:draft.client_id,providerUserId:draft.user_id,
      clinicalSessionId:row.id,dateOfService:draft.date_of_service instanceof Date?draft.date_of_service.toISOString().slice(0,10):String(draft.date_of_service).slice(0,10),serviceCode:draft.service_code},
    {sessions:{findById:async()=>row},database:db});
    options.push({clinicalSessionId:row.id,appointmentId:row.appointment_id,officeEventId:row.office_event_id,
      startAt:row.scheduled_start_at,sourceTimezone:row.source_timezone||'America/Denver',serviceCode:row.service_code});
    }catch(e){if(![403,409].includes(e.status))throw e;}
  }
  return {linked:false,options};
}
export async function linkDraftAppointment(draft, targetId, confirmed, deps={}) {
  if(confirmed!==true||!Number.isSafeInteger(targetId)||targetId<1)throw fail('Select and confirm the appointment for this draft.');
  const db=deps.database||pool, clinical=deps.clinicalDatabase||clinicalPool, sessions=deps.sessions||ClinicalSession, drafts=deps.drafts||ClinicalNoteDraft;
  const choices=await draftAppointmentOptions(draft,deps);
  if(choices.linked)throw fail('This draft already has a booked encounter. Reopen its appointment; it cannot be moved here.');
  const target=choices.options.find(row=>Number(row.clinicalSessionId)===targetId);
  if(!target)throw fail('That appointment no longer matches this client, provider, service and local date, or it already has a signed note.');
  if(target.appointmentId){
    const appointments=deps.appointments||Appointment;
    const appointment=await appointments.findById(target.appointmentId);
    const participants=appointment?await appointments.listParticipants(target.appointmentId):[];
    if(!appointment || Number(appointment.agencyId)!==Number(draft.agency_id) || Number(appointment.providerUserId)!==Number(draft.user_id)
      || !participants.some(p=>Number(p.clientId)===Number(draft.client_id))
      || !['draft','scheduled','confirmed','client_confirmed','checked_in','completed'].includes(appointment.status)
      || String(appointment.serviceCode).toUpperCase()!==String(draft.service_code).toUpperCase()
      || +parseUtcDate(appointment.startAt)!==+parseUtcDate(target.startAt)){
      throw fail('The appointment changed. Open it from the schedule to review its current client, provider, status, time and service before linking.');
    }
  }
  const [notes]=await clinical.execute('SELECT id FROM clinical_notes WHERE clinical_session_id IN (?,?) LIMIT 1',[draft.clinical_session_id||0,targetId]);
  if(notes.length)throw fail('A clinical record already exists for one of these sessions. Ask the care team to review the record before linking this draft.');
  const [other]=await db.execute('SELECT id FROM clinical_note_drafts WHERE clinical_session_id=? AND id<>? LIMIT 1',[targetId,draft.id]);
  if(other.length)throw fail('This appointment already has a draft. Open it from the schedule; no existing text was replaced.');
  // Only links change. Authored source, generated sections, prices and attendance
  // stay intact. The old orphan remains available for audit rather than deleted.
  return drafts.updateForUser({draftId:draft.id,userId:draft.user_id,patch:{clinicalSessionId:targetId,officeEventId:target.officeEventId||null}});
}

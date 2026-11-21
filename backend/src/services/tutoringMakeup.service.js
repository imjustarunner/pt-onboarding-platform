import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import {maybeDecryptNotePayload} from './clinicalNoteCrypto.service.js';
const fail = message => Object.assign(new Error(message),{status:409});

export async function tutoringMakeupContext(input, dependencies = {}) {
 const d = { find: id=>Appointment.findById(id), participants: id=>Appointment.listParticipants(id), ...dependencies };
 const id = Number(input.makeupForAppointmentId);
 if (!Number.isSafeInteger(id) || id<=0) throw fail('Choose the missed appointment again.');
 const original = await d.find(id);
 const participants = original && await d.participants(id);
 const originalService = Number(original?.learningContext?.serviceEnrollmentId || 0);
 const selectedService = Number(input.learningContext?.serviceEnrollmentId || 0);
 if (!original || Number(original.agencyId)!==Number(input.agencyId)
  || !['tutoring','learning'].includes(original.businessType)
  || !['no_show','late_canceled'].includes(original.status)
  || participants?.filter(p=>p.clientId).length!==1
  || !participants.some(p=>Number(p.clientId)===Number(input.clientId))
  || originalService!==selectedService)
  throw fail('The makeup must use this student’s missed tutoring service in the same organization.');
 return {...input.learningContext,makeupForAppointmentId:id};
}

export async function tutoringMakeupDetails(appointment, db=pool) {
 let context=appointment.learningContext||{};
 if(typeof context==='string'){try{context=JSON.parse(context);}catch{context={};}}
 appointment={...appointment,learningContext:context};
 if (!['tutoring','learning'].includes(appointment.businessType)) return null;
 if (!appointment.learningContext?.makeupForAppointmentId && !['no_show','late_canceled'].includes(appointment.status)) return [];
 const [rows] = await db.execute(`SELECT a.id,a.start_at,a.end_at,a.source_timezone,a.status,a.cancellation_fee_cents,
  a.learning_context_json,w.status AS workflow_status,w.facts_json,w.preview_json FROM appointments a
  LEFT JOIN appointment_change_workflows w ON w.appointment_id=a.id
  WHERE a.agency_id=? AND a.business_type IN ('tutoring','learning')
   AND (a.id=? OR a.id=? OR CAST(JSON_UNQUOTE(JSON_EXTRACT(a.learning_context_json,'$.makeupForAppointmentId')) AS UNSIGNED)=?)
   AND EXISTS(SELECT 1 FROM appointment_participants p JOIN appointment_participants current_p
     ON current_p.client_id=p.client_id AND current_p.appointment_id=? WHERE p.appointment_id=a.id)
  ORDER BY a.start_at,a.id`,[appointment.agencyId,Number(appointment.learningContext?.makeupForAppointmentId)||0,appointment.id,appointment.id,appointment.id]);
 const current = rows.find(row=>Number(row.id)===Number(appointment.id));
 return rows.filter(row=>Number(row.id)!==Number(appointment.id)).map(row=>({appointmentId:Number(row.id),relation:Number(row.id)===Number(appointment.learningContext?.makeupForAppointmentId)?'original':'makeup',
  startAt:row.start_at,timeZone:row.source_timezone||'America/Denver',status:row.status,
  feeCents:row.cancellation_fee_cents==null?null:Number(row.cancellation_fee_cents),
  feeStatus:makeupFeeStatus(Number(row.id)===Number(appointment.learningContext?.makeupForAppointmentId)?row:current||{})}));
}

export function makeupFeeStatus(row) {
 const decode=value=>{if(!value)return {};try{return JSON.parse(maybeDecryptNotePayload(typeof value==='string'?value:JSON.stringify(value)));}catch{return {};}};
 const facts=decode(row.facts_json),preview=decode(row.preview_json);
 if(row.workflow_status==='completed'&&['waive','waived'].includes(facts.waiver?.action))return 'Missed-session consequence waived';
 if(facts.waiver?.action==='recommend')return 'Waiver requested · office review pending';
 if(row.status==='no_show_pending')return 'Missed-session decision on hold until the correction deadline';
 if(row.cancellation_fee_cents!=null)return Number(row.cancellation_fee_cents)>0?'Recorded missed-session fee':'No missed-session fee recorded';
 if(preview.consequence?.model==='package')return 'Package consequence recorded on the missed appointment';
 return 'Review the missed appointment’s fee decision';
}

import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import {getAgencyPtoPolicy} from './payrollPto.service.js';
import {readClientInsurance} from './clientInsurance.service.js';
import {hasMedicaidCoverage} from '../utils/insurancePaymentPolicy.js';
import {parseUtcDate} from '../utils/officeEventDateTime.util.js';
import {schoolSupportAvailability,createSchoolSupportRequest} from './schoolSupportRequest.service.js';

const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const unsupported={eligible:false};

/** Provider-only benefit data: never embed balances in a client note or notice. */
export async function appointmentSchoolSupportContext({appointmentId,actorUserId,eventType,clientId=null,db=pool}) {
  const appointment=await Appointment.findById(appointmentId,{executor:db});
  if(!appointment)fail('Appointment not found',404);
  if(Number(appointment.providerUserId)!==Number(actorUserId))return unsupported;
  if(!['canceled','no_show'].includes(eventType))return unsupported;
  const participants=await Appointment.listParticipants(appointmentId);
  const selected=clientId?participants.find(p=>Number(p.clientId)===Number(clientId))
    :participants.find(p=>p.isBillingResponsible)||participants.find(p=>p.clientId);
  if(!selected?.clientId)return unsupported;
  const [[client]]=await db.execute(`SELECT c.client_type,c.default_place_of_service,c.primary_insurer_name,it.label insurance_type,
      l.id location_id,l.school_organization_id,l.place_of_service,l.location_kind
    FROM clients c LEFT JOIN insurance_types it ON it.id=c.insurance_type_id
    LEFT JOIN agency_service_locations l ON l.id=COALESCE(?,c.default_service_location_id) AND l.agency_id=?
    WHERE c.id=? AND c.agency_id=?`,[appointment.serviceLocationId||null,appointment.agencyId,selected.clientId,appointment.agencyId]);
  if(!client)return unsupported;
  const isSchool=client.location_id
    ? !!client.school_organization_id||client.place_of_service==='03'||client.location_kind==='school'
    : !appointment.serviceLocationId&&(client.client_type==='school'||client.default_place_of_service==='03');
  if(!isSchool)return unsupported;
  const insurance=await readClientInsurance(selected.clientId,appointment.agencyId);
  if(!hasMedicaidCoverage(insurance)&&!/medicaid|medi-?cal|hmo.?medicaid|chip|cms/i.test(String(client.insurance_type||client.primary_insurer_name||'')))return unsupported;
  const {policy}=await getAgencyPtoPolicy({agencyId:appointment.agencyId});
  if(!policy.ptoEnabled||!policy.schoolSupportEnabled)return unsupported;
  const start=parseUtcDate(appointment.startAt);
  if(!start)return unsupported;
  const useDate=new Intl.DateTimeFormat('en-CA',{timeZone:appointment.sourceTimezone||'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(start);
  if(policy.schoolSupportAccrualAfter&&useDate<=String(policy.schoolSupportAccrualAfter).slice(0,10))return unsupported;
  const availability=await schoolSupportAvailability({agencyId:appointment.agencyId,userId:actorUserId,db});
  const [[request]]=await db.execute('SELECT id,status,total_hours FROM payroll_pto_requests WHERE source_appointment_id=? AND agency_id=? AND user_id=?',[appointment.id,appointment.agencyId,actorUserId]);
  return {eligible:true,label:'School Support Hours',...availability,useDate,hoursPerSession:1,
    canRequest:!request&&availability.availableHours>=1,
    request:request?{id:request.id,status:request.status,hours:Number(request.total_hours)}:null};
}

/** Runs inside the same transaction that records the signed cancellation. */
export async function reserveCancellationSchoolSupport({appointmentId,facts,actorUserId,db}) {
  if(facts.useSchoolSupportHour!==true)return;
  const appointment=await Appointment.findById(appointmentId,{executor:db});
  if(Number(appointment?.providerUserId)!==Number(actorUserId))fail('Only the assigned provider may request their School Support Hour',403);
  const context=await appointmentSchoolSupportContext({appointmentId,actorUserId,eventType:facts.eventType,clientId:facts.clientId,db});
  if(!context.eligible)fail('School Support Hours are not available for this appointment');
  await createSchoolSupportRequest({agencyId:appointment.agencyId,userId:actorUserId,actorId:actorUserId,sourceAppointmentId:appointment.id,
    items:[{date:context.useDate,hours:1}],notes:`School session ${facts.eventType==='no_show'?'missed':'cancelled'}. Appointment #${appointment.id}.`,db});
}

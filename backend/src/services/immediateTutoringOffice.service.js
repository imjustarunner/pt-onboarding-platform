import {createHash,randomUUID} from 'node:crypto';
import pool from '../config/database.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import Appointment from '../models/Appointment.model.js';
import {appendSecurityEvidence} from './securityEvidence.service.js';
import {networkEvidence,sessionReference} from '../utils/securityEvidence.js';
import {allocateOfficeRoom,lockOfficeRequests,unlockOfficeRequests} from './officeRoomAllocation.service.js';
import {withClientSchedulingLock} from './clientSchedulingGuard.service.js';
import {assertAppointmentClients} from './appointmentClinicalLink.service.js';
import {assertAppointmentWindowAvailable} from './appointmentConflict.service.js';
import {createAppointment,getAppointmentBundle} from './appointment.service.js';
import {appointmentScheduleNotices} from './appointmentScheduleNotice.service.js';
import {scheduleSessionNotifications} from './sessionNotification.service.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';
import {queueOfficeEventGoogleSync} from './providerAssignmentGoogleSync.service.js';
import {utcToZonedMysqlWall} from '../utils/officeEventDateTime.util.js';
const fail=message=>Object.assign(new Error(message),{status:409});
const sql=value=>value instanceof Date?value.toISOString().slice(0,19).replace('T',' '):String(value||'').replace('T',' ').replace(/Z$/,'').slice(0,19);
const parse=value=>typeof value==='string'?JSON.parse(value||'{}'):value||{};
export function immediateTutoringOfficeReason(input,now=new Date()){
 if(input.appointmentId||input.appointmentSeriesId||input.serviceCode!=='TUTORING'||!input.clientId||String(input.recurrence||'ONCE').toUpperCase()!=='ONCE'||!['IN_PERSON','IN-PERSON'].includes(String(input.modality||'').toUpperCase()))return null;
 const tz=input.office?.timezone||'America/Denver',start=utcToZonedMysqlWall(input.startAt,tz),end=utcToZonedMysqlWall(input.endAt,tz),today=utcToZonedMysqlWall(now,tz).slice(0,10);
 if(!start||!end||sql(input.endAt)<=sql(input.startAt)||start.slice(0,10)>today)return null;
 return start.slice(0,10)<today?'retrospective':'same_day';
}
export function immediateTutoringOfficeKey(input){return createHash('sha256').update(JSON.stringify([input.agencyId,input.providerId,input.clientId,input.office.id,input.roomId||0,sql(input.startAt),sql(input.endAt),input.serviceCode,input.tenantServiceId||0,input.packageEntitlementId||0,input.billing||null,input.learningSubjectKey||null])).digest('hex');}
function available(row){return !row.assigned_provider_id&&!row.booked_provider_id&&!row.standing_assignment_id&&!row.booking_plan_id&&!row.client_id&&!row.clinical_session_id&&!['BOOKED','CANCELLED'].includes(String(row.status).toUpperCase())&&!['COMPANY_HOLD','ASSIGNED_BOOKED'].includes(String(row.slot_state).toUpperCase());}
// The normal scheduling endpoint has already checked actor, provider, agency,
// service and client access. This path changes the office approval policy only.
export async function bookImmediateTutoringOffice(input){
 const reason=immediateTutoringOfficeReason(input);if(!reason)return null;
 if(reason==='retrospective'&&!input.roomId)throw fail('Choose the office room used for this past session before recording it.');
 const tz=input.office.timezone||'America/Denver',key=immediateTutoringOfficeKey(input),start=sql(input.startAt),end=sql(input.endAt);
 await OfficeScheduleMaterializer.materializeWeek({officeLocationId:input.office.id,weekStartRaw:utcToZonedMysqlWall(input.startAt,tz).slice(0,10),createdByUserId:input.actorUserId});
 return withClientSchedulingLock([input.clientId],async()=>{
  await assertAppointmentClients(input.agencyId,[{clientId:input.clientId}]);
  const db=await pool.getConnection();let locked=false,event,appointment;
  try{
   await lockOfficeRequests(db);locked=true;
   const [[prior]]=await db.execute("SELECT * FROM office_events WHERE office_location_id=? AND booked_provider_id=? AND client_id=? AND status<>'CANCELLED' AND JSON_UNQUOTE(JSON_EXTRACT(session_context_json,'$.immediateBookingKey'))=? LIMIT 1",[input.office.id,input.providerId,input.clientId,key]);
   if(prior){event=prior;appointment=await Appointment.findByOfficeEventId(event.id);}
   else{
    await assertAppointmentWindowAvailable(db,{agencyId:input.agencyId,providerUserId:input.providerId,startAt:start,endAt:end,status:'scheduled',sourceTimezone:tz});
    const allocation=await allocateOfficeRoom(db,{officeId:input.office.id,providerId:input.providerId,roomId:input.roomId||null,roomType:'tutoring',startAt:start,endAt:end,recurrence:'ONCE',occurrenceCount:1});
    event=await OfficeEvent.withRoomSlotLock({roomId:allocation.roomId,startAt:start,endAt:end},async conn=>{
     const [rows]=await conn.execute("SELECT * FROM office_events WHERE room_id=? AND start_at<? AND end_at>? AND status<>'CANCELLED' FOR UPDATE",[allocation.roomId,end,start]);
     if(rows.some(row=>!available(row)))throw fail('This office is already assigned or booked for part of that time. Choose another available room.');
     const context={agencyId:input.agencyId,clientId:input.clientId,immediateBookingKey:key,automaticConfirmation:true,confirmationReason:reason,recordedAt:new Date().toISOString(),requestedByUserId:input.actorUserId,reviewerUserId:null,tenantServiceId:input.tenantServiceId||null,packageEntitlementId:input.packageEntitlementId||null,billing:input.billing||null,learningSubjectKey:input.learningSubjectKey??null};
     for(const row of rows){
      await conn.execute("UPDATE office_events SET status='CANCELLED' WHERE id=?",[row.id]);
      for(const [from,to] of [[sql(row.start_at),start],[end,sql(row.end_at)]])if(from<to)await OfficeEvent.create({officeLocationId:input.office.id,roomId:allocation.roomId,startAt:from,endAt:to,status:'AVAILABLE',slotState:'UNASSIGNED_AVAILABLE',source:'PROVIDER_REQUEST',notes:row.notes||null,createdByUserId:input.actorUserId,executor:conn});
     }
     const created=await OfficeEvent.create({officeLocationId:input.office.id,roomId:allocation.roomId,startAt:start,endAt:end,status:'BOOKED',slotState:'ASSIGNED_BOOKED',assignedProviderId:input.providerId,bookedProviderId:input.providerId,clientId:input.clientId,source:'PROVIDER_REQUEST',appointmentTypeCode:'SESSION',serviceCode:'TUTORING',modality:'IN_PERSON',notes:input.notes||null,createdByUserId:input.actorUserId,approvedByUserId:null,executor:conn});
     // OfficeEvent.create returns the persisted row, not its insert ID. Keep
     // the room transaction and canonical appointment bound to that exact row.
     const id=Number(created?.id);
     if(!Number.isSafeInteger(id)||id<1)throw new Error('The saved office event could not be identified.');
     await conn.execute('UPDATE office_events SET session_context_json=? WHERE id=?',[JSON.stringify(context),id]);
     return {...context,id,room_id:allocation.roomId,session_context_json:JSON.stringify(context)};
    });
   }
   const context=parse(event.session_context_json);
   if(!appointment)appointment=await createAppointment({agencyId:input.agencyId,providerUserId:input.providerId,startAt:start.replace(' ','T')+'Z',endAt:end.replace(' ','T')+'Z',timeZone:tz,officeEventId:event.id,officeLocationId:input.office.id,roomId:event.room_id,modality:'IN_PERSON',serviceCode:'TUTORING',tenantServiceId:input.tenantServiceId,serviceLocationId:input.serviceLocationId,packageEntitlementId:input.packageEntitlementId||null,title:input.title||'General tutoring',notes:input.notes,source:'immediate_tutoring:'+key.slice(0,32),createdByUserId:input.actorUserId,learningSubjectKey:input.learningSubjectKey ?? null,billing:context.billing||null,notificationMode:input.notificationMode||'default',customReminders:input.customReminders||[],participants:[{role:'client',clientId:input.clientId,isBillingResponsible:true,receivesReminders:true}],ensureContext:false,deferScheduleNotice:true});
   if(!context.immediateBookingComplete){
    if(reason!=='retrospective')await scheduleSessionNotifications(appointment.id,{replace:true});
    await appointmentScheduleNotices.queue(appointment.id,{eventType:'created',actorUserId:input.actorUserId,facts:{retrospectiveBooking:reason==='retrospective',officeConfirmation:'automatic'}});
    const req=input.request;
    await appendSecurityEvidence({requestId:req?.evidenceContext?.requestId||randomUUID(),phase:'learning',method:req?.method||'POST',route:'/scheduling/office-booking',...(req?networkEvidence(req):{clientIp:null,ipSource:'system',peerIp:null}),userId:input.actorUserId,role:req?.user?.role||'system',sessionRef:sessionReference(req?.user?.sessionId),action:'tutoring_office_auto_booked',outcome:'succeeded',details:{agencyId:input.agencyId,clientId:input.clientId,providerId:input.providerId,officeEventId:event.id,appointmentId:appointment.id,automaticConfirmation:true,confirmationReason:reason,reviewerUserId:null,scheduledStartAt:start,recordedAt:context.recordedAt}});
    await pool.execute("UPDATE office_events SET session_context_json=JSON_SET(session_context_json,'$.immediateBookingComplete',TRUE,'$.appointmentId',?) WHERE id=?",[appointment.id,event.id]);
    // Calendar copies follow the saved app event; transport failure cannot undo it.
    await queueOfficeEventGoogleSync(event.id).catch(()=>{});
   }
   OfficeScheduleMaterializer.invalidateOffice(input.office.id);
   return {ok:true,kind:'auto_booked',confirmationReason:reason,officeEventId:event.id,appointmentIds:[appointment.id],event:await OfficeEvent.findById(event.id),appointment:await getAppointmentBundle(appointment.id)};
  }catch(error){
   if(event?.id){const saved=appointment||await Appointment.findByOfficeEventId(event.id);if(saved){error.code='BOOKING_INCOMPLETE';error.createdAppointmentIds=[saved.id];error.officeEventId=event.id;error.message=`Appointment #${saved.id} was saved. Open it to review the remaining office setup; do not submit another booking. ${error.message}`;}else{await OfficeEvent.withRoomSlotLock({roomId:event.room_id,startAt:start,endAt:end},async conn=>{const [[current]]=await conn.execute('SELECT * FROM office_events WHERE id=? FOR UPDATE',[event.id]);if(current&&Number(current.client_id)===Number(input.clientId)&&parse(current.session_context_json).immediateBookingKey===key&&current.status!=='CANCELLED'){await conn.execute("UPDATE office_events SET status='CANCELLED' WHERE id=?",[event.id]);await OfficeEvent.create({officeLocationId:input.office.id,roomId:event.room_id,startAt:start,endAt:end,status:'AVAILABLE',slotState:'UNASSIGNED_AVAILABLE',source:'PROVIDER_REQUEST',createdByUserId:input.actorUserId,executor:conn});}});OfficeScheduleMaterializer.invalidateOffice(input.office.id);error.message=`The office booking did not finish and its temporary room hold was released. ${error.message}`;}}
   throw error;
  }finally{try{if(locked)await unlockOfficeRequests(db);}finally{db.release();}}
 });
}

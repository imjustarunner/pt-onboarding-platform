import { createHash, randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import User from '../models/User.model.js';
import staffTools from './appointmentStaffTools.service.js';
import { withClientSchedulingLock } from './clientSchedulingGuard.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { activeAppointment, cancellationSeries, sameCancellationSeries, appointmentServiceKind } from '../utils/guardianCancellationScope.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import { withRecurringScheduleEdit } from './recurringScheduleCancellation.service.js';

const parse=v=>typeof v==='string'?JSON.parse(v):v;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const context=row=>`guardian-cancellation:${row.agency_id}:${row.id}`;
const keys=['eventType','initiator','reasons','reasonOther','clientFacingReason','followUpAction','followUpMessage','notificationMode','suppressionReason','outreach','reasonKnown','clientId','waiver','additionalComments','officeReservationDisposition'];
const clean=input=>Object.fromEntries(keys.filter(key=>input[key]!==undefined).map(key=>[key,input[key]]));
const decision=p=>({classification:p.classification,consequence:p.consequence,insuranceClaim:p.insuranceClaim});
const stamp=(a,clients,p)=>hash([a.id,a.agencyId,a.providerUserId,a.startAt,a.endAt,a.source,a.businessType,a.providerScheduleEventId,a.officeEventId,a.officeLocationId,a.roomId,clients,decision(p)]);
export function createAppointmentSeriesCancellation(overrides={}) {
  const d={db:pool,access:staffTools.authorizeEdit,appointment:id=>Appointment.findById(id),participants:id=>Appointment.listParticipants(id),user:id=>User.findById(id),
    preview:async(...args)=>(await import('./appointmentChange.service.js')).previewAppointmentChange(...args),
    validate:async(...args)=>(await import('./appointmentChange.service.js')).validateAppointmentChangeFacts(...args),
    requestAccess:async(id,userId)=>(await import('./guardianAppointments.service.js')).requireAppointmentRequestProvider(id,userId,{onlyPending:true}),
    complete:async(...args)=>(await import('./appointmentChange.service.js')).completeAppointmentChange(...args),
    workflow:async id=>(await import('./appointmentChangeWorkflow.service.js')).getAppointmentChangeWorkflow(id),
    officeCheck:async(...args)=>(await import('./appointmentOfficeDisposition.service.js')).appointmentOfficeDisposition.check(...args),
    officeReservation:async(...args)=>(await import('./appointmentOfficeDisposition.service.js')).appointmentOfficeDisposition.reservation(...args),
    documentation:async a=>(await import('./appointmentChangeNote.service.js')).assertAppointmentChangeDocumentation(a),
    encrypt:encryptFamilyBilling,decrypt:decryptFamilyBilling,clientLock:withClientSchedulingLock,seriesLock:withRecurringScheduleEdit,now:()=>new Date(),...overrides};
  const clients=async id=>[...new Set((await d.participants(id)).map(p=>Number(p.clientId)).filter(Boolean))].sort((a,b)=>a-b);
  async function related(a) {
    const [[row]]=await d.db.execute(`SELECT p.recurrence_series_id AS recurrenceSeriesId,e.booking_plan_id AS officeBookingPlanId
      FROM appointments a LEFT JOIN provider_schedule_events p ON p.id=a.provider_schedule_event_id AND p.agency_id=a.agency_id
      LEFT JOIN office_events e ON e.id=a.office_event_id WHERE a.id=?`,[a.id]);
    return {...a,...row};
  }
  const describe=row=>{const review=parse(row.review_json);return {id:row.id,status:row.status,count:review.items.length,completed:Number(row.completed_count),officeReservationDisposition:review.officeReservationDisposition,
    error:row.error_message||null,remainingAppointmentId:review.items[Number(row.completed_count)]?.id||null};};
  async function options(user,id) {
    const anchor=await d.access(user,id), ids=await clients(id), a=await related(anchor);
    const [rows]=await d.db.execute(`SELECT * FROM guardian_service_cancellations WHERE appointment_id=? AND actor_user_id=?
      AND JSON_UNQUOTE(JSON_EXTRACT(review_json,'$.staffAppointmentChange'))='true' ORDER BY created_at DESC LIMIT 1`,[id,user.id]);
    const future=+parseUtcDate(anchor.startAt)>+d.now()&&activeAppointment(anchor);
    return {seriesAvailable:future&&ids.length===1&&!!cancellationSeries(a),officeReservationAvailable:future&&!!(await d.officeReservation(anchor)),singleClient:ids.length===1,
      operation:rows[0]?describe(rows[0]):null};
  }
  async function plan(user,id,input,decisionTime=d.now()) {
    const anchor=await d.access(user,id), idList=await clients(id), enriched=await related(anchor);
    if(input.eventType!=='canceled'||input.cancellationScope!=='future')throw fail('Choose cancellation of this and future visits in the series.',400);
    if(idList.length!==1||Number(input.clientId||idList[0])!==idList[0])throw fail('Cancel shared or group appointments individually; this action is limited to one client’s series.',400);
    if(!activeAppointment(anchor)||!(+parseUtcDate(anchor.startAt)>+d.now()))throw fail('Choose an upcoming active visit as the start of the cancellation.');
    const identity=cancellationSeries(enriched);if(!identity)throw fail('This appointment has no recurring series. Choose this visit only.',400);
    if(!['keep','release'].includes(input.officeReservationDisposition))throw fail('Choose whether to keep or release the office time.',400);
    if(input.useSchoolSupportHour||input.replacementAppointmentId||(input.waiver?.action&&input.waiver.action!=='no')||['private_slots','portal_booking','replacement_booked'].includes(input.followUpAction))throw fail('Use individual appointment changes for waivers, replacement bookings or school support hours.',400);
    const [rows]=await d.db.execute(`SELECT DISTINCT a.id,a.start_at,a.source,a.business_type AS businessType,p.recurrence_series_id AS recurrenceSeriesId,e.booking_plan_id AS officeBookingPlanId
      FROM appointments a JOIN appointment_participants ap ON ap.appointment_id=a.id AND ap.client_id=?
      LEFT JOIN provider_schedule_events p ON p.id=a.provider_schedule_event_id AND p.agency_id=a.agency_id
      LEFT JOIN office_events e ON e.id=a.office_event_id WHERE a.agency_id=? AND a.provider_user_id=? AND a.start_at>=?
      AND a.status IN ('scheduled','confirmed','client_confirmed') ORDER BY a.start_at,a.id LIMIT 501`,
    [idList[0],anchor.agencyId,anchor.providerUserId,anchor.startAt]);
    if(rows.length>500)throw fail('Select a series with at most 500 saved visits.');
    const selected=rows.filter(row=>sameCancellationSeries(enriched,row)&&appointmentServiceKind(row)===appointmentServiceKind(anchor));
    if(!selected.some(row=>Number(row.id)===Number(id)))throw fail('The selected recurring visit changed. Refresh before continuing.');
    const facts={...clean(input),clientId:idList[0],followUpAction:'client_contact_support',replacementAppointmentId:null,offeredSlots:[],useSchoolSupportHour:false,
      followUpExcludedAppointmentIds:selected.map(row=>Number(row.id))};
    await d.validate(facts,{actorUserId:user.id,actorRole:user.role});
    const items=[];let root;
    for(const row of selected) {
      const a=await d.access(user,row.id), targetClients=await clients(a.id);
      if(targetClients.length!==1||targetClients[0]!==idList[0])throw fail('The series contains different participants. Review those visits individually.');
      await d.requestAccess(a.id,user.id);await d.documentation(a);await d.officeCheck(a,facts.officeReservationDisposition);
      const preview=await d.preview(a.id,facts,{actorUserId:user.id,actorRole:user.role,cancellationAt:decisionTime.toISOString()});
      if(preview.appointment.packageEntitlementId&&preview.evaluation?.recommendedPackageAction==='review'&&preview.isLate&&!preview.providerCaused&&!['waive','waived'].includes(facts.waiver?.action))throw fail('A visit requires an individual package review before this series can be canceled.');
      if(a.id===Number(id))root=preview;
      items.push({id:a.id,startAt:a.startAt,endAt:a.endAt,officeBookingPlanId:row.officeBookingPlanId||null,recurrenceSeriesId:row.recurrenceSeriesId||null,
        hash:stamp(a,targetClients,preview),when:preview.appointment.displayWhen,narrative:preview.narrative,classification:preview.classification,feeCents:Number(preview.consequence?.feeCents||0)});
    }
    const reviewToken=hash([id,identity,facts,items.map(({id,hash})=>({id,hash}))]);
    return {anchor,identity,facts,items,clientId:idList[0],reviewToken,root,decisionTime};
  }
  async function preview(user,id,input) {
    const p=await plan(user,id,input);
    return {...p.root,seriesChange:{count:p.items.length,officeReservationDisposition:p.facts.officeReservationDisposition,reviewToken:p.reviewToken,
      totalFeeCents:p.items.reduce((n,row)=>n+row.feeCents,0),appointments:p.items.map(({id,when,narrative,classification,feeCents})=>({id,when,narrative,classification,feeCents}))}};
  }
  async function status(user,id,operationId) {
    const anchor=await d.access(user,id);
    const [[row]]=await d.db.execute(`SELECT * FROM guardian_service_cancellations WHERE id=? AND appointment_id=? AND actor_user_id=?
      AND JSON_UNQUOTE(JSON_EXTRACT(review_json,'$.staffAppointmentChange'))='true'`,[operationId,id,user.id]);
    if(!row)throw fail('Cancellation progress not found.',404);return {...describe(row),appointmentId:Number(id),appointmentStatus:anchor.status};
  }
  async function list(user) {
    const [rows]=await d.db.execute(`SELECT * FROM guardian_service_cancellations WHERE actor_user_id=? AND JSON_UNQUOTE(JSON_EXTRACT(review_json,'$.staffAppointmentChange'))='true'
      AND (status IN ('queued','processing') OR (status='failed' AND updated_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY))) ORDER BY created_at DESC LIMIT 20`,[user.id]);
    const jobs=[];for(const row of rows){try{await d.access(user,row.appointment_id);jobs.push({...describe(row),appointmentId:Number(row.appointment_id)});}catch(error){if(![403,404].includes(error.status))throw error;}}
    return {operations:jobs};
  }
  async function submit(user,id,input) {
    const confirmedAt=d.now();
    if(input.signatureConfirmed!==true)throw fail('Review every cancellation note and confirm your signature.',400);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.cancellationRequestId||''))throw fail('A cancellation request reference is required.',400);
    const requestHash=hash([id,user.id,clean(input),input.cancellationReviewToken]);
    const [[existing]]=await d.db.execute('SELECT * FROM guardian_service_cancellations WHERE id=?',[input.cancellationRequestId]);
    if(existing){if(existing.request_hash!==requestHash||Number(existing.actor_user_id)!==Number(user.id))throw fail('This cancellation request changed. Review it again.');return status(user,id,existing.id);}
    const anchor=await d.access(user,id), initialClients=await clients(id);
    return d.seriesLock(()=>d.clientLock(initialClients,async()=>{
      const [[concurrent]]=await d.db.execute('SELECT * FROM guardian_service_cancellations WHERE id=?',[input.cancellationRequestId]);
      if(concurrent){if(concurrent.request_hash!==requestHash||Number(concurrent.actor_user_id)!==Number(user.id))throw fail('This cancellation request changed. Review it again.');return status(user,id,concurrent.id);}
      const p=await plan(user,id,input,confirmedAt);
      if(input.cancellationReviewToken!==p.reviewToken)throw fail('The selected dates or consequences changed. Review the current cancellation notes before signing.');
      const [pending]=await d.db.execute(`SELECT id,review_json FROM guardian_service_cancellations WHERE client_id=? AND agency_id=? AND provider_user_id=? AND status IN ('queued','processing')`,[p.clientId,anchor.agencyId,anchor.providerUserId]);
      const ids=new Set(p.items.map(a=>a.id));
      if(pending.some(row=>[...(parse(row.review_json)?.items||[]),...(parse(row.review_json)?.fees||[])].some(item=>ids.has(Number(item.id||item.appointmentId)))))throw fail('These visits already have a cancellation in progress.');
      const row={id:input.cancellationRequestId,agency_id:anchor.agencyId};
      const review={staffAppointmentChange:true,items:p.items.map(({narrative,when,...item})=>item),officeReservationDisposition:p.facts.officeReservationDisposition};
      const conn=await d.db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.execute(`INSERT INTO guardian_service_cancellations
          (id,agency_id,client_id,provider_user_id,actor_user_id,appointment_id,scope,service_kind,series_kind,series_key,request_hash,payload_encrypted,review_json,confirmed_at)
          VALUES (?,?,?,?,?,?,'future',?,?,?,?,?,?,?)`,[row.id,anchor.agencyId,p.clientId,anchor.providerUserId,user.id,id,appointmentServiceKind(anchor),p.identity.kind,p.identity.key,requestHash,
          d.encrypt(p.facts,context(row)),JSON.stringify(review),p.decisionTime.toISOString().slice(0,23).replace('T',' ')]);
        for(const planId of new Set(p.items.map(a=>a.officeBookingPlanId).filter(Boolean))) {
          const date=utcDateToZonedYmd(parseUtcDate(anchor.startAt),anchor.sourceTimezone||'America/Denver');
          await conn.execute(`UPDATE office_booking_plans SET session_context_json=JSON_SET(session_context_json,'$.clientUnscheduleFromDate',LEAST(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(session_context_json,'$.clientUnscheduleFromDate')),?),?),'$.officeReservationDisposition',?)
            WHERE id=? AND JSON_UNQUOTE(JSON_EXTRACT(session_context_json,'$.clientId'))=? AND JSON_UNQUOTE(JSON_EXTRACT(session_context_json,'$.agencyId'))=?`,
          [date,date,p.facts.officeReservationDisposition,planId,String(p.clientId),String(anchor.agencyId)]);
        }
        for(const seriesId of new Set(p.items.map(a=>a.recurrenceSeriesId).filter(Boolean)))await conn.execute(`UPDATE provider_schedule_events e JOIN appointments a ON a.provider_schedule_event_id=e.id
          SET e.recurrence_stopped=1 WHERE e.agency_id=? AND e.provider_id=? AND e.recurrence_series_id=?
          AND EXISTS(SELECT 1 FROM appointment_participants p WHERE p.appointment_id=a.id AND p.client_id=?)
          AND (SELECT COUNT(*) FROM appointment_participants p WHERE p.appointment_id=a.id AND p.client_id IS NOT NULL)=1`,[anchor.agencyId,anchor.providerUserId,seriesId,p.clientId]);
        const marks=p.items.map(()=>'?').join(',');
        await conn.execute(`UPDATE appointment_reminders SET status='canceled' WHERE appointment_id IN (${marks}) AND status='pending'`,p.items.map(a=>a.id));
        await conn.execute(`UPDATE appointment_schedule_notices SET status='superseded' WHERE appointment_id IN (${marks}) AND status='pending' AND event_type IN ('created','updated','moved')`,p.items.map(a=>a.id));
        await conn.commit();
      }catch(error){await conn.rollback();throw error;}finally{conn.release();}
      return {id:row.id,status:'queued',count:p.items.length,completed:0,officeReservationDisposition:p.facts.officeReservationDisposition};
    }));
  }
  async function retry(user,id,operationId) {
    const current=await status(user,id,operationId);
    if(current.status==='failed')await d.db.execute("UPDATE guardian_service_cancellations SET status='queued',attempts=0,error_message=NULL,available_at=UTC_TIMESTAMP() WHERE id=? AND actor_user_id=? AND status='failed'",[operationId,user.id]);
    return status(user,id,operationId);
  }
  let running=false;
  async function processPending() {
    if(running)return;running=true;
    try {
      const token=randomUUID();
      const [claimed]=await d.db.execute(`UPDATE guardian_service_cancellations SET status='processing',attempts=attempts+1,lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)
        WHERE JSON_UNQUOTE(JSON_EXTRACT(review_json,'$.staffAppointmentChange'))='true' AND ((status='queued' AND available_at<=UTC_TIMESTAMP()) OR (status='processing' AND lease_until<UTC_TIMESTAMP())) ORDER BY created_at LIMIT 1`,[token]);
      if(!claimed.affectedRows)return;
      const [[row]]=await d.db.execute('SELECT * FROM guardian_service_cancellations WHERE lease_token=?',[token]);
      try {
        await d.clientLock([row.client_id],async()=>{
          const user=await d.user(row.actor_user_id);if(!user||(user.is_active!=null&&!Number(user.is_active))||Number(user.is_archived)||['ARCHIVED','INACTIVE_EMPLOYEE','TERMINATED'].includes(user.status))throw fail('The signing staff account no longer has access.',403);
          const facts=d.decrypt(row.payload_encrypted,context(row)),review=parse(row.review_json);
          for(let index=Number(row.completed_count)||0;index<review.items.length;index++) {
            const item=review.items[index],a=await d.access(user,item.id),workflow=await d.workflow(item.id);
            if(workflow&&workflow.status!=='draft') {
              if(workflow.facts.staffSeriesOperationId!==row.id)throw fail('A visit was changed by another request. Review the remaining visits.');
            } else {
              if(!activeAppointment(a))throw fail('A visit no longer has a cancelable status. Review the remaining visits.');
              const currentSeries=await related(a);
              if(String(currentSeries.recurrenceSeriesId||'')!==String(item.recurrenceSeriesId||'')||Number(currentSeries.officeBookingPlanId||0)!==Number(item.officeBookingPlanId||0))throw fail('A visit moved to another recurring series. Review the remaining visits.');
              const current=await d.preview(a.id,facts,{actorUserId:user.id,actorRole:user.role,cancellationAt:row.confirmed_at});
              if(stamp(a,await clients(a.id),current)!==item.hash)throw fail('A visit or consequence changed after signing. Review the remaining visits before canceling them.');
              await d.officeCheck(a,facts.officeReservationDisposition);
            }
            if(workflow?.status!=='completed')await d.complete(item.id,{...facts,staffSeriesOperationId:row.id,signatureConfirmed:true},{actorUserId:user.id,actorRole:user.role,cancellationAt:row.confirmed_at});
            const [updated]=await d.db.execute('UPDATE guardian_service_cancellations SET completed_count=?,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) WHERE id=? AND lease_token=?',[index+1,row.id,token]);
            if(!updated.affectedRows)throw new Error('Cancellation worker lease changed.');
          }
          await d.db.execute("UPDATE guardian_service_cancellations SET status='completed',error_message=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",[row.id,token]);
        });
      } catch(error) {
        const retry=(!error.status||['CLIENT_SCHEDULE_BUSY','OFFICE_SLOT_LOCK_TIMEOUT'].includes(error.code))&&Number(row.attempts)<3;
        await d.db.execute(`UPDATE guardian_service_cancellations SET status=?,error_message=?,lease_token=NULL,lease_until=NULL,available_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 MINUTE) WHERE id=? AND lease_token=?`,
        [retry?'queued':'failed',error.status?String(error.message).slice(0,500):'Cancellation paused. Resume the remaining visits; completed changes will not be repeated.',row.id,token]);
      }
    } finally {running=false;}
  }
  return {options,list,preview,submit,status,retry,processPending};
}
export const appointmentSeriesCancellations=createAppointmentSeriesCancellation();

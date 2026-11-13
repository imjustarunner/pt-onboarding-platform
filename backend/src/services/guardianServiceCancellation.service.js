import { createHash, randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import { authorizedAppointmentClient, requireGuardianCancellation } from './guardianAppointments.service.js';
import { evaluateCancel } from './bookingCancellationPolicy.service.js';
import { withClientSchedulingLock } from './clientSchedulingGuard.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { activeAppointment, appointmentServiceKind, cancellationSeries, sameCancellationSeries, guardianCancellationDetails } from '../utils/guardianCancellationScope.js';

const fail = (message,status=400) => Object.assign(new Error(message),{status});
const parse = v => typeof v === 'string' ? JSON.parse(v) : v;
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sqlTime = d => new Date(d).toISOString().slice(0,23).replace('T',' ');
const cryptoContext = row => `guardian-cancellation:${row.agency_id}:${row.id}`;
const scopeLabel = kind => ({counseling:'counseling',tutoring:'tutoring',coaching:'coaching',consultation:'consultation'})[kind] || 'this service';

export function createGuardianServiceCancellationService(overrides={}) {
  const d = { db:pool, appointment:id=>Appointment.findById(id), authorize:authorizedAppointmentClient,
    requireCancellation:requireGuardianCancellation, evaluate:evaluateCancel,
    authorizeEnd:async({userId,clientId,agencyId,serviceKind})=>{
      if(serviceKind==='counseling')await(await import('./guardianClinicalAccess.service.js')).requireClinicalScope({userId,clientId,agencyId,scope:'session_frequency'});
    },
    cancel:async(...args)=>(await import('./appointment.service.js')).cancelAppointment(...args),
    notify:async(...args)=>(await import('./appointmentCancellationNotification.service.js')).notifyAppointmentCancellation(...args),
    calendarCleanup:async(...args)=>(await import('./guardianCancellationCalendar.service.js')).cleanupGuardianCancellationCalendar(...args),
    encrypt:encryptFamilyBilling, decrypt:decryptFamilyBilling, now:()=>new Date(),
    clientLock:withClientSchedulingLock, ...overrides };

  async function related(appointmentId,db=d.db) {
    const [[row]] = await db.execute(`SELECT p.recurrence_series_id AS recurrenceSeriesId,e.booking_plan_id AS officeBookingPlanId
      FROM appointments a LEFT JOIN provider_schedule_events p ON p.id=a.provider_schedule_event_id AND p.agency_id=a.agency_id
      LEFT JOIN office_events e ON e.id=a.office_event_id WHERE a.id=?`,[appointmentId]);
    return row || {};
  }
  async function plan(input,now=d.now()) {
    const {reason,personalNote}=guardianCancellationDetails(input);
    const scope=input.scope||'single';
    if(!['single','future','end_services'].includes(scope))throw fail('Choose one appointment, this series, or ending this service.');
    const client=await d.authorize(input.userId,input.clientId,{agencyId:input.agencyId,serviceId:input.serviceId});
    const anchor=await d.appointment(input.appointmentId);
    if(!anchor || Number(anchor.agencyId)!==Number(client.agency_id))throw fail('Appointment not found.',404);
    await d.requireCancellation({userId:input.userId,clientId:input.clientId,appointment:anchor});
    const enrichedAnchor={...anchor,...await related(anchor.id)};
    const serviceKind=appointmentServiceKind(anchor,client),identity=cancellationSeries(enrichedAnchor);
    if(scope==='end_services')await d.authorizeEnd({userId:input.userId,clientId:input.clientId,agencyId:anchor.agencyId,serviceKind});
    if(scope==='end_services'){
      const [[ended]]=await d.db.execute(`SELECT id FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND provider_user_id=? AND service_kind=? AND is_active=0 LIMIT 1`,[input.clientId,anchor.agencyId,anchor.providerUserId,serviceKind]);
      if(ended)throw fail('This service has already ended. Refresh to review its cancellation status.',409);
    }
    if(scope==='future'&&!identity)throw fail('This appointment is not part of a recurring series.',409);
    let ids=[anchor.id],selectedSeries=[enrichedAnchor];
    if(scope!=='single') {
      const [rows]=await d.db.execute(`SELECT DISTINCT a.id,a.start_at AS startAt,a.source,a.business_type AS businessType,
        p.recurrence_series_id AS recurrenceSeriesId,e.booking_plan_id AS officeBookingPlanId FROM appointments a
        JOIN appointment_participants ap ON ap.appointment_id=a.id AND ap.client_id=?
        LEFT JOIN provider_schedule_events p ON p.id=a.provider_schedule_event_id AND p.agency_id=a.agency_id
        LEFT JOIN office_events e ON e.id=a.office_event_id WHERE a.agency_id=? AND a.provider_user_id=?
        AND a.start_at>=? AND a.status IN ('scheduled','confirmed','client_confirmed') ORDER BY a.start_at,a.id`,
      [input.clientId,client.agency_id,anchor.providerUserId,sqlTime(now)]);
      selectedSeries=rows.filter(row=>appointmentServiceKind(row,client)===serviceKind
        &&(scope==='end_services'||sameCancellationSeries(enrichedAnchor,row)));
      ids=selectedSeries.map(row=>Number(row.id));
      if(scope==='end_services')selectedSeries.push(enrichedAnchor);
    }
    const candidates=[],fees=[];
    let plannedComplimentary=0;
    for(const id of ids) {
      const a=await d.appointment(id);
      if(!activeAppointment(a))continue;
      await d.requireCancellation({userId:input.userId,clientId:input.clientId,appointment:a});
      const start=parseUtcDate(a.startAt);
      if(!start||+start<=+now)throw fail('Only future appointments can be canceled here.',409);
      let e=await d.evaluate({appointment:a,actorRole:'guardian',clientId:input.clientId,now});
      if(e.usedComplimentary && plannedComplimentary) e=await d.evaluate({appointment:a,actorRole:'guardian',clientId:input.clientId,now,plannedComplimentaryCancels:plannedComplimentary});
      if(e.usedComplimentary)plannedComplimentary++;
      if(!e.allowed)throw fail(e.blockReason||'The service policy does not allow self-cancellation. Contact your care team.',403);
      if(!Number.isSafeInteger(Number(e.recommendedFeeCents||0))||Number(e.recommendedFeeCents||0)<0)throw fail('The cancellation fee needs care-team review.',409);
      candidates.push(a);
      fees.push({appointmentId:a.id,startAt:a.startAt,timeZone:a.sourceTimezone||'America/Denver',policyId:e.policy?.id||null,
        policyName:e.policy?.name||'Cancellation policy',noticeHours:e.policy?.noticeHours??24,cancelDeadlineAt:e.cancelDeadlineAt||null,
        feeCents:Number(e.recommendedFeeCents||0),isLate:!!e.isLate,hasPackage:!!a.packageEntitlementId,packageAction:e.recommendedPackageAction||'release'});
    }
    if(!candidates.length&&scope!=='end_services')throw fail('There are no future appointments left in this selection. Refresh your appointments.',409);
    const review={scope,count:candidates.length,serviceKind,serviceLabel:scopeLabel(serviceKind),fees,
      totalFeeCents:fees.reduce((n,f)=>n+f.feeCents,0),endsService:scope==='end_services'};
    review.reviewToken=hash([scope,anchor.id,fees]);
    return {client,anchor,serviceKind,identity,candidates,selectedSeries,review,reason,personalNote,now};
  }

  async function preview(input) { return (await plan(input)).review; }
  const describe=row=>({id:row.id,status:row.status,scope:row.scope,count:(parse(row.review_json)?.fees||[]).length,
    completed:Number(row.completed_count),endsService:row.scope==='end_services',teamNotified:!!row.team_notified_at,
    serviceNotificationsDisabled:row.scope==='end_services',error:row.error_message||null});
  async function status({userId,clientId,operationId}) {
    const [[row]]=await d.db.execute('SELECT * FROM guardian_service_cancellations WHERE id=? AND actor_user_id=? AND client_id=?',[operationId,userId,clientId]);
    if(!row)throw fail('Cancellation progress not found.',404);
    await d.authorize(userId,clientId,{agencyId:row.agency_id});
    return describe(row);
  }
  async function submit(input) {
    if(input.confirmed!==true)throw fail('Review the affected dates and fees, then confirm.');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId||''))throw fail('A cancellation request identity is required. Refresh and try again.');
    const details=guardianCancellationDetails(input);
    const requestHash=hash([input.userId,input.clientId,input.appointmentId,input.scope||'single',details.reason,details.personalNote,input.reviewToken]);
    const [[existing]]=await d.db.execute('SELECT * FROM guardian_service_cancellations WHERE id=?',[input.requestId]);
    if(existing) {
      if(existing.request_hash!==requestHash || Number(existing.actor_user_id)!==Number(input.userId))throw fail('This cancellation request changed. Review it again.',409);
      return status({userId:input.userId,clientId:input.clientId,operationId:input.requestId});
    }
    return d.clientLock([input.clientId],async()=>{
      const [[concurrent]]=await d.db.execute('SELECT * FROM guardian_service_cancellations WHERE id=?',[input.requestId]);
      if(concurrent){
        if(concurrent.request_hash!==requestHash||Number(concurrent.actor_user_id)!==Number(input.userId))throw fail('This cancellation request changed. Review it again.',409);
        return status({userId:input.userId,clientId:input.clientId,operationId:input.requestId});
      }
      const p=await plan(input);
      if(p.review.reviewToken!==input.reviewToken)throw fail('The appointment selection or cancellation fee changed. Review the latest details before confirming.',409);
      const [pending]=await d.db.execute(`SELECT id,review_json FROM guardian_service_cancellations
        WHERE client_id=? AND agency_id=? AND provider_user_id=? AND status IN ('queued','processing')`,[input.clientId,p.anchor.agencyId,p.anchor.providerUserId]);
      const selected=new Set(p.candidates.map(a=>Number(a.id)));
      if(pending.some(row=>(parse(row.review_json)?.fees||[]).some(fee=>selected.has(Number(fee.appointmentId))))) {
        throw fail('A cancellation for these appointments is already processing. Refresh its status before submitting another.',409);
      }
      const row={id:input.requestId,agency_id:p.anchor.agencyId};
      const db=await d.db.getConnection();
      try {
        await db.beginTransaction();
        await db.execute(`INSERT INTO guardian_service_cancellations
          (id,agency_id,client_id,provider_user_id,actor_user_id,appointment_id,scope,service_kind,series_kind,series_key,
           request_hash,payload_encrypted,review_json,confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [row.id,row.agency_id,input.clientId,p.anchor.providerUserId,input.userId,p.anchor.id,p.review.scope,p.serviceKind,
          p.identity?.kind||null,p.identity?.key||null,requestHash,d.encrypt({...details,actorRole:p.client.relationship_type==='self'?'client':'guardian'},cryptoContext(row)),JSON.stringify(p.review),sqlTime(p.now)]);
        if(p.review.endsService) {
          await db.execute(`INSERT INTO client_service_enrollments (client_id,agency_id,service_kind,provider_user_id,label,is_active,created_by_user_id,updated_by_user_id)
            VALUES (?,?,?,?,?,0,?,?) ON DUPLICATE KEY UPDATE is_active=0,updated_by_user_id=VALUES(updated_by_user_id)`,
          [input.clientId,row.agency_id,p.serviceKind,p.anchor.providerUserId,scopeLabel(p.serviceKind),input.userId,input.userId]);
          await db.execute(`UPDATE client_service_enrollments SET is_active=0,updated_by_user_id=?
            WHERE client_id=? AND agency_id=? AND provider_user_id=? AND service_kind=?`,[input.userId,input.clientId,row.agency_id,p.anchor.providerUserId,p.serviceKind]);
          await db.execute(`INSERT INTO client_status_history (client_id,changed_by_user_id,field_changed,from_value,to_value,note)
            VALUES (?,?,'service_enrollment','active','ended',?)`,[input.clientId,input.userId,`Client or authorized guardian ended ${scopeLabel(p.serviceKind)} with provider ${p.anchor.providerUserId}; other services remain unchanged.`]);
        }
        if(p.review.scope!=='single') {
          // A standing room assignment belongs to the provider. Stop only plans explicitly owned by this client.
          for(const planId of new Set(p.selectedSeries.map(a=>a.officeBookingPlanId).filter(Boolean))) await db.execute(`UPDATE office_booking_plans
            SET is_active=0 WHERE id=? AND JSON_UNQUOTE(JSON_EXTRACT(session_context_json,'$.clientId'))=?
            AND JSON_UNQUOTE(JSON_EXTRACT(session_context_json,'$.agencyId'))=?`,[planId,String(input.clientId),String(row.agency_id)]);
          for(const seriesId of new Set(p.selectedSeries.map(a=>a.recurrenceSeriesId).filter(Boolean))) await db.execute(`UPDATE provider_schedule_events SET recurrence_stopped=1
            WHERE recurrence_series_id=? AND provider_id=? AND agency_id=?`,[seriesId,p.anchor.providerUserId,row.agency_id]);
          if(p.candidates.length)await db.execute(`UPDATE provider_schedule_events p JOIN appointments a ON a.provider_schedule_event_id=p.id
            SET p.recurrence_stopped=1 WHERE a.id IN (${p.candidates.map(()=>'?').join(',')})`,p.candidates.map(a=>a.id));
        }
        const ids=p.candidates.map(a=>a.id),marks=ids.map(()=>'?').join(',');
        if(ids.length)await db.execute(`UPDATE appointment_reminders SET status='canceled' WHERE appointment_id IN (${marks}) AND status='pending'`,ids);
        if(ids.length)await db.execute(`UPDATE appointment_schedule_notices SET status='superseded' WHERE appointment_id IN (${marks})
          AND status='pending' AND event_type IN ('created','updated','moved')`,ids);
        await db.commit();
      } catch(error) { await db.rollback();throw error; }
      finally { db.release(); }
      return {id:row.id,status:'queued',scope:p.review.scope,count:p.review.count,completed:0,endsService:p.review.endsService};
    });
  }
  async function processOne(row,token) {
    const review=parse(row.review_json),details=d.decrypt(row.payload_encrypted,cryptoContext(row));
    await d.authorize(row.actor_user_id,row.client_id,{agencyId:row.agency_id});
    let completed=0,totalFeeCents=0;
    for(const fee of review.fees) {
      const a=await d.appointment(fee.appointmentId);
      if(!a)throw fail('An appointment in this cancellation changed. Your care team must review it.',409);
      if(activeAppointment(a)) {
        if(+parseUtcDate(a.startAt)!==+parseUtcDate(fee.startAt))throw fail('An appointment moved after the review. Your care team must review its cancellation.',409);
        const result=await d.cancel(a.id,{actorUserId:row.actor_user_id,actorRole:details.actorRole||'guardian',clientId:row.client_id,
          reason:details.reason,expectedFeeCents:fee.feeCents,expectedPolicyId:fee.policyId,expectedPackageAction:fee.packageAction,
          cancellationAt:row.confirmed_at,deferNotification:true});
        totalFeeCents+=Number(result?.cancellationFeeCents??fee.feeCents);
      } else {
        if(!/^(canceled|cancelled|late_canceled|rescheduled)/.test(a.status))throw fail('An appointment is no longer cancelable. Your care team must review it.',409);
        totalFeeCents+=Number(a.cancellationFeeCents||0);
      }
      completed++;
      const [held]=await d.db.execute(`UPDATE guardian_service_cancellations SET completed_count=?,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)
        WHERE id=? AND lease_token=? AND status='processing'`,[completed,row.id,token]);
      if(!held.affectedRows)throw new Error('Cancellation lease changed.');
    }
    for(const fee of review.fees) {
      await d.calendarCleanup(await d.appointment(fee.appointmentId),row.actor_user_id);
      await d.db.execute('UPDATE guardian_service_cancellations SET lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) WHERE id=? AND lease_token=?',[row.id,token]);
    }
    // Notify the team exactly once before confirming that it has been notified.
    const team=await d.db.getConnection();
    try {
      await team.beginTransaction();
      const [[held]]=await team.execute('SELECT team_notified_at FROM guardian_service_cancellations WHERE id=? AND lease_token=? FOR UPDATE',[row.id,token]);
      if(!held)throw new Error('Cancellation lease changed.');
      if(!held.team_notified_at){
        await team.execute(`INSERT INTO notifications (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_user_id,actor_source)
          VALUES ('public_appointment_request_received','info',?,?,?,?,'appointment',?,?,'guardian_portal')`,
        [review.endsService?'Client ended services':'Client appointments canceled',`${review.count} appointment(s) canceled. Reason: ${details.reason}${details.personalNote?` Personal note: ${details.personalNote}`:''}`,row.provider_user_id,row.agency_id,row.appointment_id,row.actor_user_id]);
        await team.execute('UPDATE guardian_service_cancellations SET team_notified_at=UTC_TIMESTAMP(3) WHERE id=? AND lease_token=?',[row.id,token]);
      }
      await team.commit();
    }catch(error){await team.rollback();throw error;}finally{team.release();}
    await d.notify(row.appointment_id,{eventType:'canceled',cancellationActorRole:details.actorRole||'guardian',cancellationActorUserId:row.actor_user_id,
      clientFacingReason:details.reason,followUpAction:'none',guardianCancellationOperationId:row.id,
      guardianSummary:{count:review.count,endsService:review.endsService,serviceLabel:review.serviceLabel,totalFeeCents,
        teamNotified:true,notificationsDisabled:review.endsService},
      ...(review.endsService?{emailOnly:true}:{}),personalNote:details.personalNote},row.actor_user_id);
    await d.db.execute(`UPDATE guardian_service_cancellations SET status='completed',error_message=NULL,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?`,[row.id,token]);
  }
  let running=false;
  async function processPending() {
    if(running)return;running=true;
    try {
      const token=randomUUID();
      const [claimed]=await d.db.execute(`UPDATE guardian_service_cancellations SET status='processing',attempts=attempts+1,
        lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)
        WHERE (status='queued' AND available_at<=UTC_TIMESTAMP()) OR (status='processing' AND lease_until<UTC_TIMESTAMP()) ORDER BY created_at LIMIT 1`,[token]);
      if(!claimed.affectedRows)return;
      const [[row]]=await d.db.execute('SELECT * FROM guardian_service_cancellations WHERE lease_token=?',[token]);
      try { await d.clientLock([row.client_id],()=>processOne(row,token)); }
      catch(error) {
        const retry=(!error.status||['CLIENT_SCHEDULE_BUSY','OFFICE_SLOT_LOCK_TIMEOUT'].includes(error.code))&&Number(row.attempts)<3;
        await d.db.execute(`UPDATE guardian_service_cancellations SET status=?,error_message=?,lease_token=NULL,
          lease_until=NULL,available_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 MINUTE) WHERE id=? AND lease_token=?`,[retry?'queued':'failed',error.status?String(error.message).slice(0,500):'Cancellation is awaiting care-team follow-up. Completed cancellations will not be repeated.',row.id,token]);
        if(!retry)await d.db.execute(`INSERT INTO notifications (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_user_id,actor_source)
          SELECT 'public_appointment_request_received','warning','Client cancellation needs review',?,?,?,'appointment',?,?,'guardian_portal'
          WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE title='Client cancellation needs review' AND related_entity_type='appointment' AND related_entity_id=? AND actor_user_id=?)`,
        ['A client cancellation request needs follow-up. Previously completed cancellations will not be repeated; open the appointment and review the remaining request.',row.provider_user_id,row.agency_id,row.appointment_id,row.actor_user_id,row.appointment_id,row.actor_user_id]).catch(()=>{});
      }
    } finally { running=false; }
  }
  return {preview,submit,status,processPending};
}
export const guardianServiceCancellations=createGuardianServiceCancellationService();

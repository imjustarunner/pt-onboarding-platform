import pool from '../config/database.js';
import Google from './googleCalendar.service.js';
import { googleScheduleAllowedForEmail } from './scheduleCalendarPolicy.service.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import BookingPackage from '../models/BookingPackage.model.js';
import { releaseAppointmentCalendar } from './appointmentCalendarMaintenance.service.js';

/** Remove existing SSO copies quietly; a bulk cancellation sends one app summary. */
export async function cleanupGuardianCancellationCalendar(appointment,actorUserId=null) {
  // A worker can stop after the appointment status was saved but before credits
  // or calendar facets were released. These operations are idempotent by appointment.
  const action=appointment.cancellationRecommendationJson?.recommendedPackageAction;
  if(appointment.packageEntitlementId&&['release','forfeit','late_forfeit'].includes(action))await BookingPackage.applyAppointmentUsage({
    entitlementId:appointment.packageEntitlementId,agencyId:appointment.agencyId,appointmentId:appointment.id,
    mode:action==='release'?'release':'forfeit',actorUserId});
  await releaseAppointmentCalendar(appointment,actorUserId,{preserveProviderReservation:true});
  if(appointment.officeEventId) {
    const result=await Google.cancelBookedOfficeEvent({officeEventId:appointment.officeEventId,sendUpdates:'none'});
    if(!result?.ok&&!result?.skipped)throw new Error('Office calendar cleanup needs retry.');
    const event=await OfficeEvent.findById(appointment.officeEventId);
    if(event?.standing_assignment_id && event.status==='CANCELLED')await OfficeEvent.withRoomSlotLock({roomId:event.room_id,startAt:event.start_at,endAt:event.end_at},async db=>{
      const [[owner]]=await db.execute(`SELECT s.id,s.provider_id FROM office_standing_assignments s JOIN users u ON u.id=s.provider_id
        WHERE s.id=? AND s.is_active=1 AND s.provider_id=? AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
        AND u.status NOT IN ('ARCHIVED','INACTIVE_EMPLOYEE','TERMINATED')`,[event.standing_assignment_id,event.assigned_provider_id]);
      if(!owner)return;
      const [occupied]=await db.execute("SELECT id FROM office_events WHERE room_id=? AND start_at<? AND end_at>? AND status<>'CANCELLED'",[event.room_id,event.end_at,event.start_at]);
      if(occupied.length)return;
      const context=typeof event.session_context_json==='string'?JSON.parse(event.session_context_json):event.session_context_json;
      await db.execute(`INSERT INTO office_events (office_location_id,room_id,start_at,end_at,status,slot_state,standing_assignment_id,assigned_provider_id,source,created_by_user_id,session_context_json)
        VALUES (?,?,?,?,'RELEASED','ASSIGNED_AVAILABLE',?,?,'SUPPORT',?,?)`,[event.office_location_id,event.room_id,event.start_at,event.end_at,owner.id,owner.provider_id,actorUserId||event.created_by_user_id,
        JSON.stringify({agencyId:context?.agencyId||appointment.agencyId,bookingSource:'office_assignment'})]);
    });
  }
  if(appointment.providerScheduleEventId) {
    const [[event]]=await pool.execute(`SELECT p.google_event_id,u.email FROM provider_schedule_events p JOIN users u ON u.id=p.provider_id
      WHERE p.id=? AND p.agency_id=?`,[appointment.providerScheduleEventId,appointment.agencyId]);
    if(!event?.google_event_id||!await googleScheduleAllowedForEmail(event.email))return;
    const result=await Google.cancelProviderPrimaryCalendarEvent({subjectEmail:event.email,googleEventId:event.google_event_id,sendUpdates:'none'});
    if(!result?.ok&&!result?.skipped)throw new Error('Provider calendar cleanup needs retry.');
    if(result?.ok)await pool.execute('UPDATE provider_schedule_events SET google_event_id=NULL,google_html_link=NULL,recurrence_calendar_pending=0 WHERE id=?',[appointment.providerScheduleEventId]);
  }
}

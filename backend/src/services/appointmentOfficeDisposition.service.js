import pool from '../config/database.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import { utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value || {};
const fail = message => Object.assign(new Error(message), {status:409});
export function createAppointmentOfficeDisposition({ db=pool, roomLock=(input,work)=>OfficeEvent.withRoomSlotLock(input,work),encrypt=maybeEncryptNotePayload,decrypt=maybeDecryptNotePayload }={}) {
  async function reservation(appointment, executor=db) {
    if (appointment.officeEventId) {
      const [[event]]=await executor.execute('SELECT * FROM office_events WHERE id=?',[appointment.officeEventId]);
      return event || null;
    }
    if (!appointment.roomId || !appointment.officeLocationId) return null;
    const [events]=await executor.execute(`SELECT * FROM office_events WHERE room_id=? AND office_location_id=? AND booked_provider_id=?
      AND status='BOOKED' AND start_at<=? AND end_at>=? AND client_id IS NULL AND clinical_session_id IS NULL ORDER BY id LIMIT 2`,
    [appointment.roomId,appointment.officeLocationId,appointment.providerUserId,appointment.startAt,appointment.endAt]);
    if (events.length>1) throw fail('More than one office reservation covers this visit. Review the office booking first.');
    return events[0] || null;
  }
  async function check(appointment, choice, executor=db) {
    if (!['keep','release'].includes(choice)) throw fail('Choose whether to keep or release the office reservation.');
    const event=await reservation(appointment,executor);
    if (!event) return null;
    const [other]=await executor.execute(`SELECT id FROM appointments WHERE id<>? AND room_id=? AND start_at<? AND end_at>?
      AND status IN ('scheduled','confirmed','client_confirmed','checked_in') LIMIT 1`,[appointment.id,event.room_id,event.end_at,event.start_at]);
    if (other.length) throw fail('Another active appointment uses this office time. Keep that appointment and review the shared reservation first.');
    if (Number(event.booked_provider_id||event.assigned_provider_id)!==Number(appointment.providerUserId)) throw fail('The office reservation belongs to another provider. Refresh before canceling.');
    return event;
  }
  async function apply(appointment, actorUserId, choice) {
    const initial=await reservation(appointment);
    if (!initial) return {choice,officeEventId:null};
    return roomLock({roomId:initial.room_id,startAt:initial.start_at,endAt:initial.end_at},async conn=>{
      const [recorded]=await conn.execute(`SELECT metadata_json FROM appointment_communications WHERE appointment_id=? AND kind='office_cancellation_choice' ORDER BY id DESC LIMIT 1`,[appointment.id]);
      if (recorded.length) {
        const raw=recorded[0].metadata_json;
        const result=parse(decrypt(typeof raw==='string'?raw:JSON.stringify(raw)));
        if (result.choice!==choice) throw fail('This cancellation already recorded a different office choice. Review its history before changing it.');
        return result;
      }
      const event=await check(appointment,choice,conn);
      if (!event) return {choice,officeEventId:null};
      const [[office]]=await conn.execute('SELECT timezone FROM office_locations WHERE id=?',[event.office_location_id]);
      if (event.booking_plan_id && choice==='release') {
        const [[plan]]=await conn.execute('SELECT skipped_dates_json FROM office_booking_plans WHERE id=? FOR UPDATE',[event.booking_plan_id]);
        const date=utcDateToZonedYmd(parseUtcDate(event.start_at),office?.timezone||appointment.sourceTimezone||'America/Denver');
        const skipped=parse(plan?.skipped_dates_json);
        await conn.execute('UPDATE office_booking_plans SET skipped_dates_json=? WHERE id=?',[JSON.stringify([...new Set([...(Array.isArray(skipped)?skipped:[]),date])]),event.booking_plan_id]);
      }
      let replacementId=null;
      if(choice==='keep'&&!appointment.officeEventId){
        // A separately linked room is already independent of the clinical record.
        // Keep its identity, ownership and time instead of recreating the reservation.
        replacementId=Number(event.id);
        await conn.execute("UPDATE office_events SET session_context_json=JSON_SET(COALESCE(session_context_json,JSON_OBJECT()),'$.officeCancellationDisposition','keep','$.detachedAppointmentId',?) WHERE id=?",[appointment.id,event.id]);
      }else{
      // Keep the original clinical event and its client links in cancellation history.
      await conn.execute("UPDATE office_events SET status='CANCELLED',slot_state=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",[event.id]);
      if (choice==='keep' || event.standing_assignment_id) {
        const [[plan]]=event.booking_plan_id?await conn.execute('SELECT session_context_json FROM office_booking_plans WHERE id=?',[event.booking_plan_id]):[[]];
        const context=parse(plan?.session_context_json);
        const [created]=await conn.execute(`INSERT INTO office_events
          (office_location_id,room_id,start_at,end_at,status,slot_state,standing_assignment_id,booking_plan_id,assigned_provider_id,booked_provider_id,source,recurrence_group_id,created_by_user_id,session_context_json)
          VALUES (?,?,?,?,?,?,?,?,?,?,'SUPPORT',?,?,?)`,
        [event.office_location_id,event.room_id,event.start_at,event.end_at,choice==='keep'?'BOOKED':'RELEASED',choice==='keep'?'ASSIGNED_BOOKED':'ASSIGNED_AVAILABLE',
          event.standing_assignment_id||null,choice==='keep'?event.booking_plan_id||null:null,event.assigned_provider_id||appointment.providerUserId,
          choice==='keep'?appointment.providerUserId:null,event.recurrence_group_id||null,actorUserId,
          JSON.stringify({agencyId:context.agencyId||appointment.agencyId,bookingSource:context.clientId?'office_assignment':context.bookingSource||'office_assignment',officeCancellationDisposition:choice,detachedAppointmentId:appointment.id})]);
        replacementId=Number(created.insertId);
      }
      }
      for (const table of ['provider_virtual_slot_availability','provider_in_person_slot_availability']) {
        await conn.execute(`UPDATE ${table} SET is_active=FALSE,updated_at=CURRENT_TIMESTAMP WHERE source_event_id=?`,[event.id]);
      }
      const result={choice,officeEventId:replacementId,originalOfficeEventId:Number(event.id)};
      await conn.execute(`INSERT INTO appointment_communications
        (appointment_id,agency_id,direction,channel,kind,body_preview,metadata_json,created_by_user_id)
        VALUES (?,?,'system','in_app','office_cancellation_choice',?,?,?)`,
      [appointment.id,appointment.agencyId,encrypt(choice==='keep'?'Client visit canceled; office reservation kept for reuse.':'Client visit canceled; office time released for other bookings.'),encrypt(JSON.stringify(result)),actorUserId]);
      return result;
    });
  }
  return {check,apply,reservation};
}
export const appointmentOfficeDisposition=createAppointmentOfficeDisposition();

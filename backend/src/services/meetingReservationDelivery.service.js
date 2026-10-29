import pool from '../config/database.js';
import { meetingReservations } from './meetingReservations.service.js';
import { reservationConfig as decode, reservationIso as iso, reservationSnapshot } from './meetingReservationPolicy.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { tenantMeetingBase } from '../utils/tenantMeetingUrl.js';
import { hasActiveMeetingMembership } from './meetingJoinPolicy.service.js';
import { meetingReminderSchedule } from './meetingReminderPolicy.js';
import { invalidateReplacementAvailability } from './privateReplacementSlots.service.js';

const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function reservationMessage(kind,{offer,invitee,event,url,hostName}) {
  const config=decode(offer.config_json), zone=config.timeZone;
  const format=value=>new Intl.DateTimeFormat('en-US',{dateStyle:'full',timeStyle:'short',timeZone:zone}).format(new Date(iso(value)));
  if(kind==='invitation')return {subject:config.subject,text:`${config.message}\n\nChoose one available time by ${format(offer.expires_at)} (${zone}). Your reservation schedules the meeting immediately. ${hostName} will reach out if there are any changes.\n\nReserve your time: ${url}\nThis invitation is for ${invitee.display_name}; please do not forward it.`};
  const canceled=event.status!=='ACTIVE';
  const heading=kind==='host_booking' ? `${invitee.display_name} reserved a time with you. No approval is needed.`
    : canceled ? 'This meeting has been canceled. Contact your host for another time.'
      : kind==='reminder' ? 'Reminder: your reserved meeting is coming up.'
        : kind==='change' ? 'Your reserved meeting details have changed.' : 'Your time has been reserved. Your host will reach out if there are any changes to their schedule.';
  const details=canceled ? '' : `\n\n${event.title}\n${format(event.start_at)} – ${new Intl.DateTimeFormat('en-US',{timeStyle:'short',timeZone:zone}).format(new Date(iso(event.end_at)))} (${zone})\n${event.google_meet_link ? `Virtual meeting: ${event.google_meet_link}` : `In person: ${event.location_text || config.location}`}`;
  return {subject:kind==='host_booking'?'A meeting time has been reserved':canceled?'Your reserved meeting was canceled':kind==='change'?'Your reserved meeting was updated':kind==='reminder'?'Reminder: your reserved meeting':'Your meeting time is reserved',
    text:`${heading}${details}\n\n${kind==='host_booking'?'Review this meeting in My Schedule':'View current details and add to your calendar'}: ${url}`};
}
async function sendEmail(input,hostNotice=false) {
  if(hostNotice) {
    const {ensureTenantNotificationsMailbox}=await import('./tenantMessageMailboxes.service.js');
    const {sendEmailFromIdentity}=await import('./unifiedEmail/unifiedEmailSender.service.js');
    const {notifications,domain}=await ensureTenantNotificationsMailbox(input.agencyId);
    return sendEmailFromIdentity({...input,senderIdentityId:notifications.id,replyToOverride:`noreply@${domain}`});
  }
  return (await import('./scheduleNotificationEmail.service.js')).sendScheduleNotificationEmail(input);
}
export function createMeetingReservationDelivery(overrides={}) {
  const d={database:pool,now:()=>new Date(),service:meetingReservations,membership:hasActiveMeetingMembership,base:tenantMeetingBase,
    decrypt:maybeDecryptNotePayload,sendEmail,invalidate:invalidateReplacementAvailability,notify:async input=>(await import('../models/Notification.model.js')).default.create(input),...overrides};
  const db=d.database;
  async function maintain() {
    const [expired]=await db.execute("SELECT id FROM meeting_reservation_offers WHERE status='open' AND expires_at<=UTC_TIMESTAMP() ORDER BY id LIMIT 50");
    for(const row of expired)await d.service.close(row.id);
    const [bookings]=await db.execute(`SELECT e.*,s.start_at reserved_start,s.end_at reserved_end,s.buffer_event_id FROM meeting_reservation_invitees i
      JOIN meeting_reservation_slots s ON s.id=i.slot_id JOIN provider_schedule_events e ON e.id=s.event_id
      WHERE i.slot_id IS NOT NULL AND (e.end_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) OR i.booking_snapshot IS NULL)
      ORDER BY e.start_at LIMIT 1000`);
    // Read the current claim before queuing messages, including reservations made during this tick.
    for(const booking of bookings) {
      const [[invitee]]=await db.execute('SELECT i.* FROM meeting_reservation_invitees i JOIN meeting_reservation_slots s ON s.id=i.slot_id WHERE s.event_id=?',[booking.id]);
      if(!invitee)continue;
      if(booking.buffer_event_id && (booking.status!=='ACTIVE' || iso(booking.start_at)!==iso(booking.reserved_start) || iso(booking.end_at)!==iso(booking.reserved_end))) {
        const [released]=await db.execute("UPDATE provider_schedule_events SET status='CANCELLED' WHERE id=? AND kind='SCHEDULE_HOLD' AND status='ACTIVE'",[booking.buffer_event_id]);
        if(released.affectedRows)await d.invalidate(db,booking.provider_id);
      }
      const snapshot=reservationSnapshot(booking);
      if(snapshot!==invitee.booking_snapshot) {
        if(!invitee.user_id && invitee.email)await d.service.queue(db,invitee.id,`change:${snapshot}`,'change');
        await db.execute('UPDATE meeting_reservation_invitees SET booking_snapshot=? WHERE id=?',[snapshot,invitee.id]);
      }
      // Employees and hosts use the existing configured-meeting reminder worker.
      if(invitee.user_id || !invitee.email || booking.status!=='ACTIVE' || new Date(iso(booking.start_at))<=d.now())continue;
      const due=meetingReminderSchedule(booking).filter(r=>r.at<=d.now() && r.at>=new Date(iso(invitee.booked_at))).sort((a,b)=>a.at-b.at);
      for(const reminder of due.slice(-1)) {
        await d.service.queue(db,invitee.id,`reminder:${reminder.key}:${iso(booking.start_at)}`,'reminder');
      }
    }
  }
  async function process({limit=50}={}) {
    await maintain();
    const size=Math.max(1,Math.min(100,Number(limit)||50));
    const [deliveries]=await db.execute(`SELECT * FROM meeting_reservation_deliveries WHERE status='pending' ORDER BY id LIMIT ${size}`);
    for(const delivery of deliveries) {
      const [claim]=await db.execute("UPDATE meeting_reservation_deliveries SET status='sending' WHERE id=? AND status='pending'",[delivery.id]);
      if(claim.affectedRows!==1)continue;
      let status='review',error=null,communicationId=null;
      try {
        const [[invitee]]=await db.execute('SELECT * FROM meeting_reservation_invitees WHERE id=?',[delivery.invitee_id]);
        const [[offer]]=await db.execute('SELECT * FROM meeting_reservation_offers WHERE id=?',[invitee.offer_id]);
        const [[host]]=await db.execute("SELECT id,role,CONCAT_WS(' ',first_name,last_name) name,COALESCE(NULLIF(work_email,''),email) email FROM users WHERE id=?",[offer.host_user_id]);
        const available=await d.membership(offer.agency_id,offer.host_user_id) && (!invitee.user_id || await d.membership(offer.agency_id,invitee.user_id));
        const inviting=['invitation','tag'].includes(delivery.kind);
        let event=null;
        if(invitee.slot_id)event=(await db.execute('SELECT e.* FROM meeting_reservation_slots s JOIN provider_schedule_events e ON e.id=s.event_id WHERE s.id=?',[invitee.slot_id]))[0][0];
        const stale=inviting ? invitee.slot_id || offer.status!=='open' || new Date(iso(offer.expires_at))<=d.now()
          : !event || (delivery.kind==='reminder' && (event.status!=='ACTIVE' || !delivery.delivery_key.endsWith(iso(event.start_at)) || new Date(iso(event.start_at))<=d.now()))
            || (['confirmation','change'].includes(delivery.kind) && !delivery.delivery_key.endsWith(reservationSnapshot(event)));
        if(!available || stale){status='obsolete';}
        else if(['tag','host_alert'].includes(delivery.kind)) {
          await d.notify({type:'team_meeting_scheduled',severity:'info',agencyId:offer.agency_id,
            userId:delivery.kind==='tag'?invitee.user_id:offer.host_user_id,
            title:delivery.kind==='tag'?'Choose a meeting time':'A meeting time has been reserved',
            message:delivery.kind==='tag'?`${host.name} invited you to choose a time for ${offer.title}. Open Offer meeting times from My Schedule.`:`${invitee.display_name} reserved ${offer.title}. The meeting is scheduled; no approval is needed.`,
            relatedEntityType:delivery.kind==='tag'?'meeting_reservation_invitation':'provider_schedule_event',relatedEntityId:delivery.kind==='tag'?invitee.id:event.id});status='sent';
        } else {
          const base=await d.base(offer.agency_id),hostNotice=delivery.kind==='host_booking';
          const url=hostNotice?`${base}/my-schedule?eventId=${event.id}&eventKind=TEAM_MEETING`
            :invitee.user_id?`${base}/meeting-times?invitation=${invitee.id}&agencyId=${offer.agency_id}`:`${base}/reserve-meeting/${d.decrypt(invitee.token_payload)}`;
          const content=reservationMessage(delivery.kind,{offer,invitee,event,url,hostName:host.name});
          const result=await d.sendEmail({agencyId:offer.agency_id,to:hostNotice?host.email:invitee.email,userId:hostNotice?host.id:invitee.user_id,
            generatedByUserId:offer.host_user_id,...content,html:`<p>${escape(content.text).replaceAll('\n','<br>')}</p>`,
            templateType:'meeting_reservation',source:'auto',relatedEntityType:'meeting_reservation_offer',relatedEntityId:offer.id},hostNotice);
          status=(result?.id || result?.messageId) && !result?.skipped && !result?.blocked && !result?.pendingApproval && !result?.queued && !result?.redirected?'sent':'held';
          communicationId=result?.communicationId || null;error=status==='sent'?null:result?.reason || 'Email delivery was held. Review the communication record.';
        }
      }catch(e){error=String(e.message).slice(0,500);}
      await db.execute("UPDATE meeting_reservation_deliveries SET status=?,communication_id=?,error_message=?,sent_at=IF(?='sent',UTC_TIMESTAMP(),NULL) WHERE id=?",[status,communicationId,error,status,delivery.id]);
    }
    return {processed:deliveries.length};
  }
  return {process,maintain};
}
export const meetingReservationDelivery=createMeetingReservationDelivery();

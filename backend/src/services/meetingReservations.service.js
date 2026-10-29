import { isDeepStrictEqual } from 'node:util';
import { randomBytes } from 'node:crypto';
import pool from '../config/database.js';
import { assertAppointmentWindowAvailable } from './appointmentConflict.service.js';
import { assertNoReviewTimeOverlap } from './supervisionReviewTime.service.js';
import { hasActiveMeetingMembership } from './meetingJoinPolicy.service.js';
import { invalidateReplacementAvailability } from './privateReplacementSlots.service.js';
import { defaultMeetingSettings } from './meetingSettingsPolicy.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { normalizeReservation, reservationWindows, reservationError as fail, reservationStaff, reservationConfig as decode,
  reservationHash, reservationSql as sqlDate, reservationIso as iso, assertReservationClaim, reservationSnapshot } from './meetingReservationPolicy.js';

export function createMeetingReservationService(overrides = {}) {
  const d={database:pool,now:()=>new Date(),membership:hasActiveMeetingMembership,checkWindow:assertAppointmentWindowAvailable,
    checkReview:assertNoReviewTimeOverlap,invalidate:invalidateReplacementAvailability,encrypt:maybeEncryptNotePayload,decrypt:maybeDecryptNotePayload,...overrides};
  const db=d.database;
  async function access(agencyId,actor) {
    if(!Number.isSafeInteger(Number(agencyId)) || Number(agencyId)<1)throw fail('Choose an agency.');
    if(!reservationStaff(actor) || !await d.membership(agencyId,actor.id)) throw fail('Sign in as an active employee of this agency.',403);
  }
  async function roster(agencyId,actor) {
    await access(agencyId,actor);
    const [rows]=await db.execute(`SELECT u.id,CONCAT_WS(' ',COALESCE(NULLIF(u.preferred_name,''),u.first_name),u.last_name) name,
      COALESCE(NULLIF(u.work_email,''),u.email) email FROM users u
      WHERE EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1) AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
      AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE_EMPLOYEE','ACTIVE','ONBOARDING')
      AND u.role NOT IN ('client','guardian','client_guardian','parent','family_member','school','school_staff','school_admin','school_support','kiosk','candidate','prehire')
      AND u.id<>? ORDER BY u.last_name,u.first_name`,[agencyId,actor.id]);
    return rows;
  }
  async function offer(id,actor,connection=db) {
    const [[row]]=await connection.execute('SELECT * FROM meeting_reservation_offers WHERE id=?',[id]);
    if(!row || Number(row.host_user_id)!==Number(actor?.id)) throw fail('Meeting offer not found.',404);
    await access(row.agency_id,actor);return row;
  }
  async function locked(userIds,work) {
    const conn=await db.getConnection(), held=[];
    try {
      for(const prefix of ['public-provider-selection:','supervision-time:']) for(const id of [...new Set(userIds.map(Number))].sort((a,b)=>a-b)) {
        const key=prefix+id, [[row]]=await conn.execute('SELECT GET_LOCK(?,5) acquired',[key]);
        if(Number(row?.acquired)!==1) throw fail('This schedule is being updated. Try again.',409);
        held.push(key);
      }
      return await work(conn);
    } finally {for(const key of held.reverse())await conn.execute('SELECT RELEASE_LOCK(?)',[key]).catch(()=>{});conn.release();}
  }
  async function check(conn,hostId,slot,timeZone,excludeEventId=null,otherUserId=null) {
    const ids=[hostId,...(otherUserId?[otherUserId]:[])];
    for(const id of ids) await d.checkWindow(conn,{providerUserId:id,startAt:sqlDate(slot.startAt || slot.start_at),endAt:sqlDate(slot.holdEndAt || slot.hold_end_at),sourceTimezone:timeZone,providerScheduleEventId:excludeEventId});
    await d.checkReview(conn,ids,sqlDate(slot.startAt || slot.start_at),sqlDate(slot.holdEndAt || slot.hold_end_at));
  }
  async function windows(input,actor) {
    await access(Number(input.agencyId),actor);
    const candidates=reservationWindows(input,d.now()), slots=[];
    for(const slot of candidates) {
      try {await check(db,actor.id,slot,input.timeZone);slots.push({...slot,available:true});}
      catch(e){if(e.status!==409)throw e;slots.push({...slot,available:false});}
    }
    return {slots};
  }
  async function save(input,actor,id=null) {
    const agencyId=Number(input.agencyId), people=await roster(agencyId,actor);
    const config=normalizeReservation(input,people,d.now());
    if(id) {
      const row=await offer(id,actor);
      if(row.status!=='draft' || Number(row.agency_id)!==agencyId) throw fail('Only an unpublished draft can be edited.',409);
      const [result]=await db.execute(`UPDATE meeting_reservation_offers SET title=?,config_json=?,expires_at=?,revision=revision+1
        WHERE id=? AND revision=? AND status='draft'`,[config.title,JSON.stringify(config),sqlDate(config.expiresAt),id,Number(input.revision)]);
      if(!result.affectedRows)throw fail('This draft changed. Reload it before editing.',409);
    } else {
      const [result]=await db.execute('INSERT INTO meeting_reservation_offers (agency_id,host_user_id,title,config_json,expires_at) VALUES (?,?,?,?,?)',
        [agencyId,actor.id,config.title,JSON.stringify(config),sqlDate(config.expiresAt)]);id=result.insertId;
    }
    return detail(id,actor);
  }
  async function queue(conn,inviteeId,key,kind) {
    await conn.execute('INSERT IGNORE INTO meeting_reservation_deliveries (invitee_id,delivery_key,kind) VALUES (?,?,?)',[inviteeId,key,kind]);
  }
  async function publish(id,input,actor) {
    const initial=await offer(id,actor);
    if(input.reviewed!==true || input.commitment!==true)throw fail('Review the invitations and confirm you can honor the offered times.');
    await locked([initial.host_user_id],async conn=>{
      await conn.beginTransaction();
      try {
        const [[row]]=await conn.execute('SELECT * FROM meeting_reservation_offers WHERE id=? FOR UPDATE',[id]);
        if(row.status==='open') {await conn.commit();return;}
        if(row.status!=='draft' || Number(row.revision)!==Number(input.revision))throw fail('This draft changed. Review it again.',409);
        const config=decode(row.config_json), current=normalizeReservation(config.editor,await roster(row.agency_id,actor),d.now());
        if(!isDeepStrictEqual(current,config))throw fail('The recipients or times changed. Review the draft again.',409);
        for(const s of config.slots) {
          await check(conn,row.host_user_id,s,config.timeZone);
          const [event]=await conn.execute(`INSERT INTO provider_schedule_events
            (agency_id,provider_id,kind,title,description,is_private,all_day,start_at,end_at,event_timezone,status,created_by_user_id,updated_by_user_id)
            VALUES (?,?,'SCHEDULE_HOLD',?,?,1,0,?,?,?,'ACTIVE',?,?)`,
            [row.agency_id,row.host_user_id,`Offered meeting time: ${row.title}`,`Meeting reservation offer #${id}. Manage from Offer meeting times.`,sqlDate(s.startAt),sqlDate(s.holdEndAt),config.timeZone,actor.id,actor.id]);
          await conn.execute('INSERT INTO meeting_reservation_slots (offer_id,start_at,end_at,hold_end_at,event_id) VALUES (?,?,?,?,?)',
            [id,sqlDate(s.startAt),sqlDate(s.endAt),sqlDate(s.holdEndAt),event.insertId]);
        }
        for(const r of config.recipients) {
          const token=randomBytes(32).toString('hex');
          const [insert]=await conn.execute(`INSERT INTO meeting_reservation_invitees
            (offer_id,user_id,recipient_key,display_name,email,token_hash,token_payload) VALUES (?,?,?,?,?,?,?)`,
            [id,r.userId,r.key,r.name,r.email,reservationHash(token),d.encrypt(token)]);
          if(r.email)await queue(conn,insert.insertId,'invitation','invitation');
          if(r.userId)await queue(conn,insert.insertId,'tag','tag');
        }
        await conn.execute("UPDATE meeting_reservation_offers SET status='open',revision=revision+1 WHERE id=?",[id]);
        await d.invalidate(conn,row.host_user_id);
        await conn.commit();
      } catch(e){await conn.rollback();throw e;}
    });
    return detail(id,actor);
  }
  async function list(agencyId,actor) {
    await access(agencyId,actor);
    const [offers]=await db.execute(`SELECT id,title,status,expires_at,revision FROM meeting_reservation_offers WHERE agency_id=? AND host_user_id=? ORDER BY id DESC LIMIT 100`,[agencyId,actor.id]);
    const [invitations]=await db.execute(`SELECT i.id,o.title,o.status,o.expires_at,i.slot_id FROM meeting_reservation_invitees i
      JOIN meeting_reservation_offers o ON o.id=i.offer_id WHERE o.agency_id=? AND i.user_id=? AND (o.status='open' OR i.slot_id IS NOT NULL) ORDER BY i.id DESC LIMIT 100`,[agencyId,actor.id]);
    return {offers:offers.map(o=>({...o,expires_at:iso(o.expires_at)})),invitations:invitations.map(o=>({...o,expires_at:iso(o.expires_at)}))};
  }
  async function detail(id,actor) {
    const row=await offer(id,actor), config=decode(row.config_json);
    const [slots]=await db.execute(`SELECT s.*,e.status event_status,e.start_at current_start,e.end_at current_end FROM meeting_reservation_slots s
      LEFT JOIN provider_schedule_events e ON e.id=s.event_id WHERE s.offer_id=? ORDER BY s.start_at`,[id]);
    const [recipients]=await db.execute('SELECT id,user_id,display_name,email,first_viewed_at,slot_id,booked_at FROM meeting_reservation_invitees WHERE offer_id=? ORDER BY id',[id]);
    const [deliveries]=await db.execute(`SELECT d.id,d.invitee_id,d.kind,d.status,d.sent_at,d.error_message,uc.opened_at FROM meeting_reservation_deliveries d
      JOIN meeting_reservation_invitees i ON i.id=d.invitee_id LEFT JOIN user_communications uc ON uc.id=d.communication_id WHERE i.offer_id=? ORDER BY d.id`,[id]);
    return {...row,expires_at:iso(row.expires_at),config_json:undefined,config,recipients,deliveries,
      slots:slots.map(s=>({...s,start_at:iso(s.start_at),end_at:iso(s.end_at),current_start:iso(s.current_start),current_end:iso(s.current_end)}))};
  }
  async function invitation(selector,actor,connection=db) {
    const byToken=typeof selector==='string';
    if(byToken && !/^[a-f0-9]{64}$/.test(selector))throw fail('Invitation not found.',404);
    const [[invitee]]=await connection.execute(`SELECT * FROM meeting_reservation_invitees WHERE ${byToken?'token_hash':'id'}=?`,[byToken?reservationHash(selector):selector]);
    if(!invitee)throw fail('Invitation not found.',404);
    const [[row]]=await connection.execute('SELECT * FROM meeting_reservation_offers WHERE id=?',[invitee.offer_id]);
    if(!row)throw fail('Invitation not found.',404);
    if(invitee.user_id) {
      if(!actor?.id)throw fail('Sign in with the employee account that received this invitation.',401);
      if(Number(actor.id)!==Number(invitee.user_id))throw fail('This invitation belongs to another employee.',403);
      await access(row.agency_id,actor);
    } else if(!byToken)throw fail('Use your private email invitation.',403);
    if(!await d.membership(row.agency_id,row.host_user_id))throw fail('The host is no longer available in this agency.',410);
    return {invitee,offer:row};
  }
  async function view(selector,actor) {
    const {invitee,offer:row}=await invitation(selector,actor), config=decode(row.config_json);
    await db.execute('UPDATE meeting_reservation_invitees SET first_viewed_at=COALESCE(first_viewed_at,UTC_TIMESTAMP()) WHERE id=?',[invitee.id]);
    let booking=null;
    if(invitee.slot_id) {
      const [[event]]=await db.execute(`SELECT e.* FROM meeting_reservation_slots s JOIN provider_schedule_events e ON e.id=s.event_id WHERE s.id=? AND s.offer_id=?`,[invitee.slot_id,row.id]);
      if(event)booking={eventId:event.id,status:event.status,title:event.title,startAt:iso(event.start_at),endAt:iso(event.end_at),location:event.location_text || '',meetingUrl:event.google_meet_link || ''};
    }
    const closed=row.status!=='open' || new Date(iso(row.expires_at))<=d.now();
    const [rows]=booking || closed ? [[]] : await db.execute(`SELECT s.id,s.start_at,s.end_at,s.hold_end_at,s.event_id FROM meeting_reservation_slots s
      JOIN provider_schedule_events e ON e.id=s.event_id AND e.kind='SCHEDULE_HOLD' AND e.status='ACTIVE'
      AND e.start_at=s.start_at AND e.end_at=s.hold_end_at WHERE s.offer_id=? AND s.status='open' AND s.start_at>UTC_TIMESTAMP() ORDER BY s.start_at`,[row.id]);
    const available=[];
    for(const slot of rows) {
      try {await check(db,row.host_user_id,slot,config.timeZone,slot.event_id,invitee.user_id);available.push(slot);}
      catch(e){if(e.status!==409)throw e;}
    }
    return {title:row.title,name:invitee.display_name,employee:!!invitee.user_id,timeZone:config.timeZone,modality:config.modality,
      location:config.location,expiresAt:iso(row.expires_at),closed,booking,slots:available.map(s=>({id:s.id,startAt:iso(s.start_at),endAt:iso(s.end_at)}))};
  }
  async function claim(selector,input,actor) {
    const initial=await invitation(selector,actor);
    if(initial.invitee.slot_id)return view(selector,actor);
    if(!Number.isSafeInteger(Number(input.slotId)) || Number(input.slotId)<1)throw fail('Choose an available time.');
    await locked([initial.offer.host_user_id,...(initial.invitee.user_id?[initial.invitee.user_id]:[])],async conn=>{
      await conn.beginTransaction();
      try {
        const {invitee,offer:row}=await invitation(selector,actor,conn);
        const [[current]]=await conn.execute('SELECT * FROM meeting_reservation_invitees WHERE id=? FOR UPDATE',[invitee.id]);
        if(current.slot_id){await conn.commit();return;}
        const [[slot]]=await conn.execute('SELECT * FROM meeting_reservation_slots WHERE id=? FOR UPDATE',[Number(input.slotId)]);
        const config=assertReservationClaim(row,current,slot,input.modality,d.now());
        const [[hold]]=await conn.execute('SELECT * FROM provider_schedule_events WHERE id=? FOR UPDATE',[slot.event_id]);
        if(!hold || hold.kind!=='SCHEDULE_HOLD' || hold.status!=='ACTIVE' || iso(hold.start_at)!==iso(slot.start_at) || iso(hold.end_at)!==iso(slot.hold_end_at))throw fail('The host changed this opening. Choose another time.',409);
        await check(conn,row.host_user_id,slot,config.timeZone,slot.event_id,current.user_id);
        const virtual=input.modality==='VIRTUAL',title=config.title,location=virtual?'':config.location,meetingUrl=virtual?config.meetingUrl:null;
        // Turn the held calendar entry into the actual meeting in the same transaction as the claim.
        await conn.execute(`UPDATE provider_schedule_events SET kind='TEAM_MEETING',meeting_subtype=?,title=?,description=?,end_at=?,
          location_text=?,google_meet_link=?,platform_video_link=0,notify_participants=1,attendance_tracking_enabled=1,
          meeting_settings_json=?,updated_by_user_id=? WHERE id=?`,
          [config.type,title,`Reserved by ${current.display_name}. ${virtual?'Virtual meeting.':'In-person meeting.'}`,sqlDate(slot.end_at),location,meetingUrl,JSON.stringify({...defaultMeetingSettings(config.type),reminders:[1440,60]}),row.host_user_id,slot.event_id]);
        if(current.user_id)await conn.execute('INSERT IGNORE INTO provider_schedule_event_attendees (event_id,user_id) VALUES (?,?)',[slot.event_id,current.user_id]);
        let bufferId=null;
        if(iso(slot.hold_end_at)>iso(slot.end_at)) {
          const [buffer]=await conn.execute(`INSERT INTO provider_schedule_events
            (agency_id,provider_id,kind,title,is_private,all_day,start_at,end_at,event_timezone,status,created_by_user_id,updated_by_user_id)
            VALUES (?,?,'SCHEDULE_HOLD','Gap after reserved meeting',1,0,?,?,?,'ACTIVE',?,?)`,
            [row.agency_id,row.host_user_id,sqlDate(slot.end_at),sqlDate(slot.hold_end_at),config.timeZone,row.host_user_id,row.host_user_id]);bufferId=buffer.insertId;
        }
        await conn.execute("UPDATE meeting_reservation_slots SET status='booked',buffer_event_id=? WHERE id=?",[bufferId,slot.id]);
        const snapshot=reservationSnapshot({...hold,status:'ACTIVE',title,end_at:slot.end_at,location_text:location,google_meet_link:meetingUrl});
        await conn.execute('UPDATE meeting_reservation_invitees SET slot_id=?,booked_at=UTC_TIMESTAMP(),booking_snapshot=? WHERE id=?',[slot.id,snapshot,current.id]);
        if(current.email)await queue(conn,current.id,`confirmation:${snapshot}`,'confirmation');
        await queue(conn,current.id,'host_booking','host_booking');
        await queue(conn,current.id,'host_alert','host_alert');
        for(const userId of new Set([row.host_user_id,current.user_id].filter(Boolean)))await d.invalidate(conn,userId);
        await conn.commit();
      }catch(e){await conn.rollback();throw e;}
    });
    return view(selector,actor);
  }
  async function close(id,actor=null) {
    const row=actor?await offer(id,actor):(await db.execute('SELECT * FROM meeting_reservation_offers WHERE id=?',[id]))[0][0];
    if(!row)return;
    await locked([row.host_user_id],async conn=>{
      await conn.beginTransaction();
      try {
        await conn.execute("UPDATE meeting_reservation_offers SET status='closed',revision=revision+1 WHERE id=? AND status IN ('draft','open')",[id]);
        await conn.execute(`UPDATE provider_schedule_events e JOIN meeting_reservation_slots s ON s.event_id=e.id
          SET e.status='CANCELLED' WHERE s.offer_id=? AND s.status='open' AND e.kind='SCHEDULE_HOLD'`,[id]);
        await conn.execute("UPDATE meeting_reservation_slots SET status='closed' WHERE offer_id=? AND status='open'",[id]);
        await conn.execute(`UPDATE meeting_reservation_deliveries d JOIN meeting_reservation_invitees i ON i.id=d.invitee_id
          SET d.status='obsolete' WHERE i.offer_id=? AND d.kind IN ('invitation','tag') AND d.status='pending'`,[id]);
        await d.invalidate(conn,row.host_user_id);
        await conn.commit();
      }catch(e){await conn.rollback();throw e;}
    });
    return actor?detail(id,actor):undefined;
  }
  return {access,roster,windows,save,publish,list,detail,invitation,view,claim,close,queue};
}
export const meetingReservations=createMeetingReservationService();

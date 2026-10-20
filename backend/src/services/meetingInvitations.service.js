import { createHash } from 'node:crypto';
import { resolveMeetingRecipient } from './meetingRecipientIdentity.service.js';
import { meetingReplyTo, meetingParticipantRows, meetingEmailDetails } from './meetingParticipants.service.js';
import pool from '../config/database.js';
import { generateJoinToken, joinUrlForTeamMeeting, joinUrlForSupervision } from '../utils/joinToken.js';
import { tenantMeetingBase } from '../utils/tenantMeetingUrl.js';
import { invitationKey, meetingInvitationContent, escapeMeetingHtml } from './meetingInvitationPolicy.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';
import { sendScheduleNotificationEmail } from './scheduleNotificationEmail.service.js';

export function normalizeInvitationEvent(event) {
  if (event.supervisor_user_id) return {...event,meeting_type:'supervision',provider_id:event.supervisor_user_id,title:'Supervision',event_timezone:event.event_timezone || 'America/Denver'};
  return event;
}
export async function personalMeetingInvitation(rawEvent, userId, { queue = false, resend = false } = {}) {
  const event = normalizeInvitationEvent(rawEvent);
  const key = invitationKey(event);
  await pool.execute(`INSERT INTO meeting_email_invitations
    (agency_id,provider_id,event_id,user_id,invitation_key,join_token,delivery_status,meeting_type,ready_at)
    VALUES (?,?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 90 SECOND))
    ON DUPLICATE KEY UPDATE
      ready_at=IF(delivery_status IN ('none','pending') AND VALUES(delivery_status)='pending',VALUES(ready_at),ready_at),
      delivery_status=IF(delivery_status='none' AND VALUES(delivery_status)='pending','pending',delivery_status)`,
  [event.agency_id,event.provider_id,event.id,userId,key,generateJoinToken(),queue?'pending':'none',event.meeting_type || 'team_meeting']);
  // An explicit live invitation may resend a delivered link, with a cooldown.
  // Approval/failed/cancelled deliveries are never silently retried here.
  if (queue && resend) await pool.execute(`UPDATE meeting_email_invitations SET ready_at=UTC_TIMESTAMP(),delivery_status='pending'
    WHERE invitation_key=? AND user_id=? AND (delivery_status IN ('none','pending') OR (delivery_status='sent' AND sent_at<UTC_TIMESTAMP()-INTERVAL 1 MINUTE))`,[key,userId]);
  const [rows] = await pool.execute('SELECT * FROM meeting_email_invitations WHERE invitation_key=? AND user_id=?',[key,userId]);
  return { ...rows[0], url: `${await tenantMeetingBase(event.agency_id)}/join/invitation/${encodeURIComponent(rows[0].join_token)}` };
}

export async function queueMeetingInvitations(event, userIds) {
  let failed = 0;
  for (const uid of new Set(userIds.map(Number).filter(Boolean))) {
    try { await personalMeetingInvitation(event,uid,{queue:true}); }
    catch (error) { failed++; console.warn('[Meeting invitation] Queue failed',event.id,uid,error.code || 'unknown'); }
  }
  return {failed};
}

// One change notice per person even when an entire series is moved/cancelled.
export async function sendMeetingScheduleChange(rawEvents, action, { scope = 'single', previousEvents = [] } = {}) {
  const previous = new Map(previousEvents.map(e => [Number(e.id),e]));
  const delivery = { sent:0, skipped:0, failed:0 };
  try {
  const recipients = new Map();
  for (const raw of rawEvents) {
    const event = normalizeInvitationEvent(raw);
    const supervision = event.meeting_type === 'supervision';
    const [attendees] = await pool.execute(supervision
      ? "SELECT user_id FROM supervision_session_attendees WHERE session_id=? AND status NOT IN ('REMOVED','WITHDRAWN','CANCELLED')"
      : 'SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=?',[event.id]);
    for (const uid of new Set([event.provider_id,event.co_facilitator_user_id,event.supervisee_user_id,...attendees.map(a=>a.user_id)].map(Number).filter(Boolean))) {
      if (!recipients.has(uid)) recipients.set(uid,[]);
      recipients.get(uid).push(event);
    }
  }
  for (const [uid,events] of recipients) {
    try {
      const [users] = await pool.execute('SELECT id,email,work_email,COALESCE(NULLIF(TRIM(preferred_name), SPACE(0)), first_name) AS first_name,last_name FROM users WHERE id=? AND COALESCE(is_active,1)=1 AND COALESCE(is_archived,0)=0 AND COALESCE(is_demo,0)=0',[uid]);
      if (!users[0]) continue;
      const first = events[0];
      const changeKey = createHash('sha256').update(JSON.stringify({action,scope,events:events.map(e=>[e.meeting_type,e.id,e.start_at,e.end_at,e.cancel_reason || '',previous.get(Number(e.id))?.start_at || null,previous.get(Number(e.id))?.end_at || null]).sort((a,b)=>a[1]-b[1])})).digest('hex');
      const recipientIdentity = await resolveMeetingRecipient({agencyId:first.agency_id,user:users[0]});
      const change = action === 'cancelled' ? 'cancelled' : 'updated';
      const joinUrl = change === 'cancelled' ? null : (await personalMeetingInvitation(first,uid)).url;
      const { parseUtcDate } = await import('../utils/officeEventDateTime.util.js');
      const format = e => Number(e.all_day) === 1 ? (e.start_date instanceof Date ? e.start_date.toISOString().slice(0,10) : String(e.start_date).slice(0,10)) : `${new Intl.DateTimeFormat('en-US',{weekday:'long',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:e.event_timezone || 'America/Denver'}).format(parseUtcDate(e.start_at))}–${new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:e.event_timezone || 'America/Denver'}).format(parseUtcDate(e.end_at))}`;
      const dates = events.map(e => `${format(e)}${e.cancel_reason && change==='cancelled' ? ` — ${e.cancel_reason}` : ''}`);
      const old = previous.get(Number(first.id));
      const heading = scope === 'future' ? `This and all future sessions in the series have been ${change}.` : `This session has been ${change}. Other dates in the series are unchanged.`;
      const text = `${first.meeting_type==='supervision' ? 'AuricWell · ' : ''}${first.title || 'Meeting'}\n${heading}\n${old && change==='updated' ? `Previously: ${format(old)}\nNew schedule:\n` : ''}${dates.join('\n')}\nTimes: ${first.event_timezone || 'America/Denver'}.\n${joinUrl ? `Your personal join link: ${joinUrl}` : 'The canceled dates will remain on your schedule for reference.'}`;
      // An atomic claim also covers concurrent/retried requests. A transport
      // failure is held for review instead of risking a second delivered email.
      const [claim] = await pool.execute("INSERT IGNORE INTO meeting_schedule_change_deliveries (change_key,user_id) VALUES (?,?)",[changeKey,uid]);
      if (!claim.affectedRows) { delivery.skipped++; continue; }
      try {
        const result = await sendScheduleNotificationEmail({agencyId:first.agency_id,triggerKey:change==='cancelled'?'meeting_cancelled':'meeting_rescheduled',to:recipientIdentity.email,subject:`${scope==='future'?'Series':'Session'} ${change}: ${first.title || 'Meeting'}`,text,html:`<p>${escapeMeetingHtml(text).replace(/\n/g,'<br>')}</p>${joinUrl?`<p><a href="${escapeMeetingHtml(joinUrl)}">Open your meeting</a></p>`:''}`,source:'auto',userId:uid,templateType:change==='cancelled'?'meeting_cancelled':'meeting_rescheduled'});
        const status = result?.pendingApproval ? 'approval' : result?.redirected || result?.queued || result?.blocked || result?.skipped ? 'held' : result?.id || result?.messageId ? 'sent' : 'held';
        await pool.execute('UPDATE meeting_schedule_change_deliveries SET delivery_status=? WHERE change_key=? AND user_id=?',[status,changeKey,uid]);
        if (status==='sent') delivery.sent++; else if (status==='approval') delivery.skipped++; else delivery.failed++;
      } catch(error) {
        await pool.execute("UPDATE meeting_schedule_change_deliveries SET delivery_status='review' WHERE change_key=? AND user_id=?",[changeKey,uid]);
        throw error;
      }
    } catch (error) { delivery.failed++; console.warn('[Meeting change] Delivery failed',uid,error.code || 'send_failed'); }
  }
  } catch (error) { delivery.failed++; console.warn('[Meeting change] Recipient lookup failed',error.code || 'unknown'); }
  return delivery;
}

// Re-check the live roster on every click/send. Removed invitees cannot reuse an old link.
export async function invitationEvents(invitation, { includeDeclined = false } = {}) {
  if (invitation.meeting_type === 'supervision') {
    const [rows] = await pool.execute(`SELECT s.*, COALESCE(s.event_timezone,(SELECT timezone FROM agencies WHERE id=s.agency_id),'America/Denver') AS event_timezone,
      EXISTS(SELECT 1 FROM supervision_session_join_presence presence WHERE presence.session_id=s.id
        AND presence.left_at IS NULL AND presence.last_seen_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE)) AS has_live_presence
      FROM supervision_sessions s
      JOIN supervision_sessions anchor ON anchor.id=?
      WHERE s.agency_id=? AND s.supervisor_user_id=? AND s.status IN ('SCHEDULED','IN_PROGRESS')
        AND EXISTS(SELECT 1 FROM agencies org WHERE org.id=s.agency_id AND org.is_active=1)
        AND (s.id=anchor.id OR (anchor.recurrence_series_id IS NOT NULL AND s.recurrence_series_id=anchor.recurrence_series_id))
        AND (s.supervisor_user_id=? OR s.co_facilitator_user_id=? OR s.supervisee_user_id=? OR
          EXISTS(SELECT 1 FROM supervision_session_attendees a WHERE a.session_id=s.id AND a.user_id=? AND a.status NOT IN (${includeDeclined ? '' : "'DECLINED',"}'REMOVED','CANCELLED','WITHDRAWN')))
        AND EXISTS(SELECT 1 FROM users u WHERE u.id=?
          AND (u.role IN ('super_admin','superadmin') OR EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND (ua.agency_id=s.agency_id OR JSON_CONTAINS(JSON_EXTRACT(s.meeting_settings_json,'$.audienceAgencyIds'),CAST(ua.agency_id AS JSON))) AND ua.is_active=1))
          AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED'))
      ORDER BY s.start_at,s.id`,[invitation.event_id,invitation.agency_id,invitation.provider_id,invitation.user_id,invitation.user_id,invitation.user_id,invitation.user_id,invitation.user_id]);
    return rows.map(normalizeInvitationEvent);
  }
  const [rows] = await pool.execute(`SELECT p.*,
    EXISTS(SELECT 1 FROM provider_schedule_event_join_presence presence WHERE presence.event_id=p.id
      AND presence.left_at IS NULL AND presence.last_seen_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE)) AS has_live_presence
    FROM provider_schedule_events p
    JOIN provider_schedule_events anchor ON anchor.id=?
    WHERE p.agency_id=? AND p.provider_id=? AND p.status='ACTIVE'
      AND EXISTS(SELECT 1 FROM agencies org WHERE org.id=p.agency_id AND org.is_active=1)
      AND p.kind IN ('TEAM_MEETING','HUDDLE')
      AND (p.id=anchor.id OR (anchor.recurrence_series_id IS NOT NULL AND p.recurrence_series_id=anchor.recurrence_series_id))
      AND (p.provider_id=? OR EXISTS(SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id=p.id AND a.user_id=?))
      AND EXISTS(SELECT 1 FROM users u WHERE u.id=?
        AND (u.role IN ('super_admin','superadmin') OR EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=p.agency_id AND ua.is_active=1))
        AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED'))
    ORDER BY COALESCE(p.start_at,p.start_date),p.id`,
  [invitation.event_id,invitation.agency_id,invitation.provider_id,invitation.user_id,invitation.user_id,invitation.user_id]);
  return rows;
}

export async function resolvePersonalMeetingInvitation(token, userId, now = new Date()) {
  if (!/^[\w-]{32}$/.test(String(token || ''))) throw Object.assign(new Error('Invitation not found.'),{status:404});
  const [rows] = await pool.execute('SELECT * FROM meeting_email_invitations WHERE join_token=?',[token]);
  const invitation = rows[0];
  if (!invitation) throw Object.assign(new Error('Invitation not found.'),{status:404});
  if (Number(invitation.user_id)!==Number(userId)) throw Object.assign(new Error('This invitation belongs to another account. Sign in with the account that received it.'),{status:403});
  const events = await invitationEvents(invitation);
  const { parseUtcDate } = await import('../utils/officeEventDateTime.util.js');
  const event = events.find(e => !e.meeting_completed_at && !e.live_ended_at && (parseUtcDate(e.end_at || e.end_date) > now || Number(e.has_live_presence)===1 || e.status==='IN_PROGRESS'));
  if (!event) throw Object.assign(new Error('This meeting has ended, was cancelled, or you are no longer invited.'),{status:410});
  const base = await tenantMeetingBase(event.agency_id);
  if ((invitation.meeting_type === 'supervision' && ['IN_PERSON','IN-PERSON'].includes(String(event.modality || '').toUpperCase()))
    || (invitation.meeting_type !== 'supervision' && event.platform_video_link != null && Number(event.platform_video_link)===0 && !event.google_meet_link)) {
    const tz = event.event_timezone || 'America/Denver';
    return {joinUrl:null,meeting:{title:event.title || 'Supervision',location:event.location_text || '',
      when:event.all_day ? String(event.start_date).slice(0,10) : `${new Intl.DateTimeFormat('en-US',{dateStyle:'full',timeStyle:'short',timeZone:tz}).format(parseUtcDate(event.start_at))} (${tz})`}};
  }
  if (invitation.meeting_type === 'supervision') return {joinUrl:joinUrlForSupervision(base,event.participant_join_token || event.join_token || event.id)};
  return { joinUrl: Number(event.platform_video_link) === 0 && event.google_meet_link
    ? event.google_meet_link : joinUrlForTeamMeeting(base,event.participant_join_token || event.join_token || event.id) };
}

// Durable, debounced series delivery. Only explicitly queued new invitations are sent;
// existing meetings are not bulk-emailed when this feature is deployed.
export async function sendDueMeetingInvitations() {
  const [rows] = await pool.execute(`SELECT * FROM meeting_email_invitations
    WHERE delivery_status='pending' AND ready_at<=UTC_TIMESTAMP() ORDER BY id LIMIT 100`);
  for (const invitation of rows) {
    const db = await pool.getConnection();
    const lock = `meeting-invite:${invitation.id}`;
    let acquired = false;
    try {
      const [locks] = await db.execute('SELECT GET_LOCK(?,0) AS acquired',[lock]);
      acquired = !!locks[0].acquired;
      if (!acquired) continue;
      const [fresh] = await db.execute("SELECT id FROM meeting_email_invitations WHERE id=? AND delivery_status='pending' AND ready_at<=UTC_TIMESTAMP()",[invitation.id]);
      if (!fresh.length) continue;
      const { parseUtcDate } = await import('../utils/officeEventDateTime.util.js');
      const events = (await invitationEvents(invitation)).filter(e => Number(e.notify_participants ?? 1)!==0 && parseUtcDate(e.end_at || e.end_date)>new Date());
      if (!events.length) {
        await db.execute("UPDATE meeting_email_invitations SET delivery_status='cancelled' WHERE id=?",[invitation.id]);
        continue;
      }
      const [users] = await db.execute('SELECT id,email,work_email,COALESCE(NULLIF(TRIM(preferred_name), SPACE(0)), first_name) AS first_name,last_name FROM users WHERE id IN (?,?)',[invitation.user_id,invitation.provider_id]);
      const recipient = users.find(u=>Number(u.id)===Number(invitation.user_id));
      const host = users.find(u=>Number(u.id)===Number(invitation.provider_id));
      if (!recipient?.email) continue;
      const recipientIdentity = await resolveMeetingRecipient({agencyId:invitation.agency_id,user:recipient});
      const joinUrl = `${await tenantMeetingBase(invitation.agency_id)}/join/invitation/${invitation.join_token}`;
      const participants = await meetingParticipantRows(events[0],{resolveEmails:events[0].meeting_subtype!=='training'});
      const preference = participants.find(person => Number(person.id) === Number(invitation.user_id));
      if (preference?.rsvp === 'declined') {
        await db.execute("UPDATE meeting_email_invitations SET delivery_status='cancelled' WHERE id=?",[invitation.id]);
        continue;
      }
      const content = meetingInvitationContent({events,joinUrl,recipientUserId:invitation.user_id,
        recipientRsvp:preference?.rsvp,recipientRequired:Number(preference?.is_required ?? 1)===1,
        hostName:[host?.first_name,host?.last_name].filter(Boolean).join(' '),participants,details:await meetingEmailDetails(events[0])});
      const result = (invitation.meeting_type === 'supervision' || events[0].kind==='HUDDLE')
        ? await (await import('./supervisionEmail.service.js')).sendSupervisionEmail({session:events[0],user:recipient,joinUrl})
        : await sendNotificationEmail({agencyId:invitation.agency_id,triggerKey:'meeting_invited',replyToOverride:await meetingReplyTo(events[0]),to:recipientIdentity.email,...content,source:'auto',userId:invitation.user_id,templateType:'meeting_invited'});
      if (!result?.skipped) await db.execute("UPDATE meeting_email_invitations SET delivery_status=?,sent_at=IF(?='sent',UTC_TIMESTAMP(),NULL),communication_id=? WHERE id=?",[result?.pendingApproval?'approval':'sent',result?.pendingApproval?'approval':'sent',result?.communicationId||null,invitation.id]);
      else await db.execute('UPDATE meeting_email_invitations SET ready_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR) WHERE id=?',[invitation.id]);
    } catch (error) {
      console.warn('[Meeting invitation] Delivery failed',invitation.id,error.code || 'send_failed');
      await db.execute('UPDATE meeting_email_invitations SET ready_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE) WHERE id=?',[invitation.id]);
    } finally {
      if (acquired) await db.execute('SELECT RELEASE_LOCK(?)',[lock]);
      db.release();
    }
  }
}

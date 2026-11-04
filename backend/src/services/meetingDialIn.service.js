import crypto from 'node:crypto';
import pool from '../config/database.js';
import { encryptChatText } from './chatEncryption.service.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { createOrGetMeetingRoom } from './video.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { dialInConfigured, dialInAssetsConfigured, dialInError, newPersonalPin, pinDigest, occurrenceKey, dialInDetails } from './meetingDialInPolicy.js';
import { dialInContext, admitDialInUser, dialInSchema } from './meetingDialInContext.service.js';
import { dialInTransport, pinPrompt, hostPrompt, callConversation, unavailableCall } from './meetingDialInTransport.service.js';

const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
const sqlTime = date => new Date(date).toISOString().slice(0,23).replace('T',' ');
export async function personalDialIn(type, meetingId, userId) {
  if (!dialInConfigured()) return null;
  const context = await dialInContext(type, meetingId, userId);
  const version = occurrenceKey(type, context.meeting);
  const pin = newPersonalPin(), encrypted = encryptChatText(pin);
  await pool.execute(`INSERT IGNORE INTO meeting_dial_in_invitations (meeting_type,meeting_id,user_id,occurrence_key,pin_hash,pin_encrypted)
    VALUES (?,?,?,?,?,?)`, [type,meetingId,userId,version,pinDigest(pin),JSON.stringify({_enc:true,keyId:encrypted.keyId,iv:encrypted.ivB64,tag:encrypted.authTagB64,ciphertext:encrypted.ciphertextB64})]);
  const [[row]] = await pool.execute('SELECT * FROM meeting_dial_in_invitations WHERE meeting_type=? AND meeting_id=? AND user_id=? AND occurrence_key=?', [type,meetingId,userId,version]);
  if (!row || row.revoked_at) throw dialInError('Telephone access is unavailable.');
  return { ...dialInDetails(maybeDecryptNotePayload(row.pin_encrypted), context.meeting, context.name), invitationId: row.id };
}
export async function callWithInvitation(id, db = pool) {
  const [[row]] = await db.execute(`SELECT c.*,i.meeting_type,i.meeting_id,i.user_id,i.occurrence_key,i.revoked_at
    FROM meeting_dial_in_calls c LEFT JOIN meeting_dial_in_invitations i ON i.id=c.invitation_id WHERE c.id=?`, [id]);
  return row;
}
export async function validateDialInCall(call, options = {}) {
  if (!call?.invitation_id || call.revoked_at || call.ended_at || ['ending','ended'].includes(call.state)) throw dialInError('Telephone access ended.',410);
  const context = await dialInContext(call.meeting_type, call.meeting_id, call.user_id, { joining: true, ...options });
  if (occurrenceKey(call.meeting_type, context.meeting) !== call.occurrence_key) throw dialInError('This meeting was rescheduled. Use its new invitation.',410);
  return context;
}
async function withCallLock(id, fn) {
  const db = await pool.getConnection();
  const lock = `meeting-phone:${id}`;
  try {
    const [[held]] = await db.execute('SELECT GET_LOCK(?,5) acquired',[lock]);
    if (!Number(held.acquired)) throw dialInError('Telephone joining is busy. Please retry.',503);
    return await fn(db);
  } finally { await db.execute('SELECT RELEASE_LOCK(?)',[lock]).catch(()=>{}); db.release(); }
}
export async function answerDialIn(event) {
  if (!dialInConfigured() || !uuid(event.uuid)) return unavailableCall();
  const bridgeId = event['SipHeader_X-Meeting-Call'];
  if (bridgeId) {
    // The random bridge credential binds this SIP leg to exactly one caller.
    const call = await callWithInvitation(bridgeId);
    if (!call || !['connecting','connected'].includes(call.state) || !event['SipHeader_X-Meeting-Bridge']
      || digest(event['SipHeader_X-Meeting-Bridge']) !== call.bridge_hash) return unavailableCall();
    try { await validateDialInCall(call); } catch (error) { if (error.status) return unavailableCall(); throw error; }
    const [saved] = await pool.execute(`UPDATE meeting_dial_in_calls SET bridge_uuid=? WHERE id=? AND ended_at IS NULL
      AND (bridge_uuid IS NULL OR bridge_uuid=?)`,[event.uuid,call.id,event.uuid]);
    if (!saved.affectedRows) return unavailableCall();
    return callConversation(call,true);
  }
  // Reject unexpected SIP calls, and never turn a callback into an outbound dialer.
  if (Object.keys(event).some(key=>/^SipHeader_/i.test(key)) || String(event.to).replace(/\D/g,'') !== process.env.MEETING_DIAL_IN_NUMBER.replace(/\D/g,'')) return unavailableCall();
  const callerHash = pinDigest(`caller:${event.from || 'private'}`);
  const [[abuse]] = await pool.execute(`SELECT COALESCE(SUM(attempts),0) attempts FROM meeting_dial_in_calls
    WHERE caller_hash=? AND invitation_id IS NULL AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR)`,[callerHash]);
  if (Number(abuse.attempts)>=15) return unavailableCall('Too many unsuccessful attempts. Contact the meeting host.');
  await pool.execute('INSERT IGNORE INTO meeting_dial_in_calls (id,caller_hash) VALUES (?,?)',[event.uuid,callerHash]);
  const call = await callWithInvitation(event.uuid);
  if (call.state !== 'pin') return resumeDialIn(call);
  return pinPrompt();
}
export async function enterDialInPin(event) {
  if (!dialInConfigured() || !uuid(event.uuid)) return unavailableCall();
  return withCallLock(event.uuid, async db => {
    const call = await callWithInvitation(event.uuid, db);
    if (!call) return unavailableCall();
    if (call.state !== 'pin') return resumeDialIn(call);
    if (Number(call.attempts)>=3) return unavailableCall();
    await db.execute('UPDATE meeting_dial_in_calls SET attempts=attempts+1 WHERE id=?',[call.id]);
    const pin = String(event.dtmf?.digits || '');
    const [[invitation]] = /^\d{10}$/.test(pin) ? await db.execute('SELECT * FROM meeting_dial_in_invitations WHERE pin_hash=? AND revoked_at IS NULL',[pinDigest(pin)]) : [[]];
    let context;
    try {
      if (!invitation) throw dialInError('Invalid PIN.');
      context = await validateDialInCall({...call,...{ invitation_id:invitation.id, meeting_type:invitation.meeting_type,meeting_id:invitation.meeting_id,user_id:invitation.user_id,occurrence_key:invitation.occurrence_key }});
    } catch (error) {
      if (!error.status) throw error;
      return Number(call.attempts)>=2 ? unavailableCall() : pinPrompt('That PIN is unavailable, or the meeting is not open. Enter your current personal PIN followed by pound.');
    }
    // Serialize admission by person to prevent two phones claiming the same identity.
    const personLock = `meeting-phone-person:${invitation.id}`;
    const [[held]] = await db.execute('SELECT GET_LOCK(?,5) acquired',[personLock]);
    if (!Number(held.acquired)) return unavailableCall('Your telephone connection is being prepared. Please try again.');
    try {
      const [active] = await db.execute("SELECT id FROM meeting_dial_in_calls WHERE invitation_id=? AND ended_at IS NULL AND state IN ('host-choice','waiting','connecting','connected') AND id<>?",[invitation.id,call.id]);
      if (active.length) return unavailableCall('Your personal PIN is already connected on another telephone. Hang up that call before joining again.');
      await db.execute('UPDATE meeting_dial_in_calls SET invitation_id=?,state=? WHERE id=?',[invitation.id,context.isHost?'host-choice':'waiting',call.id]);
    } finally { await db.execute('SELECT RELEASE_LOCK(?)',[personLock]); }
    if (context.isHost) return hostPrompt();
    await publishPhonePresence({...call,meeting_type:context.type,meeting_id:context.meeting.id,user_id:context.userId},context);
    return [{action:'talk',text:`Welcome, ${context.name}. Please wait while the host admits you. Your attendance begins when you enter the meeting.`},...callConversation(call)];
  });
}
async function resumeDialIn(call) {
  try { await validateDialInCall(call); }
  catch (error) { if (error.status) return unavailableCall(); throw error; }
  return call.state === 'host-choice' ? hostPrompt() : callConversation(call);
}
export async function chooseDialInHostOption(event) {
  if (!dialInConfigured() || !uuid(event.uuid)) return unavailableCall();
  return withCallLock(event.uuid, async db => {
    const call = await callWithInvitation(event.uuid,db);
    if (!call) return unavailableCall();
    if (call.state!=='host-choice') return resumeDialIn(call);
    const context = await validateDialInCall(call);
    if (!context.isHost) return unavailableCall();
    await db.execute("UPDATE meeting_dial_in_calls SET state='waiting',admit_invited_callers=? WHERE id=?",[event.dtmf?.digits==='1'?1:0,call.id]);
    await publishPhonePresence(call,context);
    return [{action:'talk',text:'Joining your meeting. Hang up to leave. End the meeting for everyone from the app when finished.'},...callConversation(call)];
  });
}
export async function publishPhonePresence(call, context) {
  if (!dialInConfigured()) return;
  const { schema } = context;
  await pool.execute(`INSERT INTO ${schema.presence} (${schema.foreign},join_identity,display_name,is_guest,joined_at,last_seen_at,left_at)
    VALUES (?,?,?,0,UTC_TIMESTAMP(),UTC_TIMESTAMP(),NULL) ON DUPLICATE KEY UPDATE
    joined_at=IF(left_at IS NULL,joined_at,UTC_TIMESTAMP()),last_seen_at=UTC_TIMESTAMP(),left_at=NULL,display_name=VALUES(display_name)`,
  [call.meeting_id,`dial-${call.user_id}`,`${context.name} · Phone`]);
}
async function autoAdmitFromPhoneHost(call) {
  const [hosts] = await pool.execute(`SELECT c.id FROM meeting_dial_in_calls c JOIN meeting_dial_in_invitations i ON i.id=c.invitation_id
    WHERE i.meeting_type=? AND i.meeting_id=? AND c.admit_invited_callers=1 AND c.state='connected' AND c.ended_at IS NULL
      AND c.last_verified_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 45 SECOND)`,[call.meeting_type,call.meeting_id]);
  for (const host of hosts) {
    try { if ((await validateDialInCall(await callWithInvitation(host.id))).isHost) return true; }
    catch (error) { if (!error.status) throw error; }
  }
  return false;
}
export async function reconcileDialInCall(id, transport = dialInTransport) {
  if (!dialInAssetsConfigured()) return;
  if (!dialInConfigured()) return endDialInCall(id, new Date(), transport);
  return withCallLock(id, async () => {
    let call = await callWithInvitation(id);
    if (!call) return;
    if (['ending','ended'].includes(call.state)) {
      if (call.connected_at && !call.attendance_synced_at) await refreshDialInAttendance(call);
      return disconnectDialIn(call,transport);
    }
    let context;
    try { context = await validateDialInCall(call); }
    catch (error) {
      if (!error.status) throw error;
      return endDialInCall(call.id, new Date(),transport);
    }
    const actual = await transport.getCall(call.id);
    if (['completed','failed','rejected','busy','timeout','cancelled','unanswered'].includes(actual.status)) return endDialInCall(call.id, actual.endTime || actual.end_time || new Date(),transport);
    if (!['answered','started'].includes(actual.status)) return;
    await pool.execute('UPDATE meeting_dial_in_calls SET last_verified_at=UTC_TIMESTAMP(3) WHERE id=? AND ended_at IS NULL',[id]);
    await publishPhonePresence(call,context);
    if (call.state === 'waiting') {
      if (!context.admitted && !await autoAdmitFromPhoneHost(call)) return;
      await admitDialInUser(context);
      const roomName = `${context.type==='supervision'?'supervision':context.meeting.kind==='HUDDLE'?'huddle':'team-meeting'}-${call.meeting_id}`;
      const room = await createOrGetMeetingRoom(context.type,call.meeting_id,roomName);
      // Room creation may outlive a short presence reservation. Recheck before
      // reserving the connecting bridge so another join cannot take this place.
      context=await validateDialInCall(await callWithInvitation(id));
      await admitDialInUser(context);
      const secret = crypto.randomBytes(24).toString('hex');
      await pool.execute("UPDATE meeting_dial_in_calls SET state='connecting',bridge_started_at=UTC_TIMESTAMP(3),video_session_id=?,bridge_hash=? WHERE id=? AND ended_at IS NULL",[room.sid,digest(secret),id]);
      call = await callWithInvitation(id);
      try {
        context=await validateDialInCall(call);
        const bridge = await transport.connect(call,context,secret);
        // Recheck after the external request. A host may have ended the meeting
        // while Vonage was connecting; never revive it with the late response.
        await pool.execute("UPDATE meeting_dial_in_calls SET video_connection_id=?,video_stream_id=?,disconnected_at=IF(ended_at IS NULL,disconnected_at,NULL),state=IF(ended_at IS NULL,state,'ending') WHERE id=?",[bridge.connectionId,bridge.streamId,id]);
        call = await callWithInvitation(id);
        context=await validateDialInCall(call);
      } catch (error) { await endDialInCall(id,new Date(),transport); throw error; }
    }
    call = await callWithInvitation(id);
    if (call.state === 'connecting' && call.bridge_uuid && call.video_stream_id) {
      const bridge = await transport.getCall(call.bridge_uuid);
      if (bridge.status === 'answered') {
        await pool.execute("UPDATE meeting_dial_in_calls SET state='connected',connected_at=COALESCE(connected_at,bridge_answered_at,UTC_TIMESTAMP(3)),last_verified_at=UTC_TIMESTAMP(3) WHERE id=? AND state='connecting' AND ended_at IS NULL",[id]);
      } else if (['completed','failed','rejected','busy','timeout','cancelled'].includes(bridge.status)) return endDialInCall(id,new Date(),transport);
    }
    call = await callWithInvitation(id);
    if (call.state==='connecting' && Date.now()-parseUtcDate(call.bridge_started_at || call.created_at).getTime()>60000) return endDialInCall(id,new Date(),transport);
    if (call.state === 'connected') {
      const bridge = await transport.getCall(call.bridge_uuid);
      if (!['answered','started'].includes(bridge.status)) return endDialInCall(id,bridge.endTime || bridge.end_time || new Date(),transport);
      const { syncDialInTranscription } = await import('./meetingDialInTranscription.service.js');
      if (context.type==='supervision') {
        await pool.execute("UPDATE supervision_sessions SET status='IN_PROGRESS' WHERE id=? AND status='SCHEDULED' AND live_ended_at IS NULL",[call.meeting_id]);
        await pool.execute("UPDATE supervision_session_attendees SET status='JOINED' WHERE session_id=? AND user_id=? AND status IN ('INVITED','SIGNED_UP','LEFT')",[call.meeting_id,call.user_id]);
      }
      await syncDialInTranscription(call,context,transport);
      await refreshDialInAttendance(call);
    }
  });
}
export async function refreshDialInAttendance(call) {
  if (!dialInAssetsConfigured()) return;
  if (call.meeting_type==='supervision') {
    const { recomputeAttendanceRollupForUser } = await import('./supervisionAttendanceRollup.service.js');
    const [[row]] = await pool.execute('SELECT start_at,live_ended_at FROM supervision_sessions WHERE id=?',[call.meeting_id]);
    await recomputeAttendanceRollupForUser({sessionId:call.meeting_id,userId:call.user_id,sessionStartAt:row.start_at,closeOpenAt:row.live_ended_at});
  } else {
    const { rebuildAttendanceRollupsFromSegments } = await import('./meetingAttendanceSegments.service.js');
    await rebuildAttendanceRollupsFromSegments(call.meeting_id,{syncClaims:!!call.ended_at});
  }
  await pool.execute('UPDATE meeting_dial_in_calls SET attendance_synced_at=UTC_TIMESTAMP(3) WHERE id=? AND ended_at <=> ?',[call.id,call.ended_at ? sqlTime(call.ended_at) : null]);
}
export async function endDialInCall(id, endedAt = new Date(), transport = dialInTransport) {
  if (!dialInAssetsConfigured()) return;
  const call = await callWithInvitation(id);
  if (!call) return;
  const timestamp = Math.min(Date.now(), parseUtcDate(endedAt)?.getTime() || Date.now());
  await pool.execute("UPDATE meeting_dial_in_calls SET ended_at=COALESCE(LEAST(ended_at,?),?),state=IF(disconnected_at IS NULL,'ending','ended'),audio_token_hash=NULL,attendance_synced_at=NULL WHERE id=?",[sqlTime(timestamp),sqlTime(timestamp),id]);
  const fresh = await callWithInvitation(id);
  if (call.invitation_id) {
    const s = dialInSchema(call.meeting_type);
    await pool.execute(`UPDATE ${s.presence} SET left_at=?,last_seen_at=? WHERE ${s.foreign}=? AND join_identity=?
      AND NOT EXISTS (SELECT 1 FROM meeting_dial_in_calls other WHERE other.invitation_id=? AND other.id<>? AND other.ended_at IS NULL AND other.state IN ('waiting','connecting','connected'))`,[sqlTime(timestamp),sqlTime(timestamp),call.meeting_id,`dial-${call.user_id}`,call.invitation_id,call.id]);
    if (call.connected_at) await refreshDialInAttendance(fresh).catch(error => console.warn('[meeting-dial-in] Attendance refresh needs retry',error.code || 'storage_unavailable'));
  }
  await disconnectDialIn(fresh,transport);
}
async function disconnectDialIn(call, transport) {
  if (call.disconnected_at) return;
  let failed = false;
  for (const id of [call.id,call.bridge_uuid].filter(Boolean)) {
    try { await transport.hangup(id); } catch (error) { if (![404,410].includes(Number(error?.response?.status || error?.status))) failed=true; }
  }
  for (const id of [call.video_connection_id,call.audio_connection_id].filter(Boolean)) {
    try { await transport.disconnect(call.video_session_id,id); } catch (error) { if (![404,410].includes(Number(error?.response?.status || error?.status))) failed=true; }
  }
  if (!failed) await pool.execute("UPDATE meeting_dial_in_calls SET state='ended',disconnected_at=UTC_TIMESTAMP(3),audio_status='off' WHERE id=?",[call.id]);
}
export async function dialInCallEvent(event) {
  if (!dialInAssetsConfigured() || !uuid(event.uuid)) return;
  if (event.status === 'answered') {
    const timestamp = Math.min(Date.now(), parseUtcDate(event.timestamp)?.getTime() || Date.now());
    await pool.execute(`UPDATE meeting_dial_in_calls SET bridge_answered_at=COALESCE(bridge_answered_at,?)
      WHERE bridge_uuid=? AND ended_at IS NULL`,[sqlTime(timestamp),event.uuid]);
    return;
  }
  if (!['completed','failed','rejected','busy','timeout','cancelled','unanswered'].includes(event.status)) return;
  const [calls] = await pool.execute('SELECT id FROM meeting_dial_in_calls WHERE id=? OR bridge_uuid=?',[event.uuid,event.uuid]);
  for (const call of calls) await endDialInCall(call.id,event.end_time || event.timestamp || new Date());
}
export async function endMeetingDialIn(type, meetingId, endedAt = new Date()) {
  if (!dialInAssetsConfigured()) return;
  // Persist revocation before requesting carrier disconnection. The worker
  // retries failed hangups and callbacks cannot re-admit revoked credentials.
  try {
    await pool.execute('UPDATE meeting_dial_in_invitations SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(3)) WHERE meeting_type=? AND meeting_id=?',[type,meetingId]);
    const [calls] = await pool.execute(`SELECT c.id FROM meeting_dial_in_calls c JOIN meeting_dial_in_invitations i ON i.id=c.invitation_id
      WHERE i.meeting_type=? AND i.meeting_id=? AND c.disconnected_at IS NULL`,[type,meetingId]);
    for (const call of calls) await endDialInCall(call.id,endedAt);
  } catch (error) {
    if (error.code==='ER_NO_SUCH_TABLE' && process.env.MEETING_DIAL_IN_ENABLED!=='true') return;
    throw error;
  }
}
export async function runMeetingDialInTick() {
  // No table access or call changes until the dedicated assets exist. With
  // assets retained, disabling new joins still closes already-running calls.
  if (!dialInAssetsConfigured()) return;
  let calls;
  try { [calls] = await pool.execute("SELECT id,state,created_at FROM meeting_dial_in_calls WHERE disconnected_at IS NULL OR (ended_at IS NOT NULL AND connected_at IS NOT NULL AND attendance_synced_at IS NULL) ORDER BY updated_at LIMIT 200"); }
  catch (error) { if (error.code==='ER_NO_SUCH_TABLE' && !dialInConfigured()) return; throw error; }
  const reconcile = async call => {
    try {
      if (!dialInConfigured()) { await endDialInCall(call.id); return; }
      if (['pin','host-choice'].includes(call.state)) {
        if (Date.now()-parseUtcDate(call.created_at).getTime()>120000) await endDialInCall(call.id);
        return;
      }
      await reconcileDialInCall(call.id);
    } catch (error) { console.warn('[meeting-dial-in] Reconciliation failed',error.code || 'carrier_or_storage_unavailable'); }
  };
  for (let i=0;i<calls.length;i+=4) await Promise.allSettled(calls.slice(i,i+4).map(reconcile));
}

import pool from '../config/database.js';
import {counselingClient} from './counselingInvitationAccess.service.js';
import {supervisionRecordingConsent} from './supervisionAgreement.service.js';
import SessionRecordingConsent from '../models/SessionRecordingConsent.model.js';
import {isChatEncryptionConfigured,encryptChatText} from './chatEncryption.service.js';
import {maybeDecryptNotePayload} from './clinicalNoteCrypto.service.js';
import {transcribeLongAudio} from './speechTranscription.service.js';
import SupervisionSessionArtifact from '../models/SupervisionSessionArtifact.model.js';
const fail=(message,status=403)=>{throw Object.assign(new Error(message),{status});};
export async function transcriptionState(context,db=pool) {
  const {type,client}=context;
  let session=context.session;
  const table=type==='counseling'?'counseling_sessions':'supervision_sessions';
  const [current]=await db.execute(`SELECT * FROM ${table} WHERE id=?`,[session.id]);if(!current[0])fail('Session not found.',404);session=current[0];
  if(type==='counseling' && Number((await counselingClient(session,db)).id)!==Number(client.id))fail('The appointment client changed. Open the current session again.',409);
  const closed=!!session.live_ended_at || ['ENDED','FINALIZED','CANCELLED','MISSED','RESCHEDULED','MANUAL_PENDING'].includes(String(session.status).toUpperCase());
  const consent=type==='supervision'?await supervisionRecordingConsent(session,db):{allowed:!!(Number(session.recording_requested)&&await SessionRecordingConsent.findOnFile({agencyId:session.agency_id,clientId:client.id},db)),reason:'The provider must request recording and the client must sign the audio consent first.'};
  if(type==='supervision'){
    const [anonymous]=await db.execute("SELECT COUNT(*) count FROM meeting_calendar_guests WHERE meeting_type='supervision' AND meeting_id=? AND status='admitted' AND expires_at>UTC_TIMESTAMP() AND last_seen_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 SECOND)",[session.id]);
    if(Number(anonymous[0]?.count)>0){consent.allowed=false;consent.reason='Calendar guests must use their personal invitation or sign in before supervision can be transcribed.';}
  }
  const [rows]=await db.execute('SELECT * FROM meeting_transcription_controls WHERE meeting_type=? AND meeting_id=?',[type,session.id]);
  const row=rows[0]||{};
  const configured=isChatEncryptionConfigured()&&!!(process.env.CLINICAL_AUDIO_BUCKET||process.env.PTONBOARDFILES);
  const [pending]=await db.execute('SELECT COUNT(*) AS count FROM meeting_transcription_publishers WHERE meeting_type=? AND meeting_id=? AND drained=0 AND last_seen_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 45 SECOND)',[type,session.id]);
  return {finishing:!!Number(row.finishing),pendingPublishers:Number(pending[0]?.count||0),consentAllowed:consent.allowed,configured,allowed:!closed&&consent.allowed&&configured,reason:closed?'This session is no longer recording.':!consent.allowed?consent.reason:!configured?'Secure transcription storage is not configured.':null,
    requested:!!Number(row.requested),paused:row.paused==null?true:!!Number(row.paused),stopped:!!Number(row.stopped),revision:Number(row.revision||0)};
}
export async function controlTranscription(context,action) {
  if(!['start','pause','resume','stop','finish','drained'].includes(action))fail('Choose start, pause, resume, or stop.',400);
  const state=await transcriptionState(context);
  if(action==='drained') {
    await pool.execute('UPDATE meeting_transcription_publishers SET drained=1 WHERE meeting_type=? AND meeting_id=? AND speaker_key=?',[context.type,context.session.id,context.speakerKey]);
    return transcriptionState(context);
  }
  if(action==='finish') {
    if(!context.isHost && !context.inPerson)fail('Only the facilitator can finish transcription.');
    await pool.execute('UPDATE meeting_transcription_controls SET finishing=1 WHERE meeting_type=? AND meeting_id=?',[context.type,context.session.id]);
    return transcriptionState(context);
  }
  if(state.finishing && ['start','resume'].includes(action))fail('Transcription is finishing.',409);
  if(['start','resume'].includes(action)&&!state.allowed)fail(state.reason);
  if(state.stopped&&action!=='stop')fail('Transcription was stopped for this session.',409);
  if(['start','stop'].includes(action)&&!context.isHost&&!(context.inPerson&&action==='start'))fail('Only the session facilitator can start or stop transcription.');
  // Both named participants may pause/resume. A revision invalidates in-flight
  // audio so it cannot be saved after a pause or withdrawal of consent.
  await pool.execute(`INSERT INTO meeting_transcription_controls (meeting_type,meeting_id,requested,paused,stopped,revision,changed_by_user_id,changed_by_role)
    VALUES (?,?,1,?,?,1,?,?) ON DUPLICATE KEY UPDATE requested=1,paused=VALUES(paused),stopped=GREATEST(stopped,VALUES(stopped)),revision=revision+1,changed_by_user_id=VALUES(changed_by_user_id),changed_by_role=VALUES(changed_by_role)`,
    [context.type,context.session.id,['pause','stop'].includes(action)?1:0,action==='stop'?1:0,context.userId||null,context.role]);
  if(context.type==='supervision'){
    await SupervisionSessionArtifact.ensureTagged({sessionId:context.session.id,updatedByUserId:context.userId});
    await pool.execute(`UPDATE supervision_session_artifacts SET transcript_paused=?,transcript_stopped_at=IF(?,UTC_TIMESTAMP(),transcript_stopped_at),transcript_stopped_by_user_id=IF(?,?,transcript_stopped_by_user_id) WHERE session_id=?`,
      [['pause','stop'].includes(action)?1:0,action==='stop'?1:0,action==='stop'?1:0,context.userId,context.session.id]);
  }
  return transcriptionState(context);
}
export async function appendMeetingAudio(context,{buffer,mimeType,revision,chunkKey}) {
  if(!buffer?.length||buffer.length>10*1024*1024)fail('Send an audio segment up to 10 MB.',400);
  if(!/^(audio\/(webm|ogg|wav|mpeg|mp4)|video\/webm)(;.*)?$/i.test(mimeType||''))fail('Unsupported audio format.',400);
  if(!/^[\w-]{8,80}$/.test(chunkKey||''))fail('An audio segment id is required.',400);
  const state=await transcriptionState(context);
  const ensure=(s)=>{if(!s.allowed||!s.requested||s.paused||s.stopped||s.revision!==Number(revision))fail(s.reason||'Transcription is paused or its consent changed.',409);};ensure(state);
  const [prior]=await pool.execute('SELECT id FROM meeting_transcription_chunks WHERE meeting_type=? AND meeting_id=? AND speaker_key=? AND chunk_key=?',[context.type,context.session.id,context.speakerKey,chunkKey]);
  if(prior.length)return {saved:true,duplicate:true};
  const text=String(await transcribeLongAudio({buffer,mimeType,languageCode:'en-US',userId:context.userId||context.session.provider_user_id,enableSpeakerDiarization:!!context.inPerson})).trim();
  ensure(await transcriptionState(context));
  if(!text)return {saved:true,empty:true};
  const stamped=`[${context.speakerLabel}] ${text}`;
  const encrypted=encryptChatText(stamped);
  const db=await pool.getConnection();
  try {
    await db.beginTransaction();
    // Serialize the final write with pause/stop; earlier revisions never commit
    // after a successful pause response, even when recognition was in flight.
    await db.execute('SELECT revision FROM meeting_transcription_controls WHERE meeting_type=? AND meeting_id=? FOR UPDATE',[context.type,context.session.id]);
    ensure(await transcriptionState(context,db));
    const [inserted]=await db.execute(`INSERT IGNORE INTO meeting_transcription_chunks (meeting_type,meeting_id,chunk_key,speaker_key,transcript_encrypted) VALUES (?,?,?,?,?)`,
      [context.type,context.session.id,chunkKey,context.speakerKey,JSON.stringify({_enc:true,keyId:encrypted.keyId,iv:encrypted.ivB64,tag:encrypted.authTagB64,ciphertext:encrypted.ciphertextB64})]);
    if(inserted.affectedRows && context.type==='supervision')await SupervisionSessionArtifact.appendTranscriptChunk({sessionId:context.session.id,text:stamped,updatedByUserId:context.userId},db);
    await db.commit();
  } catch(error){await db.rollback();throw error;} finally{db.release();}
  return {saved:true};
}
export async function meetingTranscript(type,sessionId) {
  const [rows]=await pool.execute('SELECT transcript_encrypted FROM meeting_transcription_chunks WHERE meeting_type=? AND meeting_id=? ORDER BY id',[type,sessionId]);
  return rows.map(r=>maybeDecryptNotePayload(r.transcript_encrypted)).join('\n');
}

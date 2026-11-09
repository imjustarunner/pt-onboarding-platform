import { parseMeetingSettings } from './meetingSettingsPolicy.js';
import { canJoinSupervision, canJoinTeamMeeting } from './meetingJoinPolicy.service.js';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import pool from '../config/database.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { transcriptionState, appendMeetingAudio } from './meetingTranscription.service.js';
import { requireSessionPrivacyConfiguration } from './sessionAiPrivacy.service.js';
import Artifact from '../models/ProviderScheduleEventArtifact.model.js';
import { callWithInvitation, validateDialInCall, endDialInCall } from './meetingDialIn.service.js';
import { dialInSchema } from './meetingDialInContext.service.js';
import { dialInConfigured, isDialInCallId } from './meetingDialInPolicy.js';

const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const active = s => s.allowed && s.requested && !s.paused && !s.stopped && !s.finishing;
function supervisionContext(call, context, finalCaptureAt = null) {
  return {type:'supervision',session:context.meeting,userId:call.user_id,isHost:context.isHost,
    role:context.isHost?'supervisor':'supervisee',speakerKey:`dial-${call.user_id}`,speakerLabel:`${context.name} · Phone`,dialInFinalCaptureAt:finalCaptureAt};
}
export async function phoneTranscriptionState(call, context, { initialize = false } = {}) {
  if (context.settings.transcription === false) return {allowed:false,requested:false};
  if (context.type==='supervision') {
    const c = supervisionContext(call,context);
    let state = await transcriptionState(c);
    if (initialize && state.allowed && !state.requested && !state.stopped && !state.finishing) {
      // Start only the first time, without undoing a browser pause or stop.
      await pool.execute(`INSERT IGNORE INTO meeting_transcription_controls
        (meeting_type,meeting_id,requested,paused,stopped,revision,changed_by_user_id,changed_by_role)
        VALUES ('supervision',?,1,0,0,1,?,'supervisor')`,[call.meeting_id,context.meeting.supervisor_user_id]);
      state = await transcriptionState(c);
    }
    return state;
  }
  requireSessionPrivacyConfiguration();
  await Artifact.ensureTagged({eventId:call.meeting_id});
  const artifact = await Artifact.findByEventId(call.meeting_id);
  const manual = context.meeting.kind==='TEAM_MEETING' && (context.meeting.meeting_subtype || 'general')==='general';
  return {allowed:!manual || !!artifact.transcript_started_at,requested:!manual || !!artifact.transcript_started_at,
    paused:!!Number(artifact.transcript_paused),stopped:!!artifact.transcript_stopped_at,revision:Number(artifact.transcript_revision||0)};
}
export async function syncDialInTranscription(call, context, transport) {
  if (!dialInConfigured()) return;
  let state;
  try { state=await phoneTranscriptionState(call,context,{initialize:true}); }
  catch { await pool.execute("UPDATE meeting_dial_in_calls SET audio_status='unavailable' WHERE id=?",[call.id]); return; }
  const stale = call.audio_token_hash && Date.now() - parseUtcDate(call.audio_last_seen_at || call.updated_at).getTime() > 45000;
  if (call.audio_token_hash && (!active(state) || Number(call.audio_revision)!==state.revision || stale)) {
    if (call.audio_connection_id) await transport.disconnect(call.video_session_id,call.audio_connection_id);
    await pool.execute("UPDATE meeting_dial_in_calls SET audio_connection_id=NULL,audio_token_hash=NULL,audio_connected_at=NULL,audio_status='off' WHERE id=?",[call.id]);
    return;
  }
  if (!active(state) || call.audio_token_hash) return;
  const secret=crypto.randomBytes(24).toString('hex');
  await pool.execute(`UPDATE meeting_dial_in_calls SET audio_token_hash=?,audio_revision=?,audio_connected_at=NULL,
    audio_last_seen_at=UTC_TIMESTAMP(3),audio_status='connecting' WHERE id=? AND ended_at IS NULL`,[hash(secret),state.revision,call.id]);
  try {
    await transport.speak(call.id,'Meeting transcription is on. Your speech will be included under your name.');
    const audio=await transport.connectAudio(call,secret);
    await pool.execute("UPDATE meeting_dial_in_calls SET audio_connection_id=?,disconnected_at=IF(ended_at IS NULL,disconnected_at,NULL),state=IF(ended_at IS NULL,state,'ending') WHERE id=?",[audio.connectionId,call.id]);
    const fresh=await callWithInvitation(call.id);
    if (fresh.ended_at) await endDialInCall(call.id,fresh.ended_at,transport);
  } catch {
    await pool.execute("UPDATE meeting_dial_in_calls SET audio_token_hash=NULL,audio_status='unavailable' WHERE id=?",[call.id]);
  }
}
export function pcmWav(pcm, rate = 16000) {
  const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);
  header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(rate,24);
  header.writeUInt32LE(rate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
  return Buffer.concat([header,pcm]);
}
export async function savePhoneAudio(call, context, pcm, revision, capturedAt, chunkKey) {
  if (!dialInConfigured()) return;
  const current = await callWithInvitation(call.id);
  const [[meeting]] = await pool.execute(`SELECT * FROM ${dialInSchema(call.meeting_type).table} WHERE id=?`,[call.meeting_id]);
  if (!current || !meeting || Number(current.user_id)!==Number(call.user_id)
    || Number(current.meeting_id)!==Number(call.meeting_id) || current.meeting_type!==call.meeting_type) return;
  if (parseMeetingSettings(meeting.meeting_settings_json).transcription === false) return;
  const allowed = call.meeting_type==='supervision' ? await canJoinSupervision(meeting,call.user_id) : await canJoinTeamMeeting(meeting,call.user_id);
  if (!allowed) return;
  const boundaries = [current?.ended_at, meeting?.live_ended_at, meeting?.meeting_completed_at].map(value=>parseUtcDate(value)?.getTime()).filter(Number.isFinite);
  const ended = boundaries.length ? Math.min(...boundaries) : null;
  if (!current || !meeting || Number(current.audio_revision)!==Number(revision) || (ended && Date.now()-ended>120000)) return;
  if (ended && capturedAt>ended) {
    // Keep only samples captured before closure; never lose the whole final
    // segment just because the hangup occurred between two 20 ms frames.
    const removeBytes = Math.ceil((capturedAt-ended)*16)*2;
    pcm=pcm.subarray(0,Math.max(0,pcm.length-removeBytes));capturedAt=ended;
  }
  if (!pcm.length) return;
  const buffer=pcmWav(pcm);
  if (call.meeting_type==='supervision') {
    await appendMeetingAudio(supervisionContext(call,context,capturedAt),{buffer,mimeType:'audio/wav',revision,chunkKey});
  } else {
    const { appendPhoneTeamMeetingAudio } = await import('../controllers/teamMeetings.controller.js');
    await appendPhoneTeamMeetingAudio({eventId:call.meeting_id,userId:call.user_id,buffer,revision,capturedAt});
  }
  if (meeting.live_ended_at || meeting.meeting_completed_at) {
    const { enqueueMeetingSummary } = await import('./meetingSummaryJobs.service.js');
    await enqueueMeetingSummary(call.meeting_type==='supervision'?'supervision':'team',call.meeting_id);
  }
}
// A separate authenticated stream per phone participant also works when no
// browser is present. Raw audio stays in bounded memory, never on local disk.
export function attachMeetingDialInAudio(server) {
  const wss=new WebSocketServer({noServer:true,maxPayload:128*1024,perMessageDeflate:false});
  server.on('upgrade',async(req,socket,head)=>{
    if (req.url!=='/api/meeting-dial-in/audio') return;
    socket.on('error',()=>{});
    try {
      if (!dialInConfigured()) throw new Error('disabled');
      const id=String(req.headers['x-meeting-call']||''),secret=String(req.headers['x-meeting-audio']||'');
      if (!isDialInCallId(id) || !/^[\da-f]{48}$/i.test(secret)) throw new Error('unauthorized');
      const call=await callWithInvitation(id),context=await validateDialInCall(call);
      if (call.state!=='connected' || hash(secret)!==call.audio_token_hash
        || req.headers['x-opentok-ws-sessionid']!==call.video_session_id) throw new Error('unauthorized');
      const state=await phoneTranscriptionState(call,context);
      if (!active(state) || state.revision!==Number(call.audio_revision)) throw new Error('paused');
      const [claim]=await pool.execute("UPDATE meeting_dial_in_calls SET audio_connected_at=UTC_TIMESTAMP(3),audio_status='active' WHERE id=? AND audio_connected_at IS NULL AND audio_token_hash=? AND ended_at IS NULL",[id,hash(secret)]);
      if (!claim.affectedRows) throw new Error('duplicate');
      wss.handleUpgrade(req,socket,head,ws=>consumePhoneAudio(ws,call,context,secret));
    } catch { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy(); }
  });
  return wss;
}
function consumePhoneAudio(ws,call,context,secret) {
  let buffers=[],bytes=0,lastFrameAt=0,pending=0,chain=Promise.resolve(),formatConfirmed=false,checking=false;
  let closing=false,drain=true;
  const tokenHash=hash(secret),revision=Number(call.audio_revision);
  const flush=()=>{
    if (!bytes) return;
    const data=Buffer.concat(buffers),capturedAt=lastFrameAt;buffers=[];bytes=0;
    if (pending>=4) { drain=false;ws.close(1013,'Transcription is busy');return; }
    pending++;
    chain=chain.then(()=>savePhoneAudio(call,context,data,revision,capturedAt,crypto.randomUUID()))
      .catch(async error=>{if(error.status!==409)await pool.execute("UPDATE meeting_dial_in_calls SET audio_status='unavailable' WHERE id=?",[call.id]).catch(()=>{});})
      .finally(()=>{pending--;});
  };
  ws.on('message',(data,binary)=>{
    if (closing) return;
    if (!binary) {
      try {const event=JSON.parse(data.toString());if(event.event==='websocket:connected')formatConfirmed=event['content-type']==='audio/l16;rate=16000';}catch{ws.close(1008,'Invalid audio format');}
      return;
    }
    if (!formatConfirmed || data.length%2) {ws.close(1008,'Invalid audio format');return;}
    buffers.push(data);bytes+=data.length;lastFrameAt=Date.now();
    if(bytes>=16000*2*12)flush();
  });
  const timer=setInterval(async()=>{
    if(checking || closing)return;checking=true;
    try {
      const fresh=await callWithInvitation(call.id);
      if(fresh?.ended_at){closing=true;ws.close();return;}
      const current=await validateDialInCall(fresh);
      const state=await phoneTranscriptionState(fresh,current);
      if(!active(state) || state.revision!==revision || fresh.audio_token_hash!==tokenHash){
        // Finishing may flush the final segment; pause/stop invalidates it.
        drain=!!state.finishing && !state.paused && !state.stopped && state.revision===revision;
        closing=true;ws.close();return;
      }
      await pool.execute('UPDATE meeting_dial_in_calls SET audio_last_seen_at=UTC_TIMESTAMP(3) WHERE id=? AND audio_token_hash=?',[call.id,tokenHash]);
      if(context.type==='supervision')await pool.execute(`INSERT INTO meeting_transcription_publishers (meeting_type,meeting_id,speaker_key,last_seen_at)
        VALUES ('supervision',?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE last_seen_at=UTC_TIMESTAMP(),drained=0`,[call.meeting_id,`dial-${call.user_id}`]);
    }catch{drain=false;ws.close();}finally{checking=false;}
  },1000);timer.unref();
  ws.on('error',()=>{});
  ws.on('close',()=>{
    closing=true;clearInterval(timer);if(drain)flush();else {buffers=[];bytes=0;}
    void chain.finally(async()=>{
      await pool.execute("UPDATE meeting_dial_in_calls SET audio_token_hash=NULL,audio_connected_at=NULL,audio_status=IF(audio_status='unavailable','unavailable','off') WHERE id=? AND audio_token_hash=?",[call.id,tokenHash]).catch(()=>{});
      if(context.type==='supervision')await pool.execute("UPDATE meeting_transcription_publishers SET drained=1 WHERE meeting_type='supervision' AND meeting_id=? AND speaker_key=?",[call.meeting_id,`dial-${call.user_id}`]).catch(()=>{});
    }).catch(()=>{});
  });
}

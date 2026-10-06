import multer from 'multer';
import pool from '../config/database.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import { assertLastMeetingHost } from '../services/meetingEndPermission.service.js';
import { isGroupSupervision, hasGroupTranscriptionConsent, acceptGroupTranscriptionConsent } from '../services/groupSupervisionConsent.service.js';
import {canJoinSupervision} from '../services/meetingJoinPolicy.service.js';
import {clientRecordingContext} from './counselingRecordingConsent.controller.js';
import {transcriptionState,controlTranscription,appendMeetingAudio} from '../services/meetingTranscription.service.js';
const fail=(message,status=403)=>{throw Object.assign(new Error(message),{status});};
export const meetingAudioUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1}});
export async function meetingTranscriptionContext(req) {
  if(req.params.sessionId){
    const {session,participantRole,client}=await clientRecordingContext(req);
    return {type:'counseling',session,client,role:participantRole,userId:req.user.id,isHost:participantRole==='provider',speakerKey:participantRole==='provider'?`user-${req.user.id}`:`client-${client.id}`,speakerLabel:participantRole==='provider'?'Provider':'Client'};
  }
  const session=await SupervisionSession.findById(Number(req.params.id));
  if(!session||!await canJoinSupervision(session,req.user.id))fail('Access denied.');
  const isHost=[Number(session.supervisor_user_id),Number(session.co_facilitator_user_id)].includes(Number(req.user.id));
  const inPerson=String(session.modality).toUpperCase()==='IN_PERSON';
  if(!inPerson){const[admitted]=await pool.execute('SELECT 1 FROM supervision_session_video_admissions WHERE session_id=? AND user_id=?',[session.id,req.user.id]);if(!admitted.length)fail('Join the main room before transcribing.');}
  if(['CANCELLED','MISSED','RESCHEDULED'].includes(String(session.status).toUpperCase()))fail('This session is unavailable.',410);
  return {type:'supervision',session,userId:req.user.id,isHost,inPerson,role:isHost?'supervisor':'supervisee',speakerKey:`user-${req.user.id}`,
    speakerLabel:inPerson?'In-person supervision':`${isHost?'Supervisor':'Supervisee'} · ${[req.user.first_name,req.user.last_name].filter(Boolean).join(' ')||req.user.id}`};
}
async function participantTranscriptionState(context) {
  const state = await transcriptionState(context);
  const consentRequired = context.type === 'supervision' && isGroupSupervision(context.session)
    && !await hasGroupTranscriptionConsent(context.session.id, context.userId);
  return { ...state, consentRequired, allowed: state.allowed && !consentRequired,
    reason: consentRequired ? 'Please agree to group transcription or leave the session.' : state.reason };
}
export async function getMeetingTranscription(req,res,next){try{
  const context=await meetingTranscriptionContext(req);
  if(req.query.capture==='1')await pool.execute(`INSERT INTO meeting_transcription_publishers (meeting_type,meeting_id,speaker_key,last_seen_at) VALUES (?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE last_seen_at=UTC_TIMESTAMP(),drained=IF(EXISTS(SELECT 1 FROM meeting_transcription_controls c WHERE c.meeting_type=VALUES(meeting_type) AND c.meeting_id=VALUES(meeting_id) AND c.finishing=1),drained,0)`,[context.type,context.session.id,context.speakerKey]);
  res.set('Cache-Control','no-store').json(await participantTranscriptionState(context));
}catch(e){next(e);}}
export async function setMeetingTranscription(req,res,next){try{
  const context = await meetingTranscriptionContext(req);
  if (req.body.action === 'accept-group-consent') {
    if (context.type !== 'supervision' || !isGroupSupervision(context.session) || req.body.accepted !== true) fail('Explicit group transcription consent is required.',400);
    await acceptGroupTranscriptionConsent(context.session.id, context.userId);
    return res.json(await participantTranscriptionState(context));
  }
  if (req.body.action === 'finish' && context.type === 'supervision' && !context.inPerson) {
    await assertLastMeetingHost('supervision',context.session.id,context.userId);
  }
  await controlTranscription(context,req.body.action);
  res.json(await participantTranscriptionState(context));
}catch(e){next(e);}}
export async function saveMeetingAudio(req,res,next){try{
  const context = await meetingTranscriptionContext(req);
  if (context.type === 'supervision' && isGroupSupervision(context.session) && !await hasGroupTranscriptionConsent(context.session.id,context.userId)) fail('Agree to group transcription before sending audio.');
  res.json(await appendMeetingAudio(context,{buffer:req.file?.buffer,mimeType:req.file?.mimetype,revision:req.body.revision,chunkKey:req.body.chunkKey}));
}catch(e){next(e);}}

import multer from 'multer';
import {logNoteAidChartEvent} from '../services/noteAidChartAudit.service.js';
import * as recording from '../services/clinicalSessionRecording.service.js';
const data=req=>({...req.query,...req.body});
const handler=fn=>async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(await fn(req));}catch(e){next(e);}};
export const sessionRecordingContext=handler(async req=>{const result=await recording.sessionRecordingState(req.user,data(req));await logNoteAidChartEvent(req,{agencyId:result.context.agencyId,clientId:result.context.clientId,action:'session_recording_context_viewed',metadata:{recordingId:result.recording?.id||null,clinicalSessionId:result.context.clinicalSessionId,officeEventId:result.context.officeEventId}});return result;});
export const setupClinicalSessionRecording=handler(req=>recording.setupSessionRecording(req.user,data(req)));
export const updateSessionRecordingParticipants=handler(req=>recording.changeRecordingParticipants(req.user,req.params.recordingId,data(req)));
export const prepareSessionRecordingConsent=handler(req=>recording.prepareRecordingConsent(req.user,req.params.recordingId,data(req)));
export const signSessionRecordingConsent=handler(req=>recording.signRecordingConsent(req.user,req.params.recordingId,req.params.participantId,data(req),{ip:req.ip,userAgent:req.get('user-agent')}));
export const assignSessionRecordingConsent=handler(req=>recording.assignRecordingConsent(req.user,req.params.recordingId,req.params.participantId,data(req)));
export const withdrawSessionRecordingConsent=handler(req=>recording.withdrawRecordingConsent(req.user,req.params.recordingId,req.params.participantId));
export const confirmClinicalSessionRecording=handler(req=>recording.confirmRecordingSession(req.user,req.params.recordingId,data(req)));
export const controlClinicalSessionRecording=handler(req=>recording.controlSessionRecording(req.user,req.params.recordingId,data(req)));
export const appendClinicalSessionRecordingAudio=handler(req=>recording.appendSessionRecordingAudio(req.user,req.params.recordingId,data(req),req.file));
export const getClinicalSessionRecordingNarrative=handler(async req=>{const input=data(req),result=await recording.getAuthorizedRecordingNarrative({user:req.user,...input,recordingId:req.params.recordingId});await logNoteAidChartEvent(req,{agencyId:Number(input.agencyId),clientId:Number(input.clientId),action:'session_recording_narrative_viewed',metadata:{recordingId:result.recordingId,clinicalSessionId:result.clinicalSessionId,officeEventId:result.officeEventId}});return result;});
export const finishClinicalSessionRecording=handler(req=>recording.finishSessionRecording(req.user,req.params.recordingId));
export async function getSessionRecordingConsentPdf(req,res,next){try{res.set({'Cache-Control':'no-store','Content-Type':'application/pdf'}).send(await recording.recordingConsentPdf(req.user,req.params.recordingId,req.params.participantId));}catch(e){next(e);}}
export const clinicalSessionAudioUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024}});

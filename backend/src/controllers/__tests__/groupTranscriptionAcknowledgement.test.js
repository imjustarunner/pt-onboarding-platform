import { beforeEach, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({has:vi.fn(),accept:vi.fn(),append:vi.fn(),control:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:async()=>[[{user_id:7}]]}}));
vi.mock('../../models/SupervisionSession.model.js',()=>({default:{findById:async()=>({id:101,session_type:'group',supervisor_user_id:1,status:'SCHEDULED'})}}));
vi.mock('../../services/meetingJoinPolicy.service.js',()=>({canJoinSupervision:async()=>true}));
vi.mock('../counselingRecordingConsent.controller.js',()=>({clientRecordingContext:vi.fn()}));
vi.mock('../../services/groupSupervisionConsent.service.js',()=>({isGroupSupervision:()=>true,hasGroupTranscriptionConsent:m.has,acceptGroupTranscriptionConsent:m.accept}));
vi.mock('../../services/meetingTranscription.service.js',()=>({transcriptionState:async()=>({allowed:true,requested:true}),controlTranscription:m.control,appendMeetingAudio:m.append}));
import {getMeetingTranscription,setMeetingTranscription,saveMeetingAudio} from '../meetingTranscription.controller.js';
beforeEach(()=>{vi.clearAllMocks();m.has.mockResolvedValue(false);});
function context(body={}){return {req:{params:{id:101},query:{},user:{id:7},body},res:{set:vi.fn().mockReturnThis(),json:vi.fn()},next:vi.fn()};}
it('shows consent required on the participant’s screen even if other people agreed',async()=>{
 const {req,res,next}=context();await getMeetingTranscription(req,res,next);
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({consentRequired:true,allowed:false}));expect(next).not.toHaveBeenCalled();
});
it('records only the authenticated person’s explicit agreement, including personal-link users',async()=>{
 const {req,res,next}=context({action:'accept-group-consent',accepted:true,userId:999});
 m.accept.mockImplementation(async()=>m.has.mockResolvedValue(true));await setMeetingTranscription(req,res,next);
 expect(m.accept).toHaveBeenCalledWith(101,7);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({consentRequired:false}));expect(m.control).not.toHaveBeenCalled();
});
it('rejects implicit agreement and does not process audio before agreement',async()=>{
 let c=context({action:'accept-group-consent'});await setMeetingTranscription(c.req,c.res,c.next);expect(c.next).toHaveBeenCalledWith(expect.objectContaining({status:400}));expect(m.accept).not.toHaveBeenCalled();
 c=context();await saveMeetingAudio(c.req,c.res,c.next);expect(c.next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.append).not.toHaveBeenCalled();
});

import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),control:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/SupervisionSession.model.js',()=>({default:{findById:async()=>({id:101,supervisor_user_id:7,co_facilitator_user_id:9,modality:'VIDEO',session_type:'group'})}}));
vi.mock('../../services/meetingJoinPolicy.service.js',()=>({canJoinSupervision:async()=>true}));
vi.mock('../../services/groupSupervisionConsent.service.js',()=>({isGroupSupervision:()=>true,hasGroupTranscriptionConsent:async()=>true,acceptGroupTranscriptionConsent:vi.fn()}));
vi.mock('../counselingRecordingConsent.controller.js',()=>({clientRecordingContext:vi.fn()}));
vi.mock('../../services/meetingTranscription.service.js',()=>({controlTranscription:m.control,transcriptionState:async()=>({allowed:true}),appendMeetingAudio:vi.fn()}));
import { setMeetingTranscription } from '../meetingTranscription.controller.js';
beforeEach(()=>{vi.clearAllMocks();});
it.each([[[7,9]],[[9]],[[]]])('does not finish transcription when present hosts are %j',async hosts=>{
  m.execute.mockImplementation(async sql=>[sql.includes('SELECT DISTINCT u.id')?hosts.map(id=>({id})):[{admitted:1}]]);
  const next=vi.fn();await setMeetingTranscription({params:{id:101},user:{id:7},body:{action:'finish'}},{json:vi.fn()},next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(m.control).not.toHaveBeenCalled();
});
it('allows the sole host to finish transcription',async()=>{
  m.execute.mockImplementation(async sql=>[sql.includes('SELECT DISTINCT u.id')?[{id:7}]:[{admitted:1}]]);
  const next=vi.fn();await setMeetingTranscription({params:{id:101},user:{id:7},body:{action:'finish'}},{json:vi.fn()},next);
  expect(next).not.toHaveBeenCalled();expect(m.control).toHaveBeenCalledWith(expect.objectContaining({userId:7}),'finish');
});

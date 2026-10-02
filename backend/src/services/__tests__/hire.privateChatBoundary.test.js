import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({access:vi.fn(),interview:vi.fn(),artifact:vi.fn(),save:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../hiringInterviewAccess.service.js',()=>({requireHiringInterviewAccess:m.access}));
vi.mock('../../models/HiringInterview.model.js',()=>({default:{findById:m.interview}}));
vi.mock('../../models/HiringInterviewArtifact.model.js',()=>({default:{findByInterviewId:m.artifact}}));
vi.mock('../hiringInterviewWorkspace.service.js',()=>({saveInterviewWorkspace:m.save,interviewArtifactForViewer:x=>x}));
import { getInterviewArtifacts, upsertInterviewArtifacts } from '../../controllers/interviewHub.controller.js';
beforeEach(()=>{vi.clearAllMocks();m.interview.mockResolvedValue({id:9,candidate_user_id:30});m.access.mockImplementation(async user=>{if(user?.id!==11)throw Object.assign(new Error('Only assigned interviewers'),{status:403});});m.artifact.mockResolvedValue({team_chat_json:[{text:'Private team discussion'}]});});
describe('private interviewer chat API',()=>{
 it.each([undefined,{id:30},{id:90}])('rejects anonymous, applicant and unrelated actors before reading or changing private chat',async user=>{
  for(const handler of [getInterviewArtifacts,upsertInterviewArtifacts]){
   const next=vi.fn(),res={json:vi.fn(),status:vi.fn().mockReturnThis()};
   await handler({params:{id:'9'},user,body:{teamMessage:{text:'Injected'}}},res,next);
   expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(res.json).not.toHaveBeenCalled();
  }
  expect(m.artifact).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();
 });
 it('retains private team messages for an authorized interviewer',async()=>{
  const res={json:vi.fn()},next=vi.fn();await getInterviewArtifacts({params:{id:'9'},user:{id:11}},res,next);
  expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({success:true,data:{team_chat_json:[{text:'Private team discussion'}]}});
 });
});

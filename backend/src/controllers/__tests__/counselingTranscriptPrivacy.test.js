import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),context:vi.fn(),transcript:vi.fn(),call:vi.fn(),writer:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{getConnection:async()=>({execute:m.execute,release:vi.fn()})}}));
vi.mock('../counselingRecordingConsent.controller.js',()=>({clientRecordingContext:m.context}));
vi.mock('../../services/meetingTranscription.service.js',()=>({meetingTranscript:m.transcript}));
vi.mock('../../models/Appointment.model.js',()=>({default:{findById:async()=>({serviceCode:'90837'})}}));
vi.mock('../../config/sessionRecordingAccess.js',()=>({resolveSessionRecordingNoteAid:()=>({toolId:'clinical_psychotherapy_note',serviceCode:'90837'})}));
vi.mock('../clinicalNoteGenerator.controller.js',()=>({generateClinicalNote:m.writer}));
vi.mock('../../services/geminiText.service.js',()=>({callGeminiText:m.call}));
vi.mock('google-auth-library',()=>({GoogleAuth:class{async getAccessToken(){return 'synthetic';}}}));
import {createCounselingTranscriptNote} from '../counselingTranscriptNote.controller.js';
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('GCP_PROJECT_ID','synthetic');vi.stubEnv('CLINICAL_AI_PRIVACY_APPROVED','true');vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({result:{findings:[]}})})));
 m.context.mockResolvedValue({session:{id:9,agency_id:2,appointment_id:4},participantRole:'provider',client:{id:3,full_name:'Amy Jones',initials:'AJ'}});
 m.execute.mockImplementation(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('SELECT recording_note')?[[{}]]:[[]]);
 m.transcript.mockResolvedValue('[Client] Amy Jones practiced with Pat Smith. '.repeat(700));
 m.call.mockResolvedValue({text:'Client practiced coping skills with Provider.',finishReason:'STOP'});
 m.writer.mockImplementation(async(req,res)=>res.json({draftId:5}));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const req=()=>({body:{},user:{id:7,first_name:'Pat',last_name:'Smith'}});
describe('client transcript to summary to clinical note',()=>{
 it('removes identities before the first summary and passes only roles to the final writer',async()=>{
  const next=vi.fn(),res={json:vi.fn(),status:vi.fn().mockReturnThis()};await createCounselingTranscriptNote(req(),res,next);
  expect(next).not.toHaveBeenCalled();expect(m.call).toHaveBeenCalled();
  for(const [args] of m.call.mock.calls){expect(args.prompt).not.toMatch(/Amy|Jones|Pat Smith|\bAJ\b/);expect(args.prompt).toContain('Client');expect(args.prompt).toContain('Provider');}
  expect(m.writer.mock.calls[0][0].body.inputText).toBe('Client practiced coping skills with Provider.');expect(res.json).toHaveBeenCalledWith({draftId:5,reviewRequired:true});
 });
 it('never summarizes raw transcript if privacy inspection is unavailable',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:false})));const next=vi.fn();await createCounselingTranscriptNote(req(),{json:vi.fn(),status:vi.fn()},next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:503}));expect(m.call).not.toHaveBeenCalled();expect(m.writer).not.toHaveBeenCalled();
 });
});

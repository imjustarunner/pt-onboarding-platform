vi.mock('../../controllers/phiDocuments.controller.js',()=>({listClientPhiDocuments:vi.fn(),viewPhiDocument:vi.fn()}));
import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({main:{execute:vi.fn()},clinical:{execute:vi.fn(),getConnection:vi.fn()},context:vi.fn(),supervisor:vi.fn(),sign:vi.fn(),write:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:m.main}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:m.clinical}));
vi.mock('../h0002ScreeningWorkflow.service.js',()=>({screeningReviewContext:m.context,screeningDate:()=> '2026-10-19',writeScreeningDetermination:m.write,proposedScreeningReview:vi.fn()}));
vi.mock('../serviceBillingSupervisor.service.js',()=>({resolveServiceSupervisor:m.supervisor}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:x=>`encrypted:${x}`,maybeDecryptNotePayload:x=>String(x).replace(/^encrypted:/,'')}));
vi.mock('../../controllers/medicalBilling.controller.js',()=>({signClinicalNote:m.sign}));
vi.mock('../geminiText.service.js',()=>({callGeminiText:vi.fn()}));
import {saveScreeningDraft,readScreeningDraft} from '../h0002ReviewDraft.service.js';
import {transferScreening,screeningTransferOptions} from '../h0002Transfer.service.js';
import {listClientPhiDocuments,viewPhiDocument} from '../../controllers/phiDocuments.controller.js';
import {hasScreeningDocumentRead} from '../h0002DocumentAccess.service.js';
import {signH0002ScreeningReview,getH0002SourceDocuments} from '../../controllers/h0002Screening.controller.js';
import {mergeMedicalRecordSources} from '../medicalRecordTimeline.service.js';
let db,context;
beforeEach(()=>{
 vi.resetAllMocks();
 context={session:{id:12,agency_id:2,client_id:5,provider_user_id:8},note:{id:99,created_by_user_id:8,metadata_json:{source:'h0002_digital_screening'}},source:{sourceLanguage:'es',sourceHash:'v1',task:{id:100},clientType:'school',schoolName:'Example School'}};
 m.context.mockResolvedValue(context);
 db={execute:vi.fn(async sql=>sql.includes('GET_LOCK')?[[{acquired:1}]]:sql.includes('server_uuid')?[[{serverId:'same'}]]:sql.includes('FOR UPDATE')?[[{created_by_user_id:8}]]:sql.includes('FROM clinical_claims')?[[]]:[{affectedRows:1}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
 m.clinical.getConnection.mockResolvedValue(db);m.clinical.execute.mockResolvedValue([{affectedRows:1}]);
 m.main.execute.mockImplementation(async sql=>sql.includes('DATABASE()')?[[{schemaName:'app',serverId:'same'}]]:sql.includes('SELECT DISTINCT')?[[{id:9,first_name:'Test',last_name:'Reviewer',credential:'LPC',languages_spoken:'Spanish'},{id:10,credential:'LPC',languages_spoken:'English'}]]:[{affectedRows:1}]);
 m.supervisor.mockResolvedValue({supervisorUserId:501,supervisorName:'Configured Supervisor'});
});
describe('saved screening work',()=>{
 it('encrypts edits, marks the queue started, and does not persist attestations',async()=>{const result=await saveScreeningDraft({sessionId:12,user:{id:8},input:{sourceHash:'v1',presentingProblem:'Reported worry',accurateAndComplete:true}});expect(result.review.revision).toBe(1);expect(result.review.accurateAndComplete).toBeUndefined();const args=m.clinical.execute.mock.calls[0][1];expect(args[0]).toMatch(/^encrypted:/);expect(readScreeningDraft({metadata_json:args[1]}).presentingProblem).toBe('Reported worry');expect(m.main.execute.mock.calls.some(([sql])=>sql.includes("status='started'"))).toBe(true);expect(db.release).toHaveBeenCalled();});
 it('rejects stale drafts without overwriting saved work',async()=>{context.note.metadata_json.screeningDraftEnc='encrypted:'+JSON.stringify({revision:2});await expect(saveScreeningDraft({sessionId:12,user:{id:8},input:{sourceHash:'v1',revision:1}})).rejects.toMatchObject({status:409});expect(m.clinical.execute).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalled();});
 it('does not race a save against signing or reassignment',async()=>{db.execute.mockResolvedValue([[{acquired:0}]]);await expect(saveScreeningDraft({sessionId:12,user:{id:8},input:{sourceHash:'v1'}})).rejects.toMatchObject({status:409});expect(m.context).not.toHaveBeenCalled();});
 it('does not overwrite signed notes',async()=>{context.note.provider_signed_at='2026-10-19';await expect(saveScreeningDraft({sessionId:12,user:{id:8},input:{sourceHash:'v1'}})).rejects.toMatchObject({status:409});expect(m.clinical.execute).not.toHaveBeenCalled();});
 it('keeps a queue failure retryable without advancing the encrypted draft revision',async()=>{m.main.execute.mockRejectedValue(new Error('queue failed'));await expect(saveScreeningDraft({sessionId:12,user:{id:8},input:{sourceHash:'v1'}})).rejects.toThrow('queue failed');expect(m.clinical.execute).not.toHaveBeenCalled();});
});
describe('screening forwarding',()=>{
 it('only offers Spanish-speaking providers with the existing supervisor',async()=>{expect((await screeningTransferOptions(context)).providers.map(p=>p.id)).toEqual([9]);m.supervisor.mockImplementation(async ({providerUserId})=>({supervisorUserId:providerUserId===8?501:502}));expect((await screeningTransferOptions(context)).providers).toEqual([]);});
 it('moves task, note, session and queue together before a claim exists',async()=>{expect(await transferScreening({sessionId:12,user:{id:8},providerUserId:9})).toMatchObject({providerUserId:9,supervisor:{id:501}});expect(db.commit).toHaveBeenCalledOnce();for(const table of ['.tasks','clinical_sessions','clinical_notes','.note_aid_work_queue_items'])expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE')&&sql.includes(table))).toBe(true);expect(db.rollback).not.toHaveBeenCalled();});
 it('rejects a noneligible target without mutating assignment',async()=>{await expect(transferScreening({sessionId:12,user:{id:8},providerUserId:10})).rejects.toMatchObject({status:409});expect(db.commit).not.toHaveBeenCalled();expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);});
 it('rolls back all updates on a write failure',async()=>{const run=db.execute.getMockImplementation();db.execute.mockImplementation((sql,args)=>sql.startsWith('UPDATE clinical_sessions')?Promise.reject(new Error('write failed')):run(sql,args));await expect(transferScreening({sessionId:12,user:{id:8},providerUserId:9})).rejects.toThrow('write failed');expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalled();});
 it('does not transfer an encounter with a claim',async()=>{const run=db.execute.getMockImplementation();db.execute.mockImplementation((sql,args)=>sql.includes('FROM clinical_claims')?[[{id:7}]]:run(sql,args));await expect(transferScreening({sessionId:12,user:{id:8},providerUserId:9})).rejects.toThrow('already has a claim');expect(db.commit).not.toHaveBeenCalled();});
});
describe('screening chart and signature',()=>{
 it('shows an unsigned draft without inventing a service date',()=>{const rows=mergeMedicalRecordSources({sessions:[{id:12,client_id:5,service_code:'H0002',metadata_json:{source:'h0002_digital_screening'},screening_note_id:99,screening_note_status:'draft',created_at:'2026-10-19'}]});expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({clinical_session_id:12,note_kind:'h0002_screening',note_status:'draft',service_date:''});});
 it('preserves Express audit headers and methods when delegating signing',async()=>{const headers={'x-forwarded-for':'127.0.0.1'};const req=Object.assign(Object.create({headers,get:()=> 'test'}),{params:{sessionId:12},body:{accurateAndComplete:true,medicalNecessityAttested:true},user:{id:8}});m.write.mockResolvedValue({id:99,agency_id:2});const next=vi.fn();await signH0002ScreeningReview(req,{},next);expect(next).not.toHaveBeenCalled();expect(m.sign.mock.calls[0][0].headers).toBe(headers);expect(m.sign.mock.calls[0][0].get()).toBe('test');});
});


describe('screening document controller',()=>{
 it('creates a client-bound read request after reviewer authorization and retains audit context',async()=>{
  Object.assign(context.source,{client:{id:5},task:{assigned_to_user_id:8,assigned_to_agency_id:2}});
  const req=Object.assign(Object.create({get:()=> 'audit-agent'}),{params:{sessionId:12},user:{id:8}});const next=vi.fn();
  await getH0002SourceDocuments(req,{},next);expect(next).not.toHaveBeenCalled();
  const read=listClientPhiDocuments.mock.calls[0][0];expect(read.params.clientId).toBe('5');expect(read.get()).toBe('audit-agent');expect(hasScreeningDocumentRead(read,{id:5,agency_id:2})).toBe(true);expect(hasScreeningDocumentRead(req,{id:5,agency_id:2})).toBe(false);
 });
 it('does not open documents when the user cannot review the screening',async()=>{
  m.context.mockRejectedValue(Object.assign(new Error('Access denied'),{status:403}));const next=vi.fn();await getH0002SourceDocuments({params:{sessionId:12,documentId:4},user:{id:9}},{},next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(viewPhiDocument).not.toHaveBeenCalled();
 });
});

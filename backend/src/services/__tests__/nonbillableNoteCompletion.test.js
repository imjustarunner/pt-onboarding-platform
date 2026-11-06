process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32).toString('base64');
import {beforeEach,it,expect,vi} from 'vitest';
const risk=vi.hoisted(()=>({required:false,execute:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:risk.execute}}));
beforeEach(()=>{risk.required=false;risk.execute.mockImplementation(async()=>[[{required:risk.required?1:0}]]);});
import {assertNarrivaRiskBeforeSignature} from '../narrivaRiskAssessment.service.js';
import crypto from 'node:crypto';
vi.mock('../../config/clinicalDatabase.js',()=>({default:{}}));
vi.mock('../noteAidTermination.service.js',()=>({validateTermination:value=>{if(!value?.reason)throw new Error('Reason required');},validateTerminationContent:value=>{if(!value)throw new Error('Content required');}}));
import {completeNonbillableReview,completeMissedSessionDocumentation,missedNote} from '../nonbillableNoteCompletion.service.js';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function fixture(extra={}){const note={id:5,agency_id:2,client_id:12,created_by_user_id:45,note_type:'TERMINATION',note_payload:'Completed clinical review',metadata_json:{termination:{reason:'client_choice'}},...extra};const session={id:note.clinical_session_id||30,agency_id:2,client_id:12,metadata_json:{}};const db={execute:vi.fn(async sql=>sql.startsWith('SELECT * FROM clinical_sessions')?[[session]]:sql.startsWith('SELECT')?[[note]]:[{affectedRows:1}]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};return {note,session,db,deps:{database:{getConnection:async()=>db},finishTermination:vi.fn(),riskGate:vi.fn(async()=>{})}};}
const input={noteId:5,agencyId:2,actorUserId:45,confirmed:true,expectedHash:hash('Completed clinical review')};
it('stores author/time/content review without forging a signature and completes lifecycle',async()=>{const f=fixture();const result=await completeNonbillableReview(input,f.deps);expect(result.signedAt).toBeNull();expect(f.db.execute.mock.calls.find(([q])=>q.startsWith('UPDATE'))[0]).not.toContain('provider_signed_at');expect(f.deps.finishTermination).toHaveBeenCalledWith(expect.objectContaining({content_review_source:'provider_review',is_billable:0}));});
it.each([{actorUserId:46},{confirmed:false},{expectedHash:hash('stale')}])('rejects wrong author, missing review or stale content: %j',async patch=>{const f=fixture();await expect(completeNonbillableReview({...input,...patch},f.deps)).rejects.toThrow();expect(f.deps.finishTermination).not.toHaveBeenCalled();});
it('does not convert a progress note into review-only',async()=>{const f=fixture({note_type:'PROGRESS_NOTE'});await expect(completeNonbillableReview(input,f.deps)).rejects.toThrow(/does not use/);});
it('retries lifecycle after persisted review without recording a new review',async()=>{const f=fixture({content_review_source:'provider_review',content_review_json:{reviewedAt:'2026-10-21',reviewedByUserId:45}});await completeNonbillableReview(input,f.deps);expect(f.db.execute.mock.calls.filter(([q])=>q.startsWith('UPDATE'))).toHaveLength(0);expect(f.deps.finishTermination).toHaveBeenCalledTimes(1);});
it('identifies only explicit nonattendance note types/events',()=>{expect(missedNote({note_type:'PROGRESS_NOTE'})).toBe(false);expect(missedNote({note_type:'APPOINTMENT_CHANGE',metadata_json:{eventType:'rescheduled'}})).toBe(false);expect(missedNote({note_type:'MISSED_APPOINTMENT'})).toBe(true);});
it('requires the existing completed missed note flow and never fabricates a chart entry',async()=>{
  const session={id:30,agency_id:2,client_id:12,provider_user_id:45,scheduled_end_at:'2026-01-01'};
  const db={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{},execute:vi.fn(async sql=>{
    if(sql.startsWith('SELECT * FROM clinical_sessions'))return [[session]];
    if(sql.startsWith('SELECT * FROM clinical_notes'))return [[{id:51,note_type:'MISSED_APPOINTMENT',content_review_source:'provider_review'}]];
    if(sql.startsWith('SELECT id'))return [[]];return [{affectedRows:1}];
  })};const source={getConnection:async()=>db};
  await expect(completeMissedSessionDocumentation({session,providerUserId:45},source,{riskGate:vi.fn(async()=>{})})).rejects.toThrow(/note flow first/);
  expect(await completeMissedSessionDocumentation({session,providerUserId:45,noteId:51},source,{riskGate:vi.fn(async()=>{})})).toEqual({noteId:51});
  expect(db.execute.mock.calls.filter(([q])=>q.startsWith('INSERT'))).toHaveLength(0);
});

it.each(['TERMINATION','MISSED_APPOINTMENT'])('cannot complete %s review by stripping mandatory-risk branding metadata',async note_type=>{
  const f=fixture({note_type,clinical_session_id:30,metadata_json:note_type==='TERMINATION'?{termination:{reason:'client_choice'}}:{}});risk.required=true;f.deps.riskGate=assertNarrivaRiskBeforeSignature;
  await expect(completeNonbillableReview(input,f.deps)).rejects.toMatchObject({status:409,code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});
  expect(f.db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);expect(f.db.rollback).toHaveBeenCalled();expect(f.deps.finishTermination).not.toHaveBeenCalled();
});
it('does not replay lifecycle completion for an old reviewed note with a newly persisted risk requirement',async()=>{
 const f=fixture({clinical_session_id:30,content_review_source:'provider_review'});risk.required=true;f.deps.riskGate=assertNarrivaRiskBeforeSignature;
 await expect(completeNonbillableReview(input,f.deps)).rejects.toMatchObject({code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});expect(f.deps.finishTermination).not.toHaveBeenCalled();
});
it('allows review-only completion after the actual required assessment is completed',async()=>{
 const f=fixture({clinical_session_id:30,metadata_json:{termination:{reason:'client_choice'},narrivaContext:{riskAssessmentCompleted:true},structuredChart:{riskAssessment:{patientDeniesAll:true}}}});risk.required=true;f.deps.riskGate=assertNarrivaRiskBeforeSignature;
 await expect(completeNonbillableReview(input,f.deps)).resolves.toMatchObject({reviewed:true,signedAt:null});expect(f.deps.finishTermination).toHaveBeenCalled();
});
it('checks persisted risk before missed-session attendance finalization, including previously reviewed notes',async()=>{
 risk.required=true;const session={id:30,agency_id:2,client_id:12,provider_user_id:45,scheduled_end_at:'2026-01-01'};const note={id:51,agency_id:2,clinical_session_id:30,note_type:'MISSED_APPOINTMENT',content_review_source:'provider_review',metadata_json:{}};
 const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>sql.startsWith('SELECT * FROM clinical_sessions')?[[session]]:sql.startsWith('SELECT * FROM clinical_notes')?[[note]]:sql.startsWith('SELECT id')?[[]]:[{affectedRows:1}])};
 await expect(completeMissedSessionDocumentation({session,providerUserId:45,noteId:51},{getConnection:async()=>db},{riskGate:assertNarrivaRiskBeforeSignature})).rejects.toMatchObject({code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);expect(db.rollback).toHaveBeenCalled();
});

it.each(['TERMINATION','MISSED_APPOINTMENT'])('blocks %s review while the actual encounter service change is pending',async note_type=>{
 const f=fixture({note_type,clinical_session_id:30,metadata_json:note_type==='TERMINATION'?{termination:{reason:'client_choice'}}:{}});f.session.metadata_json={serviceCodeChangePending:{changeId:42,from:'H0004',to:'H2011'}};
 await expect(completeNonbillableReview(input,f.deps)).rejects.toMatchObject({status:409,code:'CLINICAL_SERVICE_CHANGE_PENDING'});expect(f.db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);expect(f.deps.finishTermination).not.toHaveBeenCalled();expect(f.db.rollback).toHaveBeenCalled();
});
it('checks the actual locked missed encounter rather than the stale supplied session',async()=>{
 const session={id:30,agency_id:2,client_id:12,provider_user_id:45,scheduled_end_at:'2026-01-01',metadata_json:{}};const current={...session,metadata_json:JSON.stringify({serviceCodeChangePending:{changeId:42}})};
 const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>sql.startsWith('SELECT * FROM clinical_sessions')?[[current]]:[[]])};
 await expect(completeMissedSessionDocumentation({session,providerUserId:45,noteId:51},{getConnection:async()=>db},{riskGate:vi.fn(async()=>{})})).rejects.toMatchObject({code:'CLINICAL_SERVICE_CHANGE_PENDING'});expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
it('keeps review-only completion available after the service synchronization marker is cleared',async()=>{
 const f=fixture({clinical_session_id:30});f.session.metadata_json={serviceCodeChangePending:null};await expect(completeNonbillableReview(input,f.deps)).resolves.toMatchObject({ok:true,reviewed:true,signedAt:null});
});

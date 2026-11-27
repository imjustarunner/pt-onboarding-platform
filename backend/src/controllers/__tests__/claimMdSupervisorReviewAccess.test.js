import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({clinical:vi.fn(),main:vi.fn(),mainConnection:vi.fn(),find:vi.fn(),access:vi.fn(),policy:vi.fn(),mutation:vi.fn(),staff:vi.fn(),flags:vi.fn(),ensureHistory:vi.fn(),summary:vi.fn(),appendReview:vi.fn(),agencies:vi.fn(),revisionWork:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.clinical}}));
vi.mock('../../config/database.js',()=>({default:{execute:m.main,getConnection:m.mainConnection},onTableWrite:vi.fn()}));
vi.mock('../../models/clinical/ClinicalNote.model.js',()=>({default:{findById:m.find}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:m.agencies}}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.access}}));
vi.mock('../../services/supervisedBillingPolicy.service.js',()=>({resolveNoteDocumentationPolicy:m.policy,parseObject:v=>typeof v==='string'?JSON.parse(v):v||{},policyError:(status,message)=>Object.assign(new Error(message),{status}),isNonBillableDocument:()=>false}));
vi.mock('../../services/clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:v=>v}));
vi.mock('../../services/clinicalSupervisorReview.service.js',()=>({lockedNoteMutation:m.mutation,reviewSnapshotToken:()=> 'current-review-token',noteAuthorId:n=>n.provider_signed_by_user_id||n.created_by_user_id,reviewRequestsForDisplay:meta=>meta.reviewRequests||[],appendReviewRequest:m.appendReview,acknowledgeReviewRequest:vi.fn()}));
vi.mock('../../services/clinicalNoteVersion.service.js',()=>({ensureOriginalRevision:m.ensureHistory,getRevisionSummary:m.summary,listPendingRevisionWork:m.revisionWork}));
vi.mock('../../utils/planStaffAccess.js',()=>({requireStaffPlanActor:m.staff}));
vi.mock('../../services/medicalBillingFlags.service.js',()=>({getMedicalBillingFlags:m.flags}));
import {postSupervisorReview,correctNoteServiceDetails,listMyNoteReviewWork,addNoteReviewToSupervisionAgenda} from '../clinicalSupervisorReview.controller.js';
const response=()=>{const res={json:vi.fn(),status:vi.fn()};res.status.mockReturnValue(res);return res;};
describe('supervisor action tenant and author access',()=>{
  const note={id:4,agency_id:2,client_id:3,created_by_user_id:5,provider_signed_by_user_id:5,provider_signed_at:'2026-11-02',clinical_session_id:7};
  beforeEach(()=>{vi.clearAllMocks();m.find.mockResolvedValue(note);m.access.mockResolvedValue(true);m.policy.mockResolvedValue({supervisorUserId:9});m.flags.mockReturnValue({clinicalChartEnabled:true});m.agencies.mockResolvedValue([{id:2},{id:6}]);m.revisionWork.mockResolvedValue([]);});
  it('rejects a cross-agency request even for the responsible supervisor',async()=>{
    const next=vi.fn();await postSupervisorReview({params:{noteId:4},user:{id:9},body:{agencyId:8}},response(),next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404}));expect(m.mutation).not.toHaveBeenCalled();
  });
  it.each([5,10])('rejects own-note and unassigned reviewer %s',async userId=>{
    const next=vi.fn();await postSupervisorReview({params:{noteId:4},user:{id:userId},body:{agencyId:2}},response(),next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.mutation).not.toHaveBeenCalled();
  });
  it('uses the same assignment guard for service amendments',async()=>{
    const next=vi.fn();await correctNoteServiceDetails({params:{noteId:4},user:{id:10},body:{agencyId:2}},response(),next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.mutation).not.toHaveBeenCalled();
  });
  it('aggregates only own notes in accessible clinical agencies, ignoring the school shell header',async()=>{
    const request={id:'r1',action:'review_acknowledge',message:'Review this amendment',createdByUserId:9};
    m.clinical.mockResolvedValue([[{id:4,agency_id:2,client_id:3,metadata_json:{reviewRequests:[request]}},{id:8,agency_id:6,client_id:20,metadata_json:{reviewRequests:[request]}}]]);
    m.access.mockImplementation(async({agencyId})=>{if(agencyId===6)throw Object.assign(new Error('No access'),{status:403});});
    m.main.mockImplementation(async sql=>sql.includes('FROM agencies')?[[{feature_flags:{}}]]:[[ {id:3,agency_id:2,full_name:'DEMO QA Client'} ]]);
    const res=response(),next=vi.fn();await listMyNoteReviewWork({user:{id:5,role:'provider'},query:{},headers:{'x-agency-id':'99'}},res,next);
    expect(next).not.toHaveBeenCalled();expect(m.clinical.mock.calls[0][1]).toEqual([5]);expect(m.staff).toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].items).toEqual([expect.objectContaining({clinicalNoteId:4,agencyId:2,requestId:'r1',clientName:'DEMO QA Client'})]);
  });
  it('routes billing-origin proposals requiring original-author signature into author review work even without legacy requests',async()=>{
    m.clinical.mockResolvedValue([[]]);m.agencies.mockResolvedValue([{id:2},{id:6,is_active:0}]);
    m.main.mockImplementation(async sql=>sql.includes('FROM agencies')?[[{feature_flags:{}}]]:[[{id:3,agency_id:2,initials:'SYNTHETIC'}]]);
    m.revisionWork.mockResolvedValue([{clinicalNoteId:4,agencyId:2,clientId:3,title:'Clinical amendment',revisionId:31,revisionNumber:2,proposedByUserId:12,reason:'Correct the recorded duration',contentHash:'version-hash',nextAction:'author_sign',dateOfService:'2026-11-03',serviceCode:'90834'}]);
    const res=response(),next=vi.fn();await listMyNoteReviewWork({user:{id:5,role:'provider'},query:{}},res,next);
    expect(next).not.toHaveBeenCalled();expect(m.revisionWork).toHaveBeenCalledWith({agencyIds:[2],actorUserId:5});
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({items:[expect.objectContaining({clinicalNoteId:4,revisionId:31,revisionAction:'author_sign',source:'clinical_revision_proposal',action:'changes_needed',message:expect.stringContaining('user #12')})]}));
  });
});

it('directs legacy service corrections to immutable versions without signing or changing the original',async()=>{
  vi.clearAllMocks();
  const oldRequest={id:'r1',source:'service_correction',amendmentId:11,acknowledgedAt:null};
  const meta={serviceCode:'H0002',dateOfService:'2026-11-03',serviceDetailAmendments:[{id:11,serviceDetails:{durationMinutes:60},approvedAt:null}],reviewRequests:[oldRequest]};
  const signed={id:4,agency_id:2,client_id:3,clinical_session_id:7,provider_signed_by_user_id:5,provider_signed_at:'2026-11-03',metadata_json:meta};
  m.find.mockResolvedValue(signed);m.access.mockResolvedValue(true);m.policy.mockResolvedValue({supervisorUserId:9});
  m.clinical.mockImplementation(async sql=>sql.includes('FROM clinical_sessions')?[[{id:7,source_timezone:'America/Denver'}]]:sql.includes('INSERT INTO clinical_note_addenda')?[{insertId:12}]:[[]]);
  m.mutation.mockImplementation(async({mutate})=>mutate({db:{execute:m.clinical},note:signed,meta,current:{hash:'v1'}}));
  const serviceDetails={durationMinutes:10,startTime:'10:00',endTime:'10:10',locationLabel:'Virtual',placeOfService:'10',participants:'Guardian: DEMO; interpreter: QA',patientPresent:false};
  const res=response(),next=vi.fn();
  await correctNoteServiceDetails({params:{noteId:4},user:{id:9},body:{agencyId:2,contentHash:'v1',reviewSnapshotToken:'snapshot',serviceDetails,reason:'Added the interpreter before approval.',attested:true}},res,next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409,message:expect.stringContaining('Amendments and versions')}));
  expect(meta.serviceDetailAmendments).toHaveLength(1);expect(oldRequest.acknowledgedAt).toBeNull();
  expect(m.mutation).not.toHaveBeenCalled();expect(m.clinical).not.toHaveBeenCalled();
});

it('requesting changes preserves the original supervisor approval and binds durable review audit to its version',async()=>{
  vi.clearAllMocks();
  const originalApproval={contentHash:'original-hash',cosignedByUserId:9},meta={supervisorCosign:originalApproval};
  const note={id:4,agency_id:2,client_id:3,clinical_session_id:7,provider_signed_by_user_id:5,provider_signed_at:'2026-11-03',supervisor_cosigned_at:'2026-11-03',supervisor_cosigned_by_user_id:9,metadata_json:meta};
  m.find.mockResolvedValue(note);m.access.mockResolvedValue(true);m.policy.mockResolvedValue({supervisorUserId:9});
  m.clinical.mockResolvedValue([[{id:7}]]);m.summary.mockResolvedValue({effectiveRevision:{id:31,contentHash:'version-hash'}});
  m.appendReview.mockImplementation((metadata,input)=>{const r={id:'new-request',...input};metadata.reviewRequests=[r];return r;});
  m.mutation.mockImplementation(async({mutate})=>mutate({db:{execute:m.clinical},note,meta,current:{hash:'review-hash'}}));
  const res=response(),next=vi.fn();
  await postSupervisorReview({params:{noteId:4},user:{id:9},body:{agencyId:2,action:'changes_needed',message:'Please amend the documented context',contentHash:'review-hash'}},res,next);
  expect(next).not.toHaveBeenCalled();expect(m.ensureHistory).toHaveBeenCalled();
  expect(meta.supervisorCosign).toBe(originalApproval);expect(meta.supervisorQueue).toBeUndefined();
  expect(m.clinical.mock.calls.some(([sql])=>sql.includes('supervisor_cosigned_at=NULL'))).toBe(false);
  expect(m.clinical).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO clinical_note_revision_audit'),expect.arrayContaining([31,'review_requested','version-hash']));
});


it('adds a secure agenda pointer to the next individual meeting with the reviewer, without copying the comment',async()=>{
  const requestId='cfa86b93-c701-4bcd-bfeb-116871eafca5';
  const note={id:4,agency_id:2,client_id:3,provider_signed_by_user_id:5,metadata_json:{reviewRequests:[
    {id:requestId,action:'review_acknowledge',source:'supervisor',createdByUserId:9,messageEncrypted:'synthetic private clinical feedback'}
  ]}};
  m.find.mockResolvedValue(note);m.access.mockResolvedValue(true);
  const db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),
    execute:vi.fn(async sql=>sql.includes('FROM supervision_sessions')?[[{id:44,start_utc:'2026-12-03T22:00:00Z'}]]:sql.includes('SELECT id FROM meeting_agendas')?[[{id:85}]]:[{}])};
  m.mainConnection.mockResolvedValue(db);
  const req={params:{noteId:4,requestId},body:{agencyId:2},user:{id:5}};
  const res=response(),next=vi.fn();
  await addNoteReviewToSupervisionAgenda(req,res,next);
  expect(next).not.toHaveBeenCalled();
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("='individual'"),[2,9,5]);
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY'),[85,'Clinical note discussion',
    '/note-aid?agencyId=2&noteId=4&reviewRequest='+requestId,5,'note_review:'+requestId]);
  expect(JSON.stringify(db.execute.mock.calls)).not.toContain('private clinical feedback');
  expect(db.commit).toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith({meetingId:44,meetingStartsAt:'2026-12-03T22:00:00Z'});
  m.mainConnection.mockClear();
  await addNoteReviewToSupervisionAgenda({...req,user:{id:11}},response(),next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404}));
  expect(m.mainConnection).not.toHaveBeenCalled();
});

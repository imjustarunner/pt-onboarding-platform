import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({clinical:vi.fn(),main:vi.fn(),find:vi.fn(),access:vi.fn(),policy:vi.fn(),mutation:vi.fn(),staff:vi.fn(),flags:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.clinical}}));
vi.mock('../../config/database.js',()=>({default:{execute:m.main},onTableWrite:vi.fn()}));
vi.mock('../../models/clinical/ClinicalNote.model.js',()=>({default:{findById:m.find}}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.access}}));
vi.mock('../../services/supervisedBillingPolicy.service.js',()=>({resolveNoteDocumentationPolicy:m.policy,parseObject:v=>typeof v==='string'?JSON.parse(v):v||{},policyError:(status,message)=>Object.assign(new Error(message),{status}),isNonBillableDocument:()=>false}));
vi.mock('../../services/clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:v=>v}));
vi.mock('../../services/clinicalSupervisorReview.service.js',()=>({lockedNoteMutation:m.mutation,noteAuthorId:n=>n.provider_signed_by_user_id||n.created_by_user_id,reviewRequestsForDisplay:meta=>meta.reviewRequests||[],appendReviewRequest:vi.fn(),acknowledgeReviewRequest:vi.fn(),normalizeServiceDetails:v=>v,effectiveServiceDetails:vi.fn(()=>({durationMinutes:60})),serviceDetailTimes:vi.fn(),verifyServiceAmendmentLocation:vi.fn(async()=>({name:'Virtual',place_of_service:'10'})),serviceLocationSnapshot:vi.fn(v=>v),markSupervisorQueue:vi.fn(),synchronizeSupervisorQueue:vi.fn(async()=>true)}));
vi.mock('../../utils/planStaffAccess.js',()=>({requireStaffPlanActor:m.staff}));
vi.mock('../../services/medicalBillingFlags.service.js',()=>({getMedicalBillingFlags:m.flags}));
import {postSupervisorReview,correctNoteServiceDetails,listMyNoteReviewWork} from '../clinicalSupervisorReview.controller.js';
const response=()=>{const res={json:vi.fn(),status:vi.fn()};res.status.mockReturnValue(res);return res;};
describe('supervisor action tenant and author access',()=>{
  const note={id:4,agency_id:2,client_id:3,created_by_user_id:5,provider_signed_by_user_id:5,provider_signed_at:'2026-11-02',clinical_session_id:7};
  beforeEach(()=>{vi.clearAllMocks();m.find.mockResolvedValue(note);m.access.mockResolvedValue(true);m.policy.mockResolvedValue({supervisorUserId:9});m.flags.mockReturnValue({clinicalChartEnabled:true});});
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
});

it('revises a pending amendment without replacing its signed entry and resolves its obsolete acknowledgement',async()=>{
  const oldRequest={id:'r1',source:'service_correction',amendmentId:11,acknowledgedAt:null};
  const meta={serviceCode:'H0002',dateOfService:'2026-11-03',serviceDetailAmendments:[{id:11,serviceDetails:{durationMinutes:60},approvedAt:null}],reviewRequests:[oldRequest]};
  const signed={id:4,agency_id:2,client_id:3,clinical_session_id:7,provider_signed_by_user_id:5,provider_signed_at:'2026-11-03',metadata_json:meta};
  m.find.mockResolvedValue(signed);m.access.mockResolvedValue(true);m.policy.mockResolvedValue({supervisorUserId:9});
  m.clinical.mockImplementation(async sql=>sql.includes('FROM clinical_sessions')?[[{id:7,source_timezone:'America/Denver'}]]:sql.includes('INSERT INTO clinical_note_addenda')?[{insertId:12}]:[[]]);
  m.mutation.mockImplementation(async({mutate})=>mutate({db:{execute:m.clinical},note:signed,meta,current:{hash:'v1'}}));
  const serviceDetails={durationMinutes:10,startTime:'10:00',endTime:'10:10',locationLabel:'Virtual',placeOfService:'10',participants:'Guardian: DEMO; interpreter: QA',patientPresent:false};
  const res=response(),next=vi.fn();
  await correctNoteServiceDetails({params:{noteId:4},user:{id:9},body:{agencyId:2,contentHash:'v1',reviewSnapshotToken:'snapshot',serviceDetails,reason:'Added the interpreter before approval.',attested:true}},res,next);
  expect(next).not.toHaveBeenCalled();
  expect(meta.serviceDetailAmendments[0]).toMatchObject({id:11,approvedAt:null,supersededByAmendmentId:12});
  expect(meta.serviceDetailAmendments[1]).toMatchObject({id:12,createdByUserId:9,serviceDetails:expect.objectContaining({participants:serviceDetails.participants,patientPresent:false})});
  expect(oldRequest.resolvedAt).toBeTruthy();expect(oldRequest.acknowledgedAt).toBeNull();
  expect(m.clinical.mock.calls.some(([sql])=>sql.includes('UPDATE clinical_note_addenda'))).toBe(false);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({requiresCosign:true,claimTransmitted:false}));
});

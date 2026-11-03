import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({clinical:vi.fn(),main:vi.fn(),find:vi.fn(),access:vi.fn(),policy:vi.fn(),mutation:vi.fn(),staff:vi.fn(),flags:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.clinical}}));
vi.mock('../../config/database.js',()=>({default:{execute:m.main},onTableWrite:vi.fn()}));
vi.mock('../../models/clinical/ClinicalNote.model.js',()=>({default:{findById:m.find}}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.access}}));
vi.mock('../../services/supervisedBillingPolicy.service.js',()=>({resolveNoteDocumentationPolicy:m.policy,parseObject:v=>typeof v==='string'?JSON.parse(v):v||{},policyError:(status,message)=>Object.assign(new Error(message),{status}),isNonBillableDocument:()=>false}));
vi.mock('../../services/clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:v=>v}));
vi.mock('../../services/clinicalSupervisorReview.service.js',()=>({lockedNoteMutation:m.mutation,noteAuthorId:n=>n.provider_signed_by_user_id||n.created_by_user_id,reviewRequestsForDisplay:meta=>meta.reviewRequests||[],appendReviewRequest:vi.fn(),acknowledgeReviewRequest:vi.fn(),normalizeServiceDetails:v=>v,effectiveServiceDetails:vi.fn(),serviceDetailTimes:vi.fn()}));
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

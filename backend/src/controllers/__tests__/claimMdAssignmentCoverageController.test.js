import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),access:vi.fn(),insurance:vi.fn(),evidence:vi.fn(),save:vi.fn(),admission:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:vi.fn()}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:m.access}}));
vi.mock('../../services/clientInsurance.service.js',()=>({readClientInsurance:m.insurance}));
vi.mock('../../services/clientCoverageAdmission.service.js',()=>({clientCoverageAdmission:m.admission}));
vi.mock('../../services/coverageVerification.service.js',async importActual=>({...await importActual(),listCoverageEvidence:m.evidence,saveCoverageReview:m.save}));
import {getCoverageEvidence,reviewClientCoverage} from '../coverageVerification.controller.js';
import {coverageReviewToken} from '../../services/coverageVerification.service.js';
const insurance={primary:{insurerName:'Synthetic plan',memberId:'DEMO-001'},patient:{firstName:'DEMO QA',lastName:'Student',addressLine1:'Private test address'}};
const evidence={checks:[],review:null,latestReview:{id:5,status:'unresolved'},latestCheckId:8,latestEvidenceAt:'2026-11-03T18:30:00.123456'};
const request=()=>({user:{id:559,role:'admin'},params:{clientId:'10'},query:{agencyId:'2',serviceDate:'2026-11-03',forAssignment:'true'},body:{}});
const response=()=>({set:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{vi.clearAllMocks();m.execute.mockResolvedValue([[{id:10}]]);m.access.mockResolvedValue(true);m.insurance.mockResolvedValue(insurance);m.evidence.mockResolvedValue(evidence);m.save.mockResolvedValue({id:17,status:'verified'});m.admission.mockResolvedValue({ready:true,clientId:10,agencyId:2});});

it('returns the same saved insurance summary and review token with the authoritative assignment status',async()=>{
 const req=request(),res=response(),next=vi.fn();await getCoverageEvidence(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
  insuranceSummary:{patientName:'DEMO QA Student',primary:{insurerName:'Synthetic plan',memberId:'DEMO-001'},secondary:null,hasMedicaidCoverage:false},
  readyForAssignmentReview:true,missingAssignmentFields:[],admission:{ready:true,clientId:10,agencyId:2},
  reviewToken:coverageReviewToken({agencyId:2,clientId:10,serviceDate:req.query.serviceDate,insurance,...evidence})
 }));
 expect(m.admission).toHaveBeenCalledWith(10);expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('Private test address');
});
it('returns explicit missing-policy issues instead of requiring clearinghouse setup',async()=>{
 m.insurance.mockResolvedValue({primary:{insurerName:'Synthetic plan',memberId:''}});const res=response();
 await getCoverageEvidence(request(),res,vi.fn());
 expect(res.json.mock.calls[0][0]).toMatchObject({readyForAssignmentReview:false,missingAssignmentFields:['Primary member ID is missing']});
});
it('returns the fresh admission result after a compact review without assigning a provider',async()=>{
 const req=request(),res=response();req.body={agencyId:2,clientId:999,actorUserId:999,assignmentReview:true,status:'verified',reviewToken:'token',serviceDate:'2026-11-03'};
 await reviewClientCoverage(req,res,vi.fn());
 expect(m.save).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:10,actorUserId:559,reviewToken:'token',assignmentReview:true}));
 expect(res.status).toHaveBeenCalledWith(201);expect(res.json).toHaveBeenCalledWith({id:17,status:'verified',admission:{ready:true,clientId:10,agencyId:2}});
 expect(m.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
});
it('preserves a newly blocked status instead of treating a saved review as successful assignment',async()=>{
 m.admission.mockResolvedValue({ready:false,reason:'New eligibility results need billing review'});const req=request(),res=response();req.body={agencyId:2,assignmentReview:true};
 await reviewClientCoverage(req,res,vi.fn());expect(res.json.mock.calls[0][0].admission.ready).toBe(false);
});
it('refuses an unauthorized agency before reading policy details',async()=>{
 const denial=Object.assign(Error('Access denied'),{status:403});m.access.mockRejectedValue(denial);const next=vi.fn();
 await getCoverageEvidence(request(),response(),next);expect(next).toHaveBeenCalledWith(denial);expect(m.insurance).not.toHaveBeenCalled();expect(m.evidence).not.toHaveBeenCalled();
});
it('refuses a foreign-scope client before review save',async()=>{
 m.execute.mockResolvedValue([[]]);const req=request(),next=vi.fn();req.body={agencyId:2,assignmentReview:true};
 await reviewClientCoverage(req,response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404}));expect(m.save).not.toHaveBeenCalled();
});
it('returns a distinct no-store stale-review conflict so the UI requires a fresh attestation',async()=>{
 const stale=Object.assign(Error('Refresh the saved coverage'),{status:409,code:'COVERAGE_REVIEW_STALE'});m.save.mockRejectedValue(stale);
 const req=request(),res=response(),next=vi.fn();req.body={agencyId:2,assignmentReview:true};
 await reviewClientCoverage(req,res,next);
 expect(res.set).toHaveBeenCalledWith('Cache-Control','no-store');expect(res.status).toHaveBeenCalledWith(409);expect(res.json).toHaveBeenCalledWith({error:{code:'COVERAGE_REVIEW_STALE',message:stale.message}});
 expect(m.admission).not.toHaveBeenCalled();expect(next).not.toHaveBeenCalled();
});

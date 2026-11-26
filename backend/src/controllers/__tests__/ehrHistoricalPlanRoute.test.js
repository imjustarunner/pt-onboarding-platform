import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),clinical:vi.fn(),importPlan:vi.fn(),importRecords:vi.fn(),access:vi.fn(),audit:vi.fn(),create:vi.fn(),findPlan:vi.fn(),findIntake:vi.fn(),signPlan:vi.fn(),recordReview:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:mocks.clinical}}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:vi.fn()}}));
vi.mock('../../services/ehrHistoricalPlanImport.service.js',()=>({importHistoricalPlan:mocks.importPlan}));
vi.mock('../../services/clientClinicalRecordsImport.service.js',()=>({importRecordsTreatmentPlan:mocks.importRecords}));
vi.mock('../../services/safetyPlans/access.js',()=>({clientAccess:mocks.access}));
vi.mock('../../services/noteAidChartAudit.service.js',()=>({logNoteAidChartEvent:mocks.audit}));
vi.mock('../../models/clinical/ClinicalTreatmentPlan.model.js',()=>({default:{create:mocks.create,findById:mocks.findPlan,voidPacketBootstrapDrafts:vi.fn()}}));
vi.mock('../../models/clinical/ClinicalNote.model.js',()=>({default:{findById:mocks.findIntake,hasSignedIntakeForClient:vi.fn()}}));
vi.mock('../../services/treatmentPlanApproval.service.js',()=>({
  attestTreatmentPlanProvider:mocks.signPlan, treatmentPlanContentHash:vi.fn(async ()=>'signed-content'),
  getTreatmentPlanApproval:vi.fn(async ()=>({providerApproved:true,supervisorApproved:false}))
}));
vi.mock('../../services/narrivaTreatmentPlanReview.service.js',()=>({recordTreatmentPlanReview:mocks.recordReview}));
import {saveTreatmentPlanToChart} from '../medicalBilling.controller.js';
const request=()=>({user:{id:7,role:'super_admin'},body:{agencyId:2,clientId:42,status:'draft',finalize:false,historicalImport:{reviewed:true},icd10Code:'F41.1',diagnoses:[{icd10Code:'F41.1'}]}});
const run=async()=>{const res={status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();await saveTreatmentPlanToChart(request(),res,next);return{res,next};};
beforeEach(()=>{vi.resetAllMocks();mocks.importPlan.mockResolvedValue({plan:{id:11,status:'draft'},reused:false});});
it('imports records through the unsigned draft adapter with chart scope and no diagnosis, billing or guardian-sharing writes',async()=>{
 mocks.access.mockResolvedValue({agency_id:2});mocks.importRecords.mockResolvedValue({plan:{id:11,status:'draft'},reused:false});
 const req=request();delete req.body.historicalImport;req.body.recordsImport={text:'Synthetic source plan'};const res={set:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),json:vi.fn()},next=vi.fn();await saveTreatmentPlanToChart(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(201);expect(mocks.importRecords).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:42,actorId:7}));expect(mocks.create).not.toHaveBeenCalled();expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.clinical).not.toHaveBeenCalled();
});
it('rejects a records import scoped to another client agency before writing',async()=>{
 mocks.access.mockResolvedValue({agency_id:99});const req=request();req.body.recordsImport={text:'Source plan'};const res={status:vi.fn().mockReturnThis(),json:vi.fn()};await saveTreatmentPlanToChart(req,res,vi.fn());expect(res.status).toHaveBeenCalledWith(403);expect(mocks.importRecords).not.toHaveBeenCalled();
});
it('routes historical plans through the draft adapter without live diagnoses, guardian sharing or session writes',async()=>{
 const {res,next}=await run();expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(201);
 expect(mocks.importPlan).toHaveBeenCalledWith(expect.objectContaining({agencyId:2,clientId:42,user:expect.objectContaining({id:7})}));
 expect(mocks.create).not.toHaveBeenCalled();expect(mocks.clinical).not.toHaveBeenCalled();expect(mocks.execute).not.toHaveBeenCalled();
});
it('returns the previously retained plan on a repeated source import',async()=>{
 mocks.importPlan.mockResolvedValue({plan:{id:11,status:'draft'},reused:true});
 const {res,next}=await run();expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(200);expect(mocks.create).not.toHaveBeenCalled();
});

it('prepares and signs an initial plan against its signed intake without a claim or appointment', async () => {
  const req = { user: { id: 7, role: 'provider' }, body: {
    agencyId: 2, clientId: 42, sourceIntakeNoteId: 12, status: 'active', finalize: true,
    planAuthoring: true, signPlan: true, manualOnly: true, effectiveDate: '2026-09-05',
    presentingProblem: 'Fictional sleep concern.', prescribedFrequency: 'Weekly', dischargePlan: 'Independent routine.',
    diagnoses: [{ icd10Code: 'F99', description: 'Synthetic diagnosis', justification: 'Documented concern.', isPrimary: true }],
    goals: [{ goalText: 'Improve the evening routine', projectedCompletion: '2026-12-05',
      objectives: ['Track the routine.', 'Prepare for bed on schedule.'].map(objectiveText => ({
        objectiveText, projectedCompletion: '2026-12-05', scaleCurrent: 3, scaleTarget: 7, scaleDirection: 'increase'
      })) }]
  } };
  const plan = { id: 21, agency_id: 2, client_id: 42, created_by_user_id: 7, status: 'draft', goals: [] };
  mocks.access.mockResolvedValue({ agency_id: 2 });
  mocks.findIntake.mockResolvedValue({ id: 12, agency_id: 2, client_id: 42, created_by_user_id: 7,
    provider_signed_at: '2026-11-25', metadata_json: { serviceCode: '90791', dateOfService: '2026-09-05' } });
  mocks.create.mockResolvedValue(plan);
  mocks.findPlan.mockResolvedValue(plan);
  mocks.execute.mockResolvedValue([[]]);
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
  await saveTreatmentPlanToChart(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(mocks.findIntake).toHaveBeenCalledWith(12);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
    clinicalSessionId: null, effectiveDate: '2026-09-05', prescribedFrequency: 'Weekly'
  }));
  expect(mocks.signPlan).toHaveBeenCalledWith({ user: req.user, plan, contentHash: 'signed-content', reviewedAndAccurate: true });
  expect(mocks.recordReview).toHaveBeenCalledWith(plan, 'signed-content', expect.objectContaining({ manualOnly: true }));
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ plan, guardianSharing: null,
    providerApproval: { providerApproved: true, supervisorApproved: false } }));
});

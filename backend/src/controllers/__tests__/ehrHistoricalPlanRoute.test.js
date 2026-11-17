import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),clinical:vi.fn(),importPlan:vi.fn(),importRecords:vi.fn(),access:vi.fn(),audit:vi.fn(),create:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:mocks.clinical}}));
vi.mock('../../services/clinicalEligibility.service.js',()=>({default:{ensureAgencyAccess:vi.fn()}}));
vi.mock('../../services/ehrHistoricalPlanImport.service.js',()=>({importHistoricalPlan:mocks.importPlan}));
vi.mock('../../services/clientClinicalRecordsImport.service.js',()=>({importRecordsTreatmentPlan:mocks.importRecords}));
vi.mock('../../services/safetyPlans/access.js',()=>({clientAccess:mocks.access}));
vi.mock('../../services/noteAidChartAudit.service.js',()=>({logNoteAidChartEvent:mocks.audit}));
vi.mock('../../models/clinical/ClinicalTreatmentPlan.model.js',()=>({default:{create:mocks.create}}));
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

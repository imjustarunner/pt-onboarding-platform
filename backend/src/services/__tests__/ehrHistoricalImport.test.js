import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/clinical/ClinicalTreatmentPlan.model.js',()=>({default:{}}));
vi.mock('../safetyPlans/access.js',()=>({clientAccess:vi.fn()}));
vi.mock('../ehrHistoricalImportLock.service.js',()=>({withHistoricalImportLock:vi.fn((_agencyId,_clientId,_kind,work)=>work())}));
import { historicalImportDetails, historicalPlanSourceKey } from '../ehrHistoricalImport.service.js';
import { importHistoricalPlan } from '../ehrHistoricalPlanImport.service.js';

const source={sourceSystem:'TherapyNotes',sourceDate:'2021-03-04',sourceAuthor:'Original Clinician',reviewed:true,sourceText:'Original treatment plan\nGoal: Improve sleep.'};
const input=()=>({historicalImport:{...source},status:'draft',finalize:false,effectiveDate:'2026-11-10',icd10Code:'F41.1',diagnoses:[{icd10Code:'F41.1'}],goals:[{goalText:'Improve sleep',objectives:[{objectiveText:'Sleep regularly'}]}]});
let access,plans,ensureSchema;
beforeEach(()=>{access=vi.fn(async()=>({agency_id:2}));ensureSchema=vi.fn(async()=>{});plans={listByClient:vi.fn(async()=>[]),create:vi.fn(async payload=>({id:11,...payload})),findById:vi.fn(async id=>({id,status:'draft'}))};});
const run = body => importHistoricalPlan({user:{id:7,role:'super_admin'},agencyId:2,clientId:42,input:body || input()},{clientAccess:access,plans,ensureSchema});

it('retains original plan date/author/text in an unsigned canonical draft without live diagnosis links',async()=>{
  const result=await run();
  const saved=plans.create.mock.calls[0][0];
  expect(saved).toMatchObject({status:'draft',effectiveDate:'2021-03-04',createdByUserId:7});
  expect(saved.dischargePlan).toContain('Original author: Original Clinician');
  expect(saved.dischargePlan).toContain(source.sourceText);
  expect(saved.sourceToolId.length).toBeLessThanOrEqual(80);
  expect(saved).not.toHaveProperty('primaryDiagnosisId');
  expect(saved).not.toHaveProperty('clinicalSessionId');
  expect(result.historicalImport.reviewRequired).toBe(true);
});
it('reuses the same historical source on retry instead of creating another plan',async()=>{
  const sourceKey=historicalPlanSourceKey(historicalImportDetails(source,source.sourceText));
  plans.listByClient.mockResolvedValue([{id:11,source_tool_id:sourceKey}]);
  const result=await run();
  expect(result).toMatchObject({reused:true,plan:{id:11}});
  expect(plans.create).not.toHaveBeenCalled();
});
it('holds a different historical plan version for chart review',async()=>{
  plans.listByClient.mockResolvedValue([{id:11,source_tool_id:'ehr_transition_import:other-source'}]);
  await expect(run()).rejects.toMatchObject({status:409,code:'EHR_PLAN_REVIEW_REQUIRED'});
  expect(plans.create).not.toHaveBeenCalled();
});
it.each([{status:'active'},{finalize:true},{officeEventId:10},{clinicalNoteId:9},{clinicalSessionId:8}])('rejects active/signed/session-linked historical import requests (%j)',async changes=>{
  await expect(run({...input(),...changes})).rejects.toMatchObject({status:400});
  expect(plans.create).not.toHaveBeenCalled();
});
it('blocks failed existing-plan lookup and wrong-agency charts before creation',async()=>{
  plans.listByClient.mockRejectedValue(new Error('Lookup failed'));
  await expect(run()).rejects.toThrow('Lookup failed');
  access.mockResolvedValue({agency_id:99});
  await expect(run()).rejects.toMatchObject({status:403});
  expect(plans.create).not.toHaveBeenCalled();
});
it('requires original-date schema support before creating a historical plan',async()=>{
  ensureSchema.mockRejectedValue(Object.assign(new Error('Unknown column'),{code:'ER_BAD_FIELD_ERROR'}));
  await expect(run()).rejects.toMatchObject({status:503,code:'EHR_CLINICAL_SCHEMA_REQUIRED'});
  expect(plans.create).not.toHaveBeenCalled();
});
it.each([{reviewed:false},{sourceAuthor:''},{sourceDate:'2021-02-30'}])('requires explicit source review and valid attribution (%j)',changes=>{
  expect(()=>historicalImportDetails({...source,...changes},source.sourceText)).toThrow();
});

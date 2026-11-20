import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({main:vi.fn(),clinical:vi.fn(),draft:vi.fn(),agency:vi.fn(),client:vi.fn(),care:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.main},onTableWrite:()=>()=>{}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:m.clinical}}));
vi.mock('../../models/ClinicalNoteDraft.model.js',()=>({default:{findByIdForUser:m.draft}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listForClient:async()=>[]}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:async()=>({id:7,role:'provider'})}}));
vi.mock('../../models/AgencyMedicalServiceCode.model.js',()=>({default:{listByAgency:async()=>[{service_code:'H0004',is_active:1}]}}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeDecryptNotePayload:value=>value}));
vi.mock('../chatEncryption.service.js',()=>({decryptChatText:value=>value}));
vi.mock('../narrivaAccess.service.js',async original=>({...await original(),requireNarrivaAgency:m.agency,requireNarrivaClient:m.client}));
vi.mock('../clinicalReviewDocument.service.js',()=>({loadReviewDocument:vi.fn()}));
vi.mock('../supervisedBillingPolicy.service.js',()=>({resolveNoteDocumentationPolicy:vi.fn()}));
vi.mock('../serviceCodeUnits.service.js',()=>({resolveSessionBilling:()=>({claimable:true,units:1})}));
vi.mock('../staffCareEligibility.service.js',()=>({readStaffCareEligibility:m.care}));
vi.mock('../agencySchedulingCatalog.service.js',()=>({resolveAgencySchedulingCatalog:async()=>({eligibleServiceCodes:[{code:'H0004'}]})}));
vi.mock('../treatmentPlanEncounterEligibility.service.js',()=>({loadEncounterTreatmentPlanEligibility:async()=>({eligible:true,planId:1,plan:{id:1,goals:[]}})}));
vi.mock('../narrivaAssessmentEvidence.service.js',()=>({loadNarrivaAssessmentEvidence:vi.fn()}));
import { loadNarrivaSource } from '../narrivaSource.service.js';
let meta,rows,draft;
const diagnosis=(patch={})=>({id:41,agency_id:2,client_id:10,icd10_code:'F41.1',description:'Generalized anxiety disorder',justification:'Established persistent worry interferes with school attendance.',concern_kind:'clinical',is_active:1,is_primary:1,updated_at:'2026-11-01',...patch});
const load=()=>loadNarrivaSource({id:7,role:'provider'},{agencyId:2,draftId:55,phase:'pre_generation'});
beforeEach(()=>{
 vi.clearAllMocks();meta={serviceCode:'H0004',structuredChart:{diagnoses:[]},narrivaContext:{presentingProblem:'Current worry interferes with school attendance.'}};rows=[diagnosis()];
 draft={id:55,agency_id:2,client_id:10,user_id:7,clinical_session_id:20,service_code:'H0004',date_of_service:'2026-11-06',input_text:'Provider practiced paced breathing with Client.'};
 m.draft.mockImplementation(async()=>({...draft,output_json:JSON.stringify({sections:{Narrative:'Source facts'},meta})}));
 m.agency.mockResolvedValue({id:2});m.client.mockResolvedValue({id:10,first_name:'Synthetic',last_name:'Person'});
 m.care.mockResolvedValue({credential:'BA',agencyRole:'provider',credentialTier:'bachelors',canProvideCare:true});
 m.main.mockResolvedValue([[{required:0}]]);
 m.clinical.mockImplementation(async sql=>{
  if(sql.includes('FROM clinical_sessions'))return [[{id:20,agency_id:2,client_id:10,service_code:'H0004',duration_minutes:30}]];
  if(sql.includes('FROM clinical_diagnoses'))return [structuredClone(rows)];
  throw new Error('Unexpected clinical query');
 });
});
describe('authoritative existing chart diagnosis reference for H-code Narriva',()=>{
 it('reads only the authorized client/agency active clinical scope without writing a diagnosis or draft',async()=>{
  const original=structuredClone(meta),source=await load();
  expect(m.client).toHaveBeenCalledWith(expect.any(Object),2,10,{authorizedNoteReviewer:false});
  const call=m.clinical.mock.calls.find(([sql])=>sql.includes('FROM clinical_diagnoses'));
  expect(call).toEqual([expect.stringContaining("agency_id=? AND client_id=? AND is_active=1 AND COALESCE(concern_kind,'clinical')='clinical'"),[2,10]]);
  expect(source.clinical).toMatchObject({hasDiagnosis:true,hasJustification:true});
  expect(source.confirmedClinicalContext).toMatchObject({diagnosesReferenceOnly:true,diagnoses:[{code:'F41.1',justification:rows[0].justification}]});
  expect(JSON.stringify(source.confirmedClinicalContext)).not.toContain('agency_id');
  expect(meta).toEqual(original);expect(m.clinical.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
 });
 it('cannot read diagnosis content when client access is denied',async()=>{
  m.client.mockRejectedValue(Object.assign(new Error('Not authorized'),{status:403}));
  await expect(load()).rejects.toMatchObject({status:403});expect(m.clinical).not.toHaveBeenCalled();
 });
 it('rejects foreign, inactive and learning-concern rows even if a database adapter returns them',async()=>{
  rows=[diagnosis({agency_id:3}),diagnosis({client_id:11}),diagnosis({is_active:0}),diagnosis({concern_kind:'learning_concern'}),diagnosis({icd10_code:'LC-FOCUS'})];
  const source=await load();expect(source.clinical).toMatchObject({hasDiagnosis:false,hasJustification:false});expect(source.confirmedClinicalContext.diagnoses).toEqual([]);
 });
 it('preserves complete authored clinical context without an additional chart query',async()=>{
  meta.structuredChart={diagnoses:[{code:'F43.20',description:'Authored diagnosis',justification:'Authored supported reason.'}],diagnosticJustification:'Authored supported reason.'};
  const source=await load();expect(source.confirmedClinicalContext.diagnoses[0].code).toBe('F43.20');
  expect(m.clinical.mock.calls.some(([sql])=>sql.includes('FROM clinical_diagnoses'))).toBe(false);
 });
 it('fills missing justification only from a matching existing diagnosis',async()=>{
  meta.structuredChart={diagnoses:[{code:'F43.20'}]};
  expect((await load()).clinical.hasJustification).toBe(false);
  rows.push(diagnosis({id:42,icd10_code:'F43.20',justification:'Existing matching adjustment-related clinical need.'}));
  const source=await load();expect(source.clinical.hasJustification).toBe(true);expect(source.confirmedClinicalContext.diagnoses).toHaveLength(1);
  expect(source.confirmedClinicalContext.diagnoses[0].justification).toContain('matching adjustment');
 });
 it('invalidates exact-content evidence when chart diagnosis data changes while all presence checks stay true',async()=>{
  const first=await load();rows[0].justification='Changed established clinical justification.';const second=await load();
  expect(first.clinical.hasJustification).toBe(true);expect(second.clinical.hasJustification).toBe(true);expect(first.sourceHash).not.toBe(second.sourceHash);
  rows[0].is_active=0;expect((await load()).sourceHash).not.toBe(second.sourceHash);
 });
});

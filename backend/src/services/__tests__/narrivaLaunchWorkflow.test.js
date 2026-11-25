import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
import {resolveClinicalAssessmentKind} from '../clinicalAssessmentKind.service.js';
import {intakeAssessmentResponses} from '../intakeAssessmentResponses.service.js';
import {clinicalClientPresent,clinicalServiceRequirements} from '../../../../frontend/src/utils/clinicalEncounterRequirements.js';
import {deriveNarrivaCheck,narrivaQualityCriteria,narrivaRecordedDecisions} from '../narrivaReviewPolicy.service.js';
import {assertH0031DiagnosisScope,clinicalWriterOptions} from '../clinicalNoteWriter.service.js';
import {intakeOutputError} from '../clinicalNoteSections.service.js';
import {INTAKE_SECTION_TITLES} from '../../config/clinicalNotePlanOutput.js';

describe('service-aware Narriva launch behavior',()=>{
 it.each(['90791','H0031','H0032','H0004','H2011','H0023','H0025','90837','90846'])('skips direct risk for confirmed client-absent %s while retaining collateral concerns',code=>{
  const result=deriveNarrivaCheck('risk_safety',{service:{code},encounter:{clientPresent:false},clinical:{riskAssessmentIncluded:true,riskRequiredFromPriorReview:true},facts:{currentRisk:true,riskUncertain:true}},{preGeneration:true});
  expect(result.riskAssessmentRequired).toBe(false);expect(result.findings).toEqual([]);expect(result.advisories[0].category).toBe('risk');
 });
 it('distinguishes unknown presence from confirmed absence',()=>{
  expect(clinicalClientPresent({sessionContext:{participants:'Others (client not present)',participantsDetail:'Father'}})).toBe(false);
  expect(clinicalClientPresent({sessionContext:{participants:'Client and Others'}})).toBe(true);
  expect(clinicalClientPresent({})).toBe(null);
 });
 it.each(['H0032','H0002','H0023','H0025','H2011','90839'])('uses service-appropriate follow-up and quality criteria for %s',code=>{
  const result=deriveNarrivaCheck('participation_plan',{service:{code},encounter:{clientPresent:false},clinical:{},facts:{followUpDocumented:true}});
  expect(result.status).toBe('passed');expect(clinicalServiceRequirements({serviceCode:code}).requireExistingGoals).toBe(false);
  expect(narrivaQualityCriteria(code,{clientPresent:false}).find(c=>c.id==='goal_linkage').instruction).toContain('prerequisite');
 });
 it('selects H0031 additional from prior signed intake without redating either encounter',async()=>{
  const execute=vi.fn(async()=>[[{id:7,date_of_service:'2026-09-05',service_code:'90791'}]]);
  const context=await resolveClinicalAssessmentKind({agencyId:2,clientId:14,serviceCode:'H0031',clinicalSessionId:22,dateOfService:'2026-11-24'}, {execute});
  expect(context).toMatchObject({assessmentKind:'additional',toolId:'clinical_h0031_additional',requiresDiagnosisConfirmation:true});
  expect(execute.mock.calls[0][1]).toEqual([2,14,0,22,'2026-11-24']);expect(execute.mock.calls[0][0]).toContain('n.provider_signed_at IS NOT NULL');expect(execute.mock.calls[0][0]).not.toContain('n.date_of_service');
 });
 it('requires attestation to override the inferred H0031 assessment type',async()=>{
  const db={execute:vi.fn(async()=>[[]])};const input={agencyId:2,clientId:14,serviceCode:'H0031',dateOfService:'2026-11-24',metadata:{narrivaContext:{assessmentKind:'additional'}}};
  expect((await resolveClinicalAssessmentKind(input,db)).assessmentKind).toBe('initial');
  input.metadata.narrivaContext.assessmentKindConfirmed=true;expect((await resolveClinicalAssessmentKind(input,db)).assessmentKind).toBe('additional');
 });
 it('restricts H0031 to new non-disorder codes while permitting established disorder references',()=>{
  expect(()=>assertH0031DiagnosisScope('Established F90.2 diagnosis is carried from the chart.',[{code:'F90.2'}])).not.toThrow();
  expect(()=>assertH0031DiagnosisScope('Diagnose F91.8 conduct disorder.',[])).toThrow(/new mental health disorder/);
  expect(()=>assertH0031DiagnosisScope('Consider Z63.9 based on the stated family needs.',[])).not.toThrow();
 });
 it('retains manual editing and low-score decisions for signing and compliance reporting',()=>{
  const decisions=narrivaRecordedDecisions({actorUserId:7,manualEdited:true,manualEditRecordedAt:'2026-11-24',qualityBypass:{bypassedBy:7,bypassReason:'Provider accepts the documented limitations.'},checks:[]});
  expect(decisions.map(d=>d.checkId)).toEqual(['manual_edit','scoring']);expect(decisions[0].bypassedBy).toBe(7);
 });
 it('uses lower thinking for routine note drafting without changing treatment-plan reasoning',()=>{
  expect(clinicalWriterOptions({id:'clinical_90791_intake_plan'},{fastDraft:true}).thinkingLevel).toBe('LOW');
  expect(clinicalWriterOptions({id:'clinical_treatment_plan',sectionSchema:'treatment_plan'},{fastDraft:true}).thinkingLevel).toBe('MEDIUM');
 });
});

describe('caregiver PSC-17 score interpretation',()=>{
 const responses=value=>Object.fromEntries(Array.from({length:17},(_,i)=>['psc_'+(i+1),value]));
 it('uses the correct total denominator and stored-order subscales instead of emitting all responses',()=>{
  const [screen]=intakeAssessmentResponses({clinicalResponses:responses(1)});
  expect(screen.total).toBe(17);expect(screen.text).toContain('17/34');expect(screen.text).not.toContain('17 answered');
  expect(screen.interpretation.subscales.map(s=>[s.key,s.score,s.elevated])).toEqual([['internalizing',5,true],['attention',5,false],['externalizing',7,true]]);
  expect(screen.items).toHaveLength(17);expect(screen.text).toContain('Caregiver-reported');expect(screen.text).not.toContain('fidgety');
 });
 it('does not interpret an incomplete screen as a negative or calculate a total from partial responses',()=>{
  const [screen]=intakeAssessmentResponses({clinicalResponses:{psc_1:2}});expect(screen.total).toBeNull();expect(screen.text).toContain('incomplete');
 });
});

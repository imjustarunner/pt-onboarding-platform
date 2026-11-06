import {describe,it,expect} from 'vitest';
import {deriveNarrivaCheck,emptyNarrivaChecks,bypassNarrivaFinding,narrivaSourceHash,narrivaOverall} from '../narrivaReviewPolicy.service.js';
import {narrivaLocalContext} from '../narrivaSource.service.js';
import {containsNarrivaIdentifiers,requireNarrivaIdentifierCorrection} from '../narrivaInputPrivacy.service.js';
import {completeNarrivaRiskAssessment} from '../narrivaRiskAssessment.service.js';
import {maskMobileClientName} from '../narrivaAccess.service.js';

const good=()=>({facts:{currentRisk:false,riskUncertain:false,serviceDocumentationSupported:true,interventionsDocumented:true,medicalNecessityDocumented:true,engagementDocumented:true,responseDocumented:true,progressDocumented:true,goalsDocumented:true,followUpDocumented:true},encounter:{dateValid:true,timesValid:true,location:'Office',modality:'in_person',consentConfirmed:true,participants:'Client and Provider',clientPresent:true},clinical:{hasDiagnosis:true,hasJustification:true,hasPresentingProblem:true,riskAssessmentComplete:false},service:{allowed:true,durationAllowed:true,modalityAllowed:true,code:'H0004',crisisSuggestion:'H2011'}});
describe('Narriva exact-content evidence policy',()=>{
 it('uses the five agreed checks in order and does not require an unindicated risk form',()=>{
  const checks=emptyNarrivaChecks().map(c=>deriveNarrivaCheck(c.id,good()));
  expect(checks.map(c=>c.id)).toEqual(['risk_safety','service_code','encounter_consent','necessity_interventions','participation_plan']);
  expect(narrivaOverall(checks)).toBe('passed');expect(checks[0].riskAssessmentRequired).toBe(false);
 });
 it.each(['currentRisk','riskUncertain'])('requires an unbypassable risk form for %s',key=>{
  const input=good();input.facts[key]=true;const result=deriveNarrivaCheck('risk_safety',input);
  expect(result.riskAssessmentRequired).toBe(true);expect(result.findings[0].canBypass).toBe(false);
  expect(()=>bypassNarrivaFinding({checks:[result]},result.findings[0].id,'Keep this note',1)).toThrow();
 });
 it('retains the server risk requirement after editing and rejects a contradictory blanket denial',()=>{
  const input=good();input.clinical.riskRequiredFromPriorReview=true;
  expect(deriveNarrivaCheck('risk_safety',input).riskAssessmentRequired).toBe(true);
  input.facts.currentRisk=true;input.clinical.riskAssessmentComplete=true;input.clinical.riskAssessmentDeniesAll=true;
  expect(deriveNarrivaCheck('risk_safety',input).findings[0].id).toBe('risk_safety:denial_conflict');
 });
 it('keeps participant findings in check 2 and never in encounter/consent',()=>{
  const input=good();input.facts.clientPresent=false;
  expect(deriveNarrivaCheck('service_code',input).findings[0].id).toBe('service_code:client_absent');
  expect(deriveNarrivaCheck('encounter_consent',input).status).toBe('passed');
 });
 it('suggests only an explicitly eligible crisis service without changing the billed code',()=>{
  const input=good();input.facts.crisisService=true;
  expect(deriveNarrivaCheck('service_code',input).findings[0].message).toContain('H2011');
  expect(input.service.code).toBe('H0004');input.service.crisisSuggestion=null;
  expect(deriveNarrivaCheck('service_code',input).findings[0].message).not.toContain('90839');
 });
 it('requires actual assessment evidence when mentioned, or records a bypass without verification',()=>{
  const input=good();input.facts.assessmentMentioned=true;
  const check=deriveNarrivaCheck('necessity_interventions',input);
  const review=bypassNarrivaFinding({checks:[check],quickSignEligible:true},check.findings[0].id,'The assessment remains in the source EHR.',17);
  expect(review.status).toBe('bypassed');expect(review.quickSignEligible).toBe(false);
  expect(review.checks[0].findings[0]).toMatchObject({bypassedBy:17,bypassed:true});
 });
 it('never invents consent, interventions, or a treatment plan from missing fields',()=>{
  const input=good();input.encounter.consentConfirmed=false;input.facts.interventionsDocumented=null;input.facts.goalsDocumented=null;
  for(const id of ['encounter_consent','necessity_interventions','participation_plan'])expect(deriveNarrivaCheck(id,input).status).toBe('action_required');
 });
 it('hashes order-insensitively but invalidates content, service and attachment changes',()=>{
  expect(narrivaSourceHash({a:1,b:2})).toBe(narrivaSourceHash({b:2,a:1}));
  for(const change of [{body:'changed'},{code:'H2011'},{assessment:{id:1,updatedAt:'new'}}])expect(narrivaSourceHash(change)).not.toBe(narrivaSourceHash({}));
 });
});
describe('Narriva local clinical facts and privacy boundary',()=>{
 const source=()=>({source:{service_code:'H2011',date_of_service:'2026-11-06'},provider:{role:'provider',credential:'BA'},serviceRule:{is_active:1,unit_calc_mode:'MEDICAID_8_MINUTE_LADDER',unit_minutes:15,min_minutes:8,max_minutes:247,max_units_per_session:16,allowed_credential_tiers_json:'["qbha","bachelors","intern_plus"]',allowed_place_of_service_json:'["11"]'},meta:{sessionContext:{durationMinutes:60,startTimeLocal:'09:00',endTimeLocal:'10:00',locationLabel:'Office',placeOfService:'11',participants:'Client and provider'},narrivaContext:{modality:'in_person',consentConfirmed:true}},session:{}});
 it('permits base H2011 for a qualified bachelors provider using the real unit rules',()=>{
  const result=narrivaLocalContext(source());expect(result.service).toMatchObject({allowed:true,durationAllowed:true,modalityAllowed:true});expect(result.encounter.timesValid).toBe(true);
 });
 it('does not pass invalid actual times just because both fields exist',()=>{
  const input=source();input.session={actual_start_at:'2026-11-06 10:00:00',actual_end_at:'2026-11-06 09:00:00'};
  expect(narrivaLocalContext(input).encounter.timesValid).toBe(false);
  input.session.actual_end_at='2026-11-06 11:30:00';expect(narrivaLocalContext(input).encounter.timesValid).toBe(false);
 });
 it('does not verify a service changed only in note metadata or a draft while the encounter still has another code',()=>{
  const input=source();input.session={id:77,service_code:'H0004'};
  expect(narrivaLocalContext(input).service.allowed).toBe(false);
  input.session.service_code='H2011';input.meta.serviceCode='H0004';
  expect(narrivaLocalContext(input).service.allowed).toBe(false);
 });
 it('enforces modality/POS restrictions and the 247-minute base-code maximum',()=>{
  const input=source();input.meta.sessionContext.placeOfService='02';expect(narrivaLocalContext(input).service.modalityAllowed).toBe(false);
  input.meta.sessionContext.durationMinutes=248;expect(narrivaLocalContext(input).service.durationAllowed).toBe(false);
  input.source.service_code='H2011 ET';expect(narrivaLocalContext(input).service.allowed).toBe(false);
 });
 it('does not accept arbitrary metadata as a completed risk assessment',()=>{
  for(const data of [{reviewed:false},{foo:0},{items:{}},null])expect(completeNarrivaRiskAssessment(data)).toBe(false);
  expect(completeNarrivaRiskAssessment({patientDeniesAll:true})).toBe(true);
  expect(completeNarrivaRiskAssessment({areas:[{name:'Current self-harm risk, clinician assessed'}]})).toBe(true);
 });
 it('blocks known identities and contact identifiers before generation without echoing PHI',()=>{
  for(const text of ['Jane Example reported','jane@example.test','303-555-0101','DOB: 2014-04-14']){
   expect(containsNarrivaIdentifiers(text,['Jane Example'])).toBe(true);
   try{requireNarrivaIdentifierCorrection(text,['Jane Example']);}catch(e){expect(e.code).toBe('PHI_INPUT_REQUIRES_CORRECTION');expect(e.message).not.toContain(text);}
  }
  expect(containsNarrivaIdentifiers('Client practiced grounding and identified triggers.')).toBe(false);
 });
 it('masks short, long and Unicode client names on the server',()=>{
  expect(maskMobileClientName({first_name:'Michael',last_name:'Mendez'})).toBe('Mic* Men*');
  expect(maskMobileClientName({first_name:'Li',last_name:'Ng'})).toBe('Li Ng');
  expect(maskMobileClientName({first_name:'Élodie',last_name:'Álvarez'})).toBe('Élo* Álv*');
 });
});

import {describe,it,expect} from 'vitest';
import {deriveNarrivaCheck,emptyNarrivaChecks,bypassNarrivaFinding,narrivaSourceHash,narrivaOverall} from '../narrivaReviewPolicy.service.js';
import {narrivaLocalContext} from '../narrivaSource.service.js';
import {containsNarrivaIdentifiers,requireNarrivaIdentifierCorrection} from '../narrivaInputPrivacy.service.js';
import {completeNarrivaRiskAssessment} from '../narrivaRiskAssessment.service.js';
import {resolveSessionBilling} from '../serviceCodeUnits.service.js';
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
 it('reconciles a pro bono crisis against its actual underlying service while preserving the funding choice',()=>{
  const input=good();input.facts.crisisService=true;
  Object.assign(input.service,{code:'PRO-BONO SERVICE',documentationCode:'H0004',proBono:true});
  const result=deriveNarrivaCheck('service_code',input);
  expect(result.findings).toEqual([expect.objectContaining({id:'service_code:crisis',action:'clinical_service'})]);
  expect(result.findings[0].message).toContain('H2011');expect(result.findings[0].message).toContain('Keep Pro-Bono Service as the funding and billing disposition');
  expect(input.service.code).toBe('PRO-BONO SERVICE');expect(input.service.documentationCode).toBe('H0004');
 });
 it('does not infer a crisis or recommend an ineligible new code from a pro bono funding choice',()=>{
  const input=good();Object.assign(input.service,{code:'PRO-BONO SERVICE',documentationCode:'H0004',proBono:true,crisisSuggestion:null});
  expect(deriveNarrivaCheck('service_code',input).findings).toEqual([]);
  input.facts.crisisService=true;const result=deriveNarrivaCheck('service_code',input);
  expect(result.findings[0].action).toBe('clinical_service');expect(result.findings[0].message).not.toContain('H2011');
  input.service.documentationCode='H2011';expect(deriveNarrivaCheck('service_code',input).findings).toEqual([]);
 });
 it('routes pro bono documentation corrections to the clinical service without treating free funding as clinical evidence',()=>{
  const input=good();Object.assign(input.service,{code:'PRO-BONO SERVICE',documentationCode:'90837',proBono:true});input.facts.serviceDocumentationSupported=false;
  expect(deriveNarrivaCheck('service_code',input).findings).toEqual([expect.objectContaining({id:'service_code:documentation',action:'clinical_service'})]);
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
 const proBonoSource=()=>{
  const input=source();input.source.service_code='PRO-BONO SERVICE';input.session={id:77,service_code:'PRO-BONO SERVICE'};
  input.meta={...input.meta,serviceCode:'PRO-BONO SERVICE',underlyingServiceCode:'H2011',fundingDisposition:'pro_bono'};
  input.documentationServiceRule=input.serviceRule;
  // A funding policy may be permissive about minutes/qualification; only the
  // actual clinical rule can establish what this provider delivered.
  input.serviceRule={is_active:1,unit_calc_mode:'NONE',min_minutes:0,max_minutes:999};
  return input;
 };
 it.each([[30,2],[38,3],[53,4],[67,4],[68,5]])('keeps a%s-minute H0004 clinical note reviewable with%s actual units while preserving the billing hold',(minutes,units)=>{
  const input=source();input.source.service_code='H0004';input.session={id:77,service_code:'H0004'};input.serviceRule={...input.serviceRule,max_minutes:15,max_units_per_session:4};input.meta.sessionContext.durationMinutes=minutes;input.meta.sessionContext.endTimeLocal=`${9+Math.floor(minutes/60)}`.padStart(2,'0')+':'+`${minutes%60}`.padStart(2,'0');
  const local=narrivaLocalContext(input);expect(local.service).toMatchObject({code:'H0004',durationAllowed:true,billingDurationAllowed:minutes<68,billingUnits:units});
  const reviewInput=good();reviewInput.service=local.service;const checks=emptyNarrivaChecks().map(check=>deriveNarrivaCheck(check.id,reviewInput));expect(narrivaOverall(checks)).toBe('passed');
  if(minutes>=68){expect(checks[1].findings).toEqual([]);expect(checks[1].advisories).toEqual([expect.objectContaining({category:'billing_review',blocksClaims:true,units})]);expect(resolveSessionBilling({serviceCode:'H0004',minutes,unitCalcMode:'MEDICAID_8_MINUTE_LADDER',unitMinutes:15,minMinutes:8,maxUnitsPerSession:4})).toMatchObject({claimable:false,requiresReview:true,units});}
 });
 it('retains non-overridable invalid-duration findings outside the explicit H0004 review exception',()=>{
  const input=source();input.source.service_code='H0004';input.session={id:77,service_code:'H0004'};input.serviceRule={...input.serviceRule,max_minutes:45,max_units_per_session:4};input.meta.sessionContext.durationMinutes=60;
  const local=narrivaLocalContext(input),reviewInput=good();reviewInput.service=local.service;expect(local.service.durationAllowed).toBe(false);expect(local.service.billingReview).toBeNull();expect(deriveNarrivaCheck('service_code',reviewInput).findings).toContainEqual(expect.objectContaining({id:'service_code:duration',canBypass:false}));
  input.serviceRule.max_minutes=null;input.meta.sessionContext.durationMinutes=7;expect(narrivaLocalContext(input).service.durationAllowed).toBe(false);
 });
 it('permits base H2011 for a qualified bachelors provider using the real unit rules',()=>{
  const result=narrivaLocalContext(source());expect(result.service).toMatchObject({allowed:true,durationAllowed:true,modalityAllowed:true});expect(result.encounter.timesValid).toBe(true);
 });
 it('validates explicit pro bono underlying H2011 while preserving the no-charge service and metadata',()=>{
  const input=proBonoSource(),before=structuredClone(input),result=narrivaLocalContext(input);
  expect(result.service).toMatchObject({code:'PRO-BONO SERVICE',documentationCode:'H2011',proBono:true,allowed:true,durationAllowed:true,modalityAllowed:true});
  expect(input).toEqual(before);expect(input.meta.fundingDisposition).toBe('pro_bono');
 });
 it.each([[7,false],[8,true],[247,true],[248,false]])('uses the underlying H2011 duration rule for a free %i-minute encounter', (minutes,allowed)=>{
  const input=proBonoSource();input.meta.sessionContext.durationMinutes=minutes;
  const end=9*60+minutes;input.meta.sessionContext.endTimeLocal=`${Math.floor(end/60)}`.padStart(2,'0')+':'+`${end%60}`.padStart(2,'0');
  expect(narrivaLocalContext(input).service.durationAllowed).toBe(allowed);
  expect(input.source.service_code).toBe('PRO-BONO SERVICE');
 });
 it('does not let free funding authorize an ineligible underlying psychotherapy service for a bachelor',()=>{
  const input=proBonoSource();input.meta.underlyingServiceCode='90837';
  input.documentationServiceRule={is_active:1,unit_calc_mode:'SINGLE',min_minutes:53,max_minutes:74,allowed_credential_tiers_json:'["intern_plus"]'};
  expect(narrivaLocalContext(input).service).toMatchObject({code:'PRO-BONO SERVICE',documentationCode:'90837',proBono:true,allowed:false});
 });
 it('does not infer a missing underlying service from a free encounter duration or authoring tool',()=>{
  const input=proBonoSource();delete input.meta.underlyingServiceCode;input.meta.toolId='clinical_h2011_note';delete input.documentationServiceRule;
  const result=narrivaLocalContext(input);expect(result.service).toMatchObject({code:'PRO-BONO SERVICE',documentationCode:null,proBono:true,allowed:false,durationAllowed:false});
  expect(result.service.reason).toContain('Select the actual clinical service');
 });
 it('requires an actual enabled underlying rule even when the funding policy itself is active',()=>{
  const input=proBonoSource();delete input.documentationServiceRule;
  expect(narrivaLocalContext(input).service).toMatchObject({proBono:true,allowed:false,durationAllowed:false});
  input.documentationServiceRule={...source().serviceRule,is_active:0};
  expect(narrivaLocalContext(input).service.allowed).toBe(false);
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
 it('blocks the protected mobile name abbreviations as well as full names before generation or review',()=>{
  for(const text of ['Mic* Men* practiced grounding.','Élo* Álv* participated.']){
   expect(containsNarrivaIdentifiers(text,['Michael Mendez','Élodie Álvarez'])).toBe(true);
   expect(()=>requireNarrivaIdentifierCorrection(text,['Michael Mendez','Élodie Álvarez'])).toThrow(expect.objectContaining({code:'PHI_INPUT_REQUIRES_CORRECTION'}));
  }
 });
 it('masks short, long and Unicode client names on the server',()=>{
  expect(maskMobileClientName({first_name:'Michael',last_name:'Mendez'})).toBe('Mic* Men*');
  expect(maskMobileClientName({first_name:'Li',last_name:'Ng'})).toBe('Li Ng');
  expect(maskMobileClientName({first_name:'Élodie',last_name:'Álvarez'})).toBe('Élo* Álv*');
 });
});

import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),load:vi.fn(),agency:vi.fn(),model:vi.fn(),policy:vi.fn(),audit:vi.fn(),knowledge:vi.fn(),requireAgency:vi.fn(),guidance:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:()=>()=>{}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:s=>'sealed:'+s,maybeDecryptNotePayload:s=>s?.startsWith('sealed:')?s.slice(7):s}));
vi.mock('../narrivaSource.service.js',()=>({loadNarrivaSource:m.load}));
vi.mock('../sessionAiPrivacy.service.js',()=>({callPrivateSessionText:m.model,createSessionPrivacyContext:input=>({testPrivacyInput:input})}));
vi.mock('../clinicalKnowledgeBase.service.js',()=>({getKnowledgeBaseContext:m.knowledge,noteAidKnowledgeBaseOptions:v=>v}));
vi.mock('../narrivaGuidance.service.js',()=>({loadNarrivaGuidanceContext:m.guidance}));
vi.mock('../supervisedBillingPolicy.service.js',()=>({resolveNoteDocumentationPolicy:m.policy}));
vi.mock('../noteAidChartAudit.service.js',()=>({logNoteAidChartEvent:m.audit}));
// Source ownership is exercised by its own tests; this suite drives the real
// asynchronous review runner, persisted result transitions, rules and sign gate.
vi.mock('../narrivaAccess.service.js',async importOriginal=>{const actual=await importOriginal();return {...actual,requireNarrivaAgency:m.requireAgency};});
import {createNarrivaReview,readNarrivaReview,resolveNarrivaFinding,assertNarrivaQuickSign,narrivaModelPayload} from '../narrivaReview.service.js';
import {assertNarrivaRiskBeforeSignature} from '../narrivaRiskAssessment.service.js';
import {narrivaSourceHash,NARRIVA_QUALITY_CRITERIA,NARRIVA_RULES_VERSION} from '../narrivaReviewPolicy.service.js';
let rows,source,facts,features,riskRequired,referenceVersion,requiredReferenceComplete,supportCoverageComplete;
const clinician={id:7,role:'provider'},supervisor={id:9,role:'supervisor'};
const req=(user=supervisor,extra={})=>({user,body:{agencyId:2,noteId:25,...extra},params:{}});
const drain=()=>new Promise(resolve=>setImmediate(resolve));
async function completedReview(extra={}){const review=await createNarrivaReview(req(supervisor,extra));for(let i=0;i<3;i++)await drain();return readNarrivaReview(supervisor,review.id,2);}
beforeEach(()=>{
 vi.clearAllMocks();rows=new Map();features={};riskRequired=false;referenceVersion=1;requiredReferenceComplete=true;supportCoverageComplete=true;
 source={agencyId:2,noteId:25,draftId:null,source:{id:25,agency_id:2,client_id:10,clinical_session_id:20,created_by_user_id:7,provider_signed_by_user_id:7,provider_signed_at:'2026-11-06T10:00:00Z',supervisor_cosigned_at:null,clinical_version_pending_id:null},
  meta:{toolId:'clinical_psychotherapy_note'},narrative:'Client reported anxiety impairing school attendance. Provider modeled paced breathing and practiced two rounds with Client. The breathing intervention addressed panic during school transitions. Client reported less tension after the breathing practice. Client completed the second round without prompts after three prompts initially. This practiced the existing coping goal of using one skill during school transitions. Client will practice this breathing skill before the next school transition.',inputText:'Factual Session Narrative.',
  client:{id:10,full_name:'Private Client',first_name:'Private',last_name:'Client',initials:'PC',email:'private@example.com'},provider:{first_name:'Private',last_name:'Provider'},identifiers:['Private Client','private@example.com'],
  service:{code:'90837',allowed:true,durationAllowed:true,modalityAllowed:true},encounter:{durationMinutes:60,dateValid:true,timesValid:true,location:'Office',modality:'in_person',consentConfirmed:true,participants:'Client and Provider',clientPresent:true,additionalParticipantsDocumented:false},
  clinical:{hasDiagnosis:true,hasJustification:true,hasPresentingProblem:true,riskAssessmentComplete:false,assessmentEvidencePresent:false,riskRequiredFromPriorReview:false}};
 facts={currentRisk:false,riskUncertain:false,safetyInterventionsNecessary:false,safetyInterventionsDocumented:false,clientPresent:true,additionalParticipants:false,crisisService:false,serviceDocumentationSupported:true,interventionsDocumented:true,medicalNecessityDocumented:true,assessmentMentioned:false,engagementDocumented:true,responseDocumented:true,progressDocumented:true,goalsDocumented:true,followUpDocumented:true};
 facts.qualityEvidence=Object.fromEntries(NARRIVA_QUALITY_CRITERIA.map(c=>[c.id,{supported:true,evidence:[source.narrative]}]));
 m.guidance.mockImplementation(async(input,{knowledge})=>{const guidance=await knowledge({query:input.service.code});return {guidance,guidanceHash:narrivaSourceHash({guidance,referenceVersion}),reference:{code:input.service.code,status:'available'},serviceReferenceHash:narrivaSourceHash({code:input.service.code,referenceVersion}),requiredReferenceComplete,supportCoverageComplete,supportCoverage:{authoredExamples:true}};});
 m.agency.mockImplementation(async()=>({id:2,feature_flags:JSON.stringify({narriva:features})}));m.knowledge.mockResolvedValue('Author guidance: document only actual session evidence.');m.policy.mockResolvedValue({supervisorUserId:9});m.model.mockImplementation(async()=>({text:JSON.stringify(facts),modelName:'synthetic-test'}));m.audit.mockResolvedValue({});
 m.load.mockImplementation(async(user,input)=>{if(![7,9].includes(Number(user.id)))throw Object.assign(new Error('Only authorized author/reviewer'),{status:403});if(Number(input.agencyId)!==2||Number(input.noteId)!==25)throw Object.assign(new Error('Source not found'),{status:404});return {...source,sourceHash:narrivaSourceHash({narrative:source.narrative,meta:source.meta,service:source.service,encounter:source.encounter,clinical:source.clinical,snapshot:source.source})};});
 m.execute.mockImplementation(async(sql,args=[])=>{
  if(sql.includes('MAX(risk_assessment_required)'))return [[{required:riskRequired?1:0}]];
  if(sql.startsWith('INSERT INTO narriva_reviews')){const id=rows.size+1;rows.set(id,{id,agency_id:args[0],actor_user_id:args[1],draft_id:args[2],clinical_note_id:args[3],clinical_session_id:args[4],source_hash:args[5],rules_version:args[6],status:args[7],result_encrypted:args[8],created_at:new Date()});return [{insertId:id}];}
  if(sql.startsWith('UPDATE narriva_reviews')){const row=rows.get(args[4]);Object.assign(row,{status:args[0],result_encrypted:args[1],risk_assessment_required:Math.max(row.risk_assessment_required||0,args[2]),completed_at:args[3]});return [{affectedRows:1}];}
  if(sql.startsWith('SELECT * FROM narriva_reviews'))return [[rows.get(Number(args[0]))].filter(Boolean)];
  return [[]];
 });
});
describe('server-owned Narriva review and Quick Sign boundary',()=>{
 it.each(['narrative','inputText'])('blocks known identifiers in %s before model dispatch and preserves the saved source',async field=>{
  const original=source[field]+' Private Client';source[field]=original;
  const review=await completedReview();expect(review.status).toBe('unavailable');expect(review.quickSignEligible).toBe(false);expect(review.message).toContain('identifying information');
  expect(m.model).not.toHaveBeenCalled();expect(source[field]).toBe(original);
 });
 it('ignores a client claim that all checks passed and begins as ineligible',async()=>{const pending=await createNarrivaReview(req(supervisor,{status:'passed',quickSignEligible:true,checks:Array.from({length:5},()=>({status:'passed'}))}));expect(pending.status).toBe('running');expect(pending.quickSignEligible).toBe(false);expect(pending.checks.every(c=>c.status==='pending')).toBe(true);await drain();});
 it('becomes Quick Sign eligible only after the persisted exact-note five-check review finishes',async()=>{const result=await completedReview();expect(result.status).toBe('passed');expect(result.checks).toHaveLength(5);expect(result.checks.map(c=>c.id)).toEqual(['risk_safety','service_code','encounter_consent','necessity_interventions','participation_plan']);expect(result.quickSignEligible).toBe(true);await expect(assertNarrivaQuickSign({user:supervisor,noteId:25,agencyId:2,reviewId:result.id})).resolves.toMatchObject({status:'passed'});});
 it.each(['not json','null','[]','{}','{"currentRisk":"false"}'])('fails closed for malformed model evidence %s',async text=>{m.model.mockResolvedValue({text});const result=await completedReview();expect(result.status).toBe('unavailable');expect(result.quickSignEligible).toBe(false);await expect(assertNarrivaQuickSign({user:supervisor,noteId:25,agencyId:2,reviewId:result.id})).rejects.toMatchObject({status:409});});
 it('does not reuse an old pass after saved note content changes',async()=>{const review=await completedReview();source.narrative+=' New clinical content.';const changed=await readNarrivaReview(supervisor,review.id,2);expect(changed.status).toBe('stale');expect(changed.quickSignEligible).toBe(false);await expect(assertNarrivaQuickSign({user:supervisor,noteId:25,agencyId:2,reviewId:review.id})).rejects.toMatchObject({status:409});});
 it('detects metadata, code, encounter and signed snapshot changes too',async()=>{const review=await completedReview();source.encounter.durationMinutes=45;source.service.code='90834';source.meta.clientPresent=false;source.source.clinical_version_pending_id=88;expect((await readNarrivaReview(supervisor,review.id,2)).status).toBe('stale');});
 it('does not accept another note id even when the review itself passed',async()=>{const review=await completedReview();await expect(assertNarrivaQuickSign({user:supervisor,noteId:26,agencyId:2,reviewId:review.id})).rejects.toMatchObject({status:409});});
 it('does not allow the author to Quick Sign as their own supervisor',async()=>{const review=await completedReview();const asAuthor=await readNarrivaReview(clinician,review.id,2);expect(asAuthor.quickSignEligible).toBe(false);await expect(assertNarrivaQuickSign({user:clinician,noteId:25,agencyId:2,reviewId:review.id})).rejects.toMatchObject({status:409});});
 it('rechecks current supervisor assignment at signing time',async()=>{const review=await completedReview();m.policy.mockResolvedValue({supervisorUserId:8});await expect(assertNarrivaQuickSign({user:supervisor,noteId:25,agencyId:2,reviewId:review.id})).rejects.toMatchObject({status:409});});
 it('invalidates a previous pass when the retrieved authored training guidance changes',async()=>{const review=await completedReview();m.knowledge.mockResolvedValue('Updated author guidance requires revised clinical evidence.');const current=await readNarrivaReview(supervisor,review.id,2);expect(current.status).toBe('stale');expect(current.quickSignEligible).toBe(false);await expect(assertNarrivaQuickSign({user:supervisor,noteId:25,agencyId:2,reviewId:review.id})).rejects.toMatchObject({status:409});});
 it('does not reuse a pass when current required training guidance becomes unavailable',async()=>{const review=await completedReview();m.knowledge.mockRejectedValue(new Error('Guidance unavailable'));const current=await readNarrivaReview(supervisor,review.id,2);expect(current.status).toBe('unavailable');expect(current.quickSignEligible).toBe(false);});
 it('rechecks workspace feature disablement after a successful review',async()=>{const review=await completedReview();features.quickSign=false;await expect(assertNarrivaQuickSign({user:supervisor,noteId:25,agencyId:2,reviewId:review.id})).rejects.toMatchObject({status:409});});
 it('does not reveal a persisted review across workspace or source permission boundaries',async()=>{const review=await completedReview();await expect(readNarrivaReview(supervisor,review.id,3)).rejects.toMatchObject({status:404});await expect(readNarrivaReview({id:88,role:'provider'},review.id,2)).rejects.toMatchObject({status:403});});
 it('records an allowed bypass without granting Quick Sign eligibility',async()=>{facts.responseDocumented=false;const review=await completedReview();expect(review.status).toBe('action_required');const request=req(supervisor,{action:'bypass',findingId:'participation_plan:responseDocumented',reason:'Reviewed original source; retaining the authored note.',quickSignEligible:true});request.params.reviewId=review.id;const bypass=await resolveNarrivaFinding(request);expect(bypass.status).toBe('bypassed');expect(bypass.quickSignEligible).toBe(false);await expect(assertNarrivaQuickSign({user:supervisor,noteId:25,agencyId:2,reviewId:review.id})).rejects.toMatchObject({status:409});});
 it('cannot bypass a required risk assessment',async()=>{facts.currentRisk=true;const review=await completedReview();expect(review.riskAssessmentRequired).toBe(true);const request=req(supervisor,{action:'bypass',findingId:'risk_safety:assessment',reason:'Would prefer to keep this note.'});request.params.reviewId=review.id;await expect(resolveNarrivaFinding(request)).rejects.toMatchObject({status:409});});
 it('does not send identity records, service dates, storage ids or signature metadata as model fields',()=>{const payload=narrivaModelPayload(source);expect(Object.keys(payload).sort()).toEqual(['deliveryMethod','documentationCode','durationMinutes','fundingDisposition','note','participants','serviceCode','sessionNarrative'].sort());expect(JSON.stringify(payload)).not.toMatch(/Private Client|private@example|provider_signed|clinical_session_id/);});
});

describe('grounded quality score and independent mandatory gates',()=>{
 it('compares an explicit pro bono clinical service without identifying fields or changing free funding',async()=>{
  Object.assign(source.service,{code:'PRO-BONO SERVICE',documentationCode:'H0004',proBono:true,crisisSuggestion:'H2011'});facts.crisisService=true;
  const result=await completedReview();
  expect(narrivaModelPayload(source)).toMatchObject({serviceCode:'PRO-BONO SERVICE',documentationCode:'H0004',fundingDisposition:'pro_bono'});
  expect(m.model.mock.calls[0][0].prompt).toContain('preserving pro bono funding and billing');
  expect(result.checks[1].findings).toEqual([expect.objectContaining({id:'service_code:crisis',action:'clinical_service'})]);
  expect(result).toMatchObject({status:'action_required',quickSignEligible:false,scoring:{score:100,mandatoryPassed:false,passed:false}});
  expect(source.service.code).toBe('PRO-BONO SERVICE');expect(source.service.documentationCode).toBe('H0004');
 });
 it('returns a server-computed score with criteria, excluded points and an explanation',async()=>{
  const result=await completedReview();
  expect(result).toMatchObject({status:'passed',rulesVersion:NARRIVA_RULES_VERSION,scoring:{score:100,threshold:70,earned:95,possible:95,passed:true,mandatoryPassed:true,qualityPassed:true}});
  expect(result.scoring.criteria).toHaveLength(7);
  expect(result.scoring.criteria.find(c=>c.id==='assessment_integration')).toMatchObject({status:'not_applicable',earned:0,possible:0});
  expect(result.scoring.disclaimer).toContain('not a guarantee');
  const {prompt}=m.model.mock.calls[0][0];expect(prompt).toContain('exact selected service definition');expect(prompt).toContain('Author guidance');expect(prompt).toContain('never Session Narrative input');
 });
 it('does not accept caller/model percentages or treat all five passed panels as sufficient',async()=>{
  facts.qualityEvidence.goal_linkage.supported=null;facts.qualityEvidence.follow_up_specificity.supported=false;facts.score=100;facts.scoring={score:100,passed:true};
  const result=await completedReview({score:100,scoring:{score:100,threshold:0,passed:true}});
  expect(result.checks.every(c=>c.status==='passed')).toBe(true);
  expect(result).toMatchObject({status:'action_required',quickSignEligible:false,scoring:{score:68,earned:65,possible:95,mandatoryPassed:true,qualityPassed:false,passed:false}});
  await expect(assertNarrivaQuickSign({user:supervisor,noteId:25,agencyId:2,reviewId:result.id})).rejects.toMatchObject({status:409});
 });
 it('permits exactly 70 percent only with all mandatory evidence still present',async()=>{
  facts.assessmentMentioned=true;source.clinical.assessmentEvidencePresent=true;
  facts.qualityEvidence.goal_linkage.supported=null;facts.qualityEvidence.follow_up_specificity.supported=false;
  const result=await completedReview();expect(result).toMatchObject({status:'passed',quickSignEligible:true,scoring:{score:70,earned:70,possible:100,mandatoryPassed:true,passed:true}});
 });
 it.each(['risk','service','consent','interventions','plan'])('does not let 100 quality points hide a required %s correction',async blocker=>{
  if(blocker==='risk')facts.currentRisk=true;
  if(blocker==='service')source.service.allowed=false;
  if(blocker==='consent')source.encounter.consentConfirmed=false;
  if(blocker==='interventions')facts.interventionsDocumented=false;
  if(blocker==='plan')facts.followUpDocumented=false;
  const result=await completedReview();expect(result).toMatchObject({status:'action_required',quickSignEligible:false,scoring:{score:100,qualityPassed:true,mandatoryPassed:false,passed:false}});
 });
 it('does not earn points from input-only facts, reference examples or hallucinated quotes',async()=>{
  const inputOnly='The participant reported a newly observed improvement after rehearsal.';source.inputText=inputOnly;
  for(const c of Object.values(facts.qualityEvidence))c.evidence=[inputOnly];
  const result=await completedReview();expect(result.scoring).toMatchObject({score:0,earned:0,mandatoryPassed:true,passed:false});
  expect(result.status).toBe('action_required');expect(result.quickSignEligible).toBe(false);
 });
 it.each(['missing_quality','missing_criterion','string_support','string_evidence'])('fails closed for malformed quality evidence (%s)',async malformed=>{
  if(malformed==='missing_quality')delete facts.qualityEvidence;
  if(malformed==='missing_criterion')delete facts.qualityEvidence.intervention_specificity;
  if(malformed==='string_support')facts.qualityEvidence.intervention_specificity.supported='true';
  if(malformed==='string_evidence')facts.qualityEvidence.intervention_specificity.evidence=source.narrative;
  const result=await completedReview();expect(result.status).toBe('unavailable');expect(result.quickSignEligible).toBe(false);expect(result.scoring.passed).toBe(false);
 });
 it('records a below-threshold bypass without changing the score and preserves the no-Quick-Sign decision',async()=>{
  facts.qualityEvidence.goal_linkage.supported=false;facts.qualityEvidence.follow_up_specificity.supported=false;
  const review=await completedReview();
  const request=req(supervisor,{action:'bypass',findingId:'scoring:threshold',reason:'Reviewed the authored source and retained its wording.',scoring:{score:100,passed:true}});request.params.reviewId=review.id;
  const result=await resolveNarrivaFinding(request);expect(result).toMatchObject({status:'bypassed',quickSignEligible:false,scoring:{score:68,passed:false}});
  const reloaded=await readNarrivaReview(supervisor,review.id,2);expect(reloaded).toMatchObject({status:'bypassed',quickSignEligible:false,scoring:{score:68,passed:false}});
  expect(reloaded.scoring.findings[0]).toMatchObject({id:'scoring:threshold',bypassed:true,bypassedBy:9});
 });
 it('recomputes score from persisted evidence instead of trusting a stored aggregate percentage',async()=>{
  for(const c of Object.values(facts.qualityEvidence))c.supported=null;
  const review=await completedReview(),row=rows.get(review.id),stored=JSON.parse(row.result_encrypted.slice(7));
  stored.scoring={score:100,threshold:1,passed:true,qualityPassed:true,mandatoryPassed:true};stored.status='passed';row.result_encrypted='sealed:'+JSON.stringify(stored);
  const result=await readNarrivaReview(supervisor,review.id,2);expect(result).toMatchObject({status:'action_required',quickSignEligible:false,scoring:{score:0,threshold:70,passed:false}});
 });
 it('invalidates a legacy rules pass rather than granting it an unreviewed score',async()=>{
  const review=await completedReview(),row=rows.get(review.id),stored=JSON.parse(row.result_encrypted.slice(7));stored.rulesVersion='2026-11-06.1';delete stored.qualityEvidence;row.result_encrypted='sealed:'+JSON.stringify(stored);
  expect(await readNarrivaReview(supervisor,review.id,2)).toMatchObject({status:'stale',quickSignEligible:false,scoring:{passed:false}});
 });
 it.each(['required_reference','authored_support'])('does not dispatch or verify when %s coverage is incomplete',async coverage=>{
  if(coverage==='required_reference')requiredReferenceComplete=false;else supportCoverageComplete=false;
  const review=await completedReview();expect(review).toMatchObject({status:'unavailable',quickSignEligible:false,scoring:{passed:false}});expect(m.model).not.toHaveBeenCalled();
 });
 it('invalidates a current pass when the exact service reference version changes',async()=>{
  const review=await completedReview();referenceVersion++;
  expect(await readNarrivaReview(supervisor,review.id,2)).toMatchObject({status:'stale',quickSignEligible:false,scoring:{passed:false}});
 });
 it('never keeps an old high quality pass when required authored support is currently unavailable',async()=>{
  const review=await completedReview();supportCoverageComplete=false;
  expect(await readNarrivaReview(supervisor,review.id,2)).toMatchObject({status:'unavailable',quickSignEligible:false,scoring:{score:100,passed:false}});
 });
});

describe('persisted risk cannot be removed through optional branding metadata',()=>{
 it('requires a risk assessment even after writerMode and narrivaContext are stripped',async()=>{riskRequired=true;await expect(assertNarrivaRiskBeforeSignature({id:25,agency_id:2,clinical_session_id:20,metadata_json:{}})).rejects.toMatchObject({status:409,code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});});
 it('does not accept UI reviewed=false or arbitrary fields as a completed assessment',async()=>{riskRequired=true;await expect(assertNarrivaRiskBeforeSignature({id:25,agency_id:2,clinical_session_id:20,metadata_json:{narrivaContext:{riskAssessmentCompleted:true},structuredChart:{riskAssessment:{reviewed:false,foo:0}}}})).rejects.toMatchObject({status:409});});
 it('accepts the actual completed editor assessment and explicit clinician confirmation',async()=>{riskRequired=true;await expect(assertNarrivaRiskBeforeSignature({id:25,agency_id:2,clinical_session_id:20,metadata_json:{narrivaContext:{riskAssessmentCompleted:true},structuredChart:{riskAssessment:{patientDeniesAll:true}}}})).resolves.toBeUndefined();});
});

describe('H0004 billing review and clinical signing separation',()=>{
 it('persists a visible advisory without making it a clinical signature blocker',async()=>{
  source.service={code:'H0004',allowed:true,durationAllowed:true,billingDurationAllowed:false,billingUnits:5,modalityAllowed:true,billingReview:{code:'H0004_DURATION_OVER_LIMIT',reason:'Actual68-minute H0004 requires billing review before any claim.',units:5,requiresReview:true,blocksClaims:true}};
  const review=await completedReview();expect(review.status).toBe('passed');expect(review.checks[1].findings).toEqual([]);expect(review.checks[1].advisories).toContainEqual(expect.objectContaining({category:'billing_review',blocksClaims:true,units:5}));
  await expect(assertNarrivaQuickSign({user:supervisor,noteId:25,agencyId:2,reviewId:review.id})).resolves.toBeTruthy();
 });
});

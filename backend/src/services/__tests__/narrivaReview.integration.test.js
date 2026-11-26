vi.mock('../noteAidIntakeSources.service.js',()=>({buildClinicalIntakeSourceContext:m.intake}));
vi.mock('../narrivaPlatformSettings.service.js',()=>({loadNarrivaSettings:async()=>({version:0,configuration:{}}),applyNarrivaWritingGuidance:async({prompt})=>({prompt,settingsVersion:0})}));
import {buildAllNormalMse} from '../../../../frontend/src/utils/noteAidMseCatalog.js';
import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),bound:vi.fn(),load:vi.fn(),agency:vi.fn(),model:vi.fn(),policy:vi.fn(),audit:vi.fn(),knowledge:vi.fn(),requireAgency:vi.fn(),guidance:vi.fn(),intake:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:()=>()=>{}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:s=>'sealed:'+s,maybeDecryptNotePayload:s=>s?.startsWith('sealed:')?s.slice(7):s}));
vi.mock('../narrivaRiskAssessment.service.js',async original=>({...await original(),verifiedBoundNarrivaReview:m.bound}));
vi.mock('../narrivaSource.service.js',()=>({loadNarrivaSource:m.load}));
vi.mock('../sessionAiPrivacy.service.js',()=>({callPrivateSessionText:m.model,createSessionPrivacyContext:input=>({testPrivacyInput:input})}));
vi.mock('../clinicalKnowledgeBase.service.js',()=>({getKnowledgeBaseContext:m.knowledge,noteAidKnowledgeBaseOptions:v=>v}));
vi.mock('../narrivaGuidance.service.js',()=>({loadNarrivaGuidanceContext:m.guidance}));
vi.mock('../supervisedBillingPolicy.service.js',()=>({resolveNoteDocumentationPolicy:m.policy}));
vi.mock('../noteAidChartAudit.service.js',()=>({logNoteAidChartEvent:m.audit}));
// Source ownership is exercised by its own tests; this suite drives the real
// asynchronous review runner, persisted result transitions, rules and sign gate.
vi.mock('../narrivaAccess.service.js',async importOriginal=>{const actual=await importOriginal();return {...actual,requireNarrivaAgency:m.requireAgency};});
import {createNarrivaReview,readNarrivaReview,resolveNarrivaFinding,assertNarrivaQuickSign,assertNarrivaPreGeneration,narrivaModelPayload,inspectNarrivaFacts} from '../narrivaReview.service.js';
import {assertNarrivaRiskBeforeSignature} from '../narrivaRiskAssessment.service.js';
import {narrivaSourceHash,NARRIVA_QUALITY_CRITERIA,NARRIVA_RULES_VERSION} from '../narrivaReviewPolicy.service.js';
let rows,source,facts,features,riskRequired,referenceVersion,requiredReferenceComplete,supportCoverageComplete;
const clinician={id:7,role:'provider'},supervisor={id:9,role:'supervisor'};
const req=(user=supervisor,extra={})=>({user,body:{agencyId:2,noteId:25,...extra},params:{}});
const approvalFor=review=>({token:review.draftApprovalToken,sections:Object.keys(review.draftPreviewSections || {})});
const drain=()=>new Promise(resolve=>setImmediate(resolve));
async function completedReview(extra={}){const review=await createNarrivaReview(req(supervisor,extra));for(let i=0;i<3;i++)await drain();return readNarrivaReview(supervisor,review.id,2);}
beforeEach(()=>{
 vi.clearAllMocks();m.intake.mockResolvedValue({contextText:'SYNTHETIC completed enrollment clinical answers',sources:[{submissionId:1,questionCount:8}],instruments:[]});m.bound.mockResolvedValue(null);rows=new Map();features={};riskRequired=false;referenceVersion=1;requiredReferenceComplete=true;supportCoverageComplete=true;
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
  if(sql.startsWith('SELECT result_encrypted FROM narriva_reviews'))return [[...rows.values()].filter(row=>row.agency_id===args[0] && row.actor_user_id===args[1] && row.clinical_session_id===args[2] && row.draft_id===args[3] && !row.clinical_note_id && row.id<args[4] && row.completed_at).reverse().slice(0,4)];
  if(sql.includes('ORDER BY id DESC LIMIT 50'))return [[...rows.values()].filter(row=>Number(row.agency_id)===Number(args[0]) && Number(row.actor_user_id)===Number(args[1]) && Number(row.draft_id)===Number(args[2]) && Number(row.clinical_session_id)===Number(args[3])).sort((a,b)=>b.id-a.id)];
  if(sql.startsWith('SELECT id,result_encrypted FROM narriva_reviews')){const row=rows.get(Number(args[0]));return [[row].filter(row=>row && row.status==='running' && Number(row.agency_id)===Number(args[1]) && Number(row.actor_user_id)===Number(args[2]))];}
  if(sql.startsWith('SELECT * FROM narriva_reviews'))return [[rows.get(Number(args[0]))].filter(Boolean)];
  return [[]];
 });
});
describe('server-owned Narriva review and Quick Sign boundary',()=>{
 it('writes the draft while checking source safety and leaves documentation scoring for the signed copy',async()=>{
  const draft={...source,phase:'pre_generation',draftId:43,noteId:null};
  let resolveSafety;
  const pendingSafety=new Promise(resolve=>{resolveSafety=resolve;});
  const model=vi.fn(async ({prompt})=>{
   if(prompt.includes('Check these clinician-supplied encounter facts'))return pendingSafety;
   return {text:'Subjective\nSynthetic documented clinical concerns.',modelName:'synthetic-test',finishReason:'STOP'};
  });
  const running=inspectNarrivaFacts(draft,{model,review:{backgroundQuality:true}});
  await drain();
  expect(model).toHaveBeenCalledTimes(2);
  resolveSafety({text:JSON.stringify({currentRisk:true,riskUncertain:false,clientPresent:true,additionalParticipants:false,locationMatches:true,modalityMatches:true})});
  const checks=await running;
  expect(checks).toMatchObject({workingDraft:expect.stringContaining('Synthetic documented'),facts:{currentRisk:true},reviewedWriter:{model:'synthetic-test'}});
  expect(checks).not.toHaveProperty('qualityEvidence');
 });
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
 it('cannot bypass an explicitly included required risk assessment',async()=>{facts.currentRisk=true;source.clinical.riskAssessmentIncluded=true;const review=await completedReview();expect(review.riskAssessmentRequired).toBe(true);const request=req(supervisor,{action:'bypass',findingId:'risk_safety:assessment',reason:'Would prefer to keep this note.'});request.params.reviewId=review.id;await expect(resolveNarrivaFinding(request)).rejects.toMatchObject({status:409});});
 it('does not send identity records, service dates, storage ids or signature metadata as model fields',()=>{const payload=narrivaModelPayload(source);expect(Object.keys(payload).sort()).toEqual(['deliveryMethod','documentationCode','durationMinutes','fundingDisposition','interactiveComplexitySelected','locationCategory','note','participants','serviceCode','sessionNarrative'].sort());expect(JSON.stringify(payload)).not.toMatch(/Private Client|private@example|provider_signed|clinical_session_id/);});
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
  const {prompt}=m.model.mock.calls[0][0];expect(prompt).toContain('exact selected service definition');expect(prompt).toContain('Author guidance');expect(prompt).toContain('Never quote Session Narrative input');
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


describe('Narriva pre-generation review', () => {
  async function preflight({ backgroundQuality = false } = {}) {
    source.phase='pre_generation'; source.draftId=42; source.noteId=null; source.source.user_id=7;
    source.source.provider_signed_at=null; source.source.clinical_session_id=20;
    source.narrative=source.inputText;
    m.load.mockImplementation(async(user,input)=>({...source,phase:input.phase || 'output',sourceHash:narrivaSourceHash({narrative:source.narrative,meta:source.meta,encounter:source.encounter,phase:input.phase})}));
    const result=await createNarrivaReview({user:clinician,body:{agencyId:2,draftId:42,phase:'pre_generation',backgroundQuality}});
    for(let i=0;i<4;i++)await drain();
    return readNarrivaReview(clinician,result.id,2);
  }
  it('checks clinician evidence and the written draft quality without granting supervisor actions', async()=>{
    for(const value of Object.values(facts.qualityEvidence))value.supported=false;
    const review=await preflight();
    expect(review).toMatchObject({phase:'pre_generation',status:'passed',quickSignEligible:false,scoring:{score:0}});
    expect(m.model.mock.calls[0][0]).toMatchObject({model:'gemini-4-hydrogen',thinkingLevel:'LOW',vertexLocation:'us',allowModelFallback:false});
    expect(m.model.mock.calls.at(-1)[0].prompt).toContain('pre-generation check');
    await expect(assertNarrivaPreGeneration({user:clinician,body:{preflightReviewId:review.id,draftApproval:approvalFor(review)}},{agencyId:2,clientId:10,draftId:42,clinicalSessionId:20,inputText:source.inputText})).resolves.toMatchObject({reviewId:review.id,keptAsIs:false});
  });
  it('shows the checked draft to its author alongside current ratings',async()=>{
    const workingDraft='Private provisional wording for a synthetic session.';
    source.planReview={eligible:true,missing:[],objectives:[{goal:'Increase independence',objective:'Use the practiced strategy',rating:4,target:8}]};
    facts.draftReadyForDisplay=true;
    m.model.mockResolvedValueOnce({text:workingDraft,modelName:'reviewed-writer',finishReason:'STOP'});
    const review=await preflight();
    expect(review.status).toBe('passed');
    expect(m.model).toHaveBeenCalledTimes(2);
    const [writing,checking]=m.model.mock.calls.map(([request])=>request.prompt);
    expect(writing).toContain(source.inputText);
    expect(writing).toContain('Use the practiced strategy');
    expect(writing).toContain('"rating":4');
    expect(checking).toContain(workingDraft);
    expect(checking).toContain('Unsupported assertions in the draft do not count');
    expect(review.draftPreview).toBe(workingDraft);
    expect(review.workingDraft).toBeUndefined();
    const verified=await assertNarrivaPreGeneration({user:clinician,body:{preflightReviewId:review.id,draftApproval:approvalFor(review)}},{agencyId:2,clientId:10,draftId:42,clinicalSessionId:20,inputText:source.inputText});
    expect(verified.workingDraft).toBe(workingDraft);
    expect(verified.reviewedWriter).toMatchObject({model:'reviewed-writer',guidanceHash:expect.any(String)});
  });
  it('scores exact draft excerpts and retains the preview through completion and regeneration',async()=>{
    const text='Caregiver described difficulties with school work and home routines. Further diagnostic assessment will clarify symptoms and recommendations.';
    source.service.code='90791';source.meta.toolId='clinical_90791_intake_plan';source.encounter.clientPresent=false;facts.clientPresent=false;
    for(const item of Object.values(facts.qualityEvidence))Object.assign(item,{supported:true,evidence:[text]});
    facts.assessmentMentioned=false;
    m.model.mockImplementation(async({prompt})=>prompt.includes('Return ONLY one JSON object')?{text:JSON.stringify(facts),modelName:'checker'}:{text,modelName:'writer',finishReason:'STOP'});
    for(let attempt=0;attempt<2;attempt++){
      const review=await preflight();
      expect(review).toMatchObject({status:'passed',draftPreview:text,scoring:{score:100,earned:80,possible:80}});
      expect(review.scoring.criteria.find(c=>c.id==='response_specificity').status).toBe('not_applicable');
      expect(m.model.mock.calls.at(-1)[0].prompt).toContain('quote only the private working draft');
    }
  });
  it('does not award draft-quality points for excerpts found only in source history',async()=>{
    m.model.mockResolvedValueOnce({text:'Pending assessment of the available report.',modelName:'writer',finishReason:'STOP'});
    const review=await preflight();
    expect(review.scoring).toMatchObject({score:0,earned:0});
    expect(review.scoring.criteria.every(c=>c.status==='not_applicable' || c.status==='missing')).toBe(true);
  });
  it('does not misreport incomplete draft quality evidence as a zero-quality clinical note',async()=>{
    delete facts.qualityEvidence;
    const review=await preflight();
    expect(review.status).toBe('unavailable');expect(review.scoring.score).toBeNull();
  });
  it('preserves the authorized author preview on a real source edit while keeping finalization blocked',async()=>{
    const review=await preflight();
    source.inputText+=' New information from the caregiver.';source.narrative=source.inputText;
    const changed=await readNarrivaReview(clinician,review.id,2);
    expect(changed.status).toBe('stale');expect(changed.draftPreview).toBe(review.draftPreview);
    await expect(assertNarrivaPreGeneration({user:clinician,body:{preflightReviewId:review.id,draftApproval:approvalFor(review)}},{agencyId:2,clientId:10,draftId:42,clinicalSessionId:20,inputText:source.inputText})).rejects.toMatchObject({status:409});
  });
  it('finalizes a collateral intake with a historical direct-risk flag after all sections are approved',async()=>{
    source.service.code='90791';
    source.encounter.clientPresent=false;
    source.clinical.riskRequiredFromPriorReview=true;
    facts.clientPresent=false;
    facts.riskUncertain=true;
    m.model.mockResolvedValueOnce({
      text:'Presenting Problem: A caregiver reported a functional concern.\nPlan: Follow up with the caregiver on the documented concern.',
      modelName:'writer',finishReason:'STOP'
    });
    const review=await preflight();
    expect(review).toMatchObject({status:'passed',riskAssessmentRequired:false});
    expect(review.checks[0].advisories).toContainEqual(expect.objectContaining({id:'risk_safety:collateral_concern'}));
    const input={agencyId:2,clientId:10,draftId:42,clinicalSessionId:20,inputText:source.inputText};
    const request={user:clinician,body:{preflightReviewId:review.id}};
    await expect(assertNarrivaPreGeneration(request,input)).rejects.toMatchObject({code:'NARRIVA_DRAFT_APPROVAL_REQUIRED'});
    const approval=approvalFor(review);
    request.body.draftApproval={...approval,sections:approval.sections.slice(0,-1)};
    await expect(assertNarrivaPreGeneration(request,input)).rejects.toMatchObject({code:'NARRIVA_DRAFT_APPROVAL_REQUIRED'});
    request.body.draftApproval=JSON.stringify(approval);
    await expect(assertNarrivaPreGeneration(request,input)).resolves.toMatchObject({
      authorApproval:{userId:clinician.id,sections:approval.sections,draftToken:approval.token},
      workingDraft:review.draftPreview
    });
  });
  it('requires a recheck when a direct-risk requirement appears after a review of a client-present visit',async()=>{
    const review=await preflight();
    expect(review.status).toBe('passed');
    source.clinical.riskRequiredFromPriorReview=true;
    expect(await readNarrivaReview(clinician,review.id,2)).toMatchObject({status:'stale',message:expect.stringContaining('risk assessment requirement')});
  });
  it('publishes actual review stages while the draft is available only through an authorized read',async()=>{
    let finish;
    m.model.mockResolvedValueOnce({text:'Subjective: Synthetic source facts.\nPlan: Continue documented work.',modelName:'writer',finishReason:'STOP'})
      .mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    const review=await preflight();
    expect(review.status).toBe('running');
    expect(review.stage).toBe('checking');
    expect(review.draftPreview).toContain('Synthetic source facts');
    const heartbeat=await readNarrivaReview(clinician,review.id,2,{poll:true});
    expect(heartbeat).toMatchObject({status:'running',heartbeat:true,stage:'checking',previewAvailable:true});
    expect(heartbeat.draftPreview).toBeUndefined();
    finish({text:JSON.stringify(facts),modelName:'checker'});await drain();await drain();
    expect((await readNarrivaReview(clinician,review.id,2)).status).toBe('passed');
  });
  it('uses completed enrollment in both intake calls and excludes psychotherapy-only requirements',async()=>{
    source.service.code='90791';
    source.meta.toolId='clinical_90791_intake_plan';
    source.clinical.hasDiagnosis=false;source.clinical.hasJustification=false;source.clinical.hasPresentingProblem=false;
    facts.engagementDocumented=null;facts.progressDocumented=null;facts.goalsDocumented=null;facts.responseDocumented=null;
    m.model.mockResolvedValueOnce({text:'Presenting Problem: Synthetic caregiver report of academic difficulty.\nPlan: Further differential assessment.',modelName:'reviewed-writer',finishReason:'STOP'});
    const review=await preflight();
    expect(review.status).toBe('passed');
    expect(m.intake).toHaveBeenCalledWith({agencyId:2,clientId:10});
    for(const [call] of m.model.mock.calls)expect(call.prompt).toContain('SYNTHETIC completed enrollment clinical answers');
    expect(review.enrollmentSources).toEqual({submissions:1,clinicalAnswers:8,instruments:[]});
    expect(review.draftPreview).toContain('Synthetic caregiver report');
    expect(review.checks.flatMap(c=>c.findings)).toEqual([]);
    const before=m.model.mock.calls.length;
    const bypassSource=await readNarrivaReview(supervisor,review.id,2);
    expect(bypassSource.draftPreview).toBeUndefined();
    expect(m.model.mock.calls.length).toBe(before);
  });
  it('returns the objective prompt before starting a writing or compliance job',async()=>{
    source.planReview={eligible:true,missing:[52],objectives:[]};
    await expect(preflight()).rejects.toMatchObject({status:422,code:'NARRIVA_OBJECTIVE_RATINGS_REQUIRED'});
    expect(m.model).not.toHaveBeenCalled();
    expect(rows.size).toBe(0);
  });
  it('rejects generation after the narrative changes, or when a review belongs to another draft',async()=>{
    const review=await preflight();
    const req={user:clinician,body:{preflightReviewId:review.id,draftApproval:approvalFor(review)}};
    const input={agencyId:2,clientId:10,draftId:42,clinicalSessionId:20,inputText:source.inputText+' changed'};
    await expect(assertNarrivaPreGeneration(req,input)).rejects.toMatchObject({status:409});
    await expect(assertNarrivaPreGeneration(req,{...input,draftId:43,inputText:source.inputText})).rejects.toMatchObject({status:409});
  });
  it('preserves a written preview if encounter verification is unavailable without granting approval', async () => {
    const workingDraft = 'Caregiver reported challenges with home and school routines.';
    m.model.mockImplementation(async ({ prompt, jsonMode }) => {
      if (jsonMode) return { text: '{"currentRisk":false}' };
      expect(prompt).toContain('The encounter header is the authority');
      return { text: workingDraft, modelName: 'writer', finishReason: 'STOP' };
    });
    const review = await preflight({ backgroundQuality: true });
    expect(review).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('verify the encounter and safety details'),
      draftPreview: workingDraft,
      quickSignEligible: false
    });
    expect(review.draftApprovalToken).toBeUndefined();
  });

  it('accepts multipart line endings for an approved draft and retains the exact saved narrative', async () => {
    source.inputText = 'Caregiver described difficulty with school routines.\nClinician discussed assessment follow-up.';
    const review = await preflight();
    const request = { user: clinician, body: { preflightReviewId: review.id, draftApproval: approvalFor(review) } };
    const input = { agencyId: 2, clientId: 10, draftId: 42, clinicalSessionId: 20 };
    await expect(assertNarrivaPreGeneration(request, {
      ...input, inputText: source.inputText.replaceAll('\n', '\r\n')
    })).resolves.toMatchObject({ reviewId: review.id, savedInputText: source.inputText });
    await expect(assertNarrivaPreGeneration(request, {
      ...input, inputText: source.inputText.replace('school', 'bedtime')
    })).rejects.toMatchObject({ code: 'NARRIVA_PREFLIGHT_STALE' });
  });
  it('hands confirmed current clinical context to the writer without row identifiers or unrelated metadata',async()=>{
    source.meta.structuredChart={diagnoses:[{id:999,icd10_code:'F41.1',description:'Generalized anxiety disorder',justification:'Persistent worry affects school attendance.'}],diagnosticJustification:'Persistent worry affects school attendance.',privateOtherField:'Do not send'};
    source.meta.narrivaContext={presentingProblem:'Recent anxiety interferes with school attendance.'};
    const review=await preflight();
    const result=await assertNarrivaPreGeneration({user:clinician,body:{preflightReviewId:review.id,draftApproval:approvalFor(review)}},{agencyId:2,clientId:10,draftId:42,clinicalSessionId:20,inputText:source.inputText});
    expect(result.clinicalContext).toEqual({presentingProblem:'Recent anxiety interferes with school attendance.',diagnosticJustification:'Persistent worry affects school attendance.',diagnoses:[{code:'F41.1',description:'Generalized anxiety disorder',justification:'Persistent worry affects school attendance.'}]});
    expect(JSON.stringify(result.clinicalContext)).not.toContain('999');
  });
  it('blocks identifying text in a newly confirmed clinical-context field before writer dispatch',async()=>{
    source.meta.narrivaContext={presentingProblem:'Private Client reports anxiety.'};
    const review=await preflight();
    await expect(assertNarrivaPreGeneration({user:clinician,body:{preflightReviewId:review.id,draftApproval:approvalFor(review)}},{agencyId:2,clientId:10,draftId:42,clinicalSessionId:20,inputText:source.inputText})).rejects.toMatchObject({code:'PHI_INPUT_REQUIRES_CORRECTION'});
  });
  it('hands server-authorized existing chart diagnosis references to the writer for an aid with no authored diagnoses',async()=>{
    source.meta.structuredChart={diagnoses:[]};
    source.confirmedClinicalContext={diagnoses:[{code:'F41.1',description:'Generalized anxiety disorder',justification:'Existing documented clinical need.'}],diagnosticJustification:'F41.1: Existing documented clinical need.',presentingProblem:'Current worry interferes with attendance.',diagnosesReferenceOnly:true};
    const review=await preflight();
    const result=await assertNarrivaPreGeneration({user:clinician,body:{preflightReviewId:review.id,draftApproval:approvalFor(review)}},{agencyId:2,clientId:10,draftId:42,clinicalSessionId:20,inputText:source.inputText});
    expect(result.clinicalContext).toEqual(source.confirmedClinicalContext);
  });
  it('offers include-risk or an audited keep-as-is choice before formatting; inclusion creates a post-generation to-do',async()=>{
    facts.currentRisk=true;
    const review=await preflight();
    expect(review.status).toBe('action_required');
    expect(review.checks[0].findings).toEqual(expect.arrayContaining([expect.objectContaining({id:'risk_safety:assessment',canBypass:true})]));
    source.clinical.riskAssessmentIncluded=true;
    const included=await preflight();
    expect(included.checks[0].status).toBe('passed');
    expect(included.quickSignEligible).toBe(false);
  });
  it('requires consent confirmation and header correction instead of allowing those facts to be invented',async()=>{
    source.encounter.consentConfirmed=false;facts.modalityMatches=false;
    const review=await preflight();
    const findings=review.checks.find(c=>c.id==='encounter_consent').findings;
    expect(findings).toEqual(expect.arrayContaining([expect.objectContaining({id:'encounter_consent:consent',canBypass:false}),expect.objectContaining({id:'encounter_consent:method_mismatch',canBypass:true})]));
  });
  it('rejects a superseded narrative review even when the source text is identical',async()=>{
    const older=await preflight(),latest=await preflight();
    const input={agencyId:2,clientId:10,draftId:42,clinicalSessionId:20,inputText:source.inputText};
    await expect(assertNarrivaPreGeneration({user:clinician,body:{preflightReviewId:older.id}},input)).rejects.toMatchObject({code:'NARRIVA_PREFLIGHT_STALE'});
    await expect(assertNarrivaPreGeneration({user:clinician,body:{preflightReviewId:latest.id,draftApproval:approvalFor(latest)}},input)).resolves.toMatchObject({reviewId:latest.id});
  });
  it('does not fall back to an older authorization when newer review evidence is unreadable',async()=>{
    const older=await preflight(),latest=await preflight();rows.get(latest.id).result_encrypted='sealed:unreadable evidence';
    await expect(assertNarrivaPreGeneration({user:clinician,body:{preflightReviewId:older.id}},{agencyId:2,clientId:10,draftId:42,clinicalSessionId:20,inputText:source.inputText})).rejects.toMatchObject({code:'NARRIVA_PREFLIGHT_STALE'});
  });
  it('does not inherit raw preflight metadata into an attached note without an exact protected binding',async()=>{
    facts.currentRisk=true;const initial=await preflight();
    const bypass=await resolveNarrivaFinding({user:clinician,params:{reviewId:initial.id},body:{agencyId:2,action:'bypass',findingId:'risk_safety:assessment',reason:'Provider retained the current narrative.'}});
    source.meta.narrivaPreflight={reviewId:bypass.id,sourceHash:bypass.sourceHash,inputHash:bypass.inputHash};
    source.meta.draftId=42;source.draftId=null;source.noteId=25;source.phase='output';source.inputText='';delete source.source.user_id;
    const output=await completedReview();
    expect(output.checks[0].findings.some(finding=>finding.bypassed)).toBe(false);
    expect(output.riskAssessmentRequired).toBe(true);expect(output.quickSignEligible).toBe(false);
  });
});

it('treats unverified display flags as a conservative Quick Sign block, never as evidence of a bypass',async()=>{source.meta.narrivaSupervisorFlags=[{checkId:'participation_plan',id:'participation_plan:responseDocumented',message:'Response was not documented.',reason:'Provider retained the original narrative.',bypassedBy:7}];const review=await completedReview();expect(review.status).toBe('passed');expect(review.priorDecisions || []).toHaveLength(0);expect(review.quickSignEligible).toBe(false);});

it('does not turn a forged draft supervisor flag into a persisted risk bypass',async()=>{
 source.phase='output';source.draftId=42;source.noteId=null;source.source.user_id=7;source.source.provider_signed_at=null;
 source.meta.narrivaSupervisorFlags=[{checkId:'risk_safety',id:'risk_safety:assessment',message:'Risk was detected.',reason:'Invented browser metadata.',bypassedBy:7,bypassedAt:'2026-11-17T20:00:00Z'}];
 facts.currentRisk=true;
 m.load.mockImplementation(async(user,input)=>({...source,phase:input.phase || 'output',sourceHash:narrivaSourceHash({narrative:source.narrative,meta:source.meta,encounter:source.encounter,phase:input.phase})}));
 const result=await createNarrivaReview({user:clinician,body:{agencyId:2,draftId:42,phase:'output'}});
 for(let i=0;i<4;i++)await drain();
 const review=await readNarrivaReview(clinician,result.id,2);
 expect(review.status).toBe('action_required');expect(review.riskAssessmentRequired).toBe(true);expect(review.quickSignEligible).toBe(false);
 expect(review.checks[0].findings).toContainEqual(expect.objectContaining({id:'risk_safety:assessment',canBypass:true}));
 expect(review.checks[0].findings.some(finding=>finding.bypassed)).toBe(false);
 const persisted=JSON.parse(rows.get(result.id).result_encrypted.slice(7));
 expect(persisted.checks[0].findings.some(finding=>finding.bypassed)).toBe(false);
 expect(rows.get(result.id).risk_assessment_required).toBe(1);
});

it('checks unchanged model evidence once across an MSE update and chart attachment, then rechecks edited prose',async()=>{
 source.source.provider_signed_at=null;
 async function check(target){
  const created=await createNarrivaReview(req(clinician,target));
  for(let i=0;i<3;i++)await drain();
  return readNarrivaReview(clinician,created.id,2);
 }
 m.load.mockImplementation(async(_user,input)=>({...source,phase:'output',draftId:input.draftId||null,noteId:input.noteId||null,
  inputText:input.noteId?'':source.inputText,modelSessionNarrative:source.inputText,
  meta:{...source.meta,draftId:42},sourceHash:narrivaSourceHash([source.narrative,source.meta,input.draftId||null,input.noteId||null])}));
 const draft={draftId:42,noteId:null};
 expect((await check(draft)).status).toBe('passed');
 source.meta.structuredChart={mentalStatusExam:buildAllNormalMse()};
 expect((await check(draft)).status).toBe('passed');
 const attached=await check();
 expect(attached.status).toBe('passed');
 expect(attached.outputEvidence).toBeUndefined();
 expect(m.model).toHaveBeenCalledTimes(1);
 source.narrative+=' The client described a new concern.';
 await check();
 expect(m.model).toHaveBeenCalledTimes(2);
});


describe('author signing of a previously reviewed chart copy',()=>{
 async function reviewedDraft(toolId,code) {
  source.meta.toolId=toolId;
  source.service.code=code;
  source.source.provider_signed_at=null;
  const sections={Observations:source.narrative,Plan:'Continue the documented activity.'};
  let binding;
  m.load.mockImplementation(async (_user,input)=>{
   const chart=!!input.noteId;
   return {...source,phase:'output',draftId:chart?null:42,noteId:chart?25:null,
    sectionContent:chart?Object.fromEntries(Object.entries(sections).reverse()):sections,
    modelSessionNarrative:source.inputText,sourceHash:narrivaSourceHash({chart,sections,meta:source.meta}),
    meta:{...source.meta,...(chart?{draftId:42,narrivaPreflight:binding}:{})}};
  });
  const review=await createNarrivaReview(req(clinician,{draftId:42,noteId:null}));
  for(let i=0;i<3;i++)await drain();
  const completed=await readNarrivaReview(clinician,review.id,2);
  expect(completed.status).toBe('passed');
  binding={phase:'output',reviewId:review.id,inputHash:completed.inputHash};
  m.bound.mockResolvedValue(binding);
  return review.id;
 }

 it.each([
  ['clinical_psychotherapy_note','90837'],['clinical_family_note','90847'],
  ['clinical_h2011_note','H2011'],['clinical_h2014_group','H2014'],
  ['clinical_h0004_note','H0004'],['clinical_tpt_note','TPT'],
  ['clinical_90791_intake_plan','90791'],['clinical_h0031_intake','H0031'],
  ['clinical_h0032_plan_development','H0032'],['custom_test','CUSTOM']
 ])('immediately returns the note-scoped result for unchanged %s (%s)',async(toolId,code)=>{
  const originalId=await reviewedDraft(toolId,code);
  const modelCalls=m.model.mock.calls.length;
  const chart=await createNarrivaReview(req(clinician));
  expect(chart).toMatchObject({noteId:25,originatingOutputReviewId:originalId,status:'passed',quickSignEligible:false});
  expect(chart.id).not.toBe(originalId);
  expect(chart.checks).toHaveLength(5);
  expect(m.model).toHaveBeenCalledTimes(modelCalls);
  expect((await readNarrivaReview(clinician,chart.id,2)).status).toBe('passed');
  expect(m.audit).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({metadata:expect.objectContaining({originatingOutputReviewId:originalId,reviewId:chart.id})}));
 });
 it('preserves the unchanged author review when signing creates the original chart revision',async()=>{
  await reviewedDraft('clinical_90791_intake_plan','90791');
  const chart=await createNarrivaReview(req(clinician));
  const modelCalls=m.model.mock.calls.length;
  source.source.provider_signed_at='2026-11-10';
  source.source.clinical_version_number=1;
  source.meta.attestation={finalCopyReviewed:true};
  expect((await readNarrivaReview(clinician,chart.id,2)).status).toBe('passed');
  expect(m.model).toHaveBeenCalledTimes(modelCalls);
  source.clinical.riskRequiredFromPriorReview=true;
  expect((await readNarrivaReview(clinician,chart.id,2)).status).toBe('stale');
 });
 it('does not reuse the author review after an amendment has been approved',async()=>{
  await reviewedDraft('clinical_90791_intake_plan','90791');
  const chart=await createNarrivaReview(req(clinician));
  source.source.provider_signed_at='2026-11-10';
  source.source.clinical_version_number=2;
  source.meta.attestation={finalCopyReviewed:true};
  expect((await readNarrivaReview(clinician,chart.id,2)).status).toBe('stale');
 });
 it.each([true,false])('compares the original saved source for an older review, unchanged=%s',async unchanged=>{
  const id=await reviewedDraft('clinical_h0004_note','H0004');
  const row=rows.get(id);
  const stored=JSON.parse(row.result_encrypted.slice('sealed:'.length));delete stored.authorOutputHash;
  row.result_encrypted='sealed:'+JSON.stringify(stored);
  if(!unchanged)source.meta.objectiveRatings=[{objectiveId:3,scaleValue:2}];
  expect((await createNarrivaReview(req(clinician))).status).toBe(unchanged?'passed':'running');
  for(let i=0;i<3;i++)await drain();
 });
 it.each(['missing binding','changed score','changed MSE','changed duration','new risk','changed guidance','signed document','another reviewer'])('runs a fresh review for %s',async change=>{
  await reviewedDraft('clinical_psychotherapy_note','90837');
  if(change==='missing binding')m.bound.mockResolvedValue(null);
  if(change==='changed score')source.meta.objectiveRatings=[{objectiveId:19,scaleValue:3}];
  if(change==='changed MSE')source.meta.structuredChart={mentalStatusExam:{judgment:'Fair'}};
  if(change==='changed duration')source.encounter.durationMinutes=55;
  if(change==='new risk')source.clinical.riskRequiredFromPriorReview=true;
  if(change==='changed guidance')referenceVersion++;
  if(change==='signed document')source.source.provider_signed_at='2026-11-10';
  const result=await createNarrivaReview(req(change==='another reviewer'?supervisor:clinician));
  expect(result.status).toBe('running');
  for(let i=0;i<3;i++)await drain();
 });
});

describe('editable and finalized server-reviewed drafts',()=>{
 async function checked(){
  source.phase='pre_generation';source.draftId=42;source.noteId=null;source.source.user_id=7;source.source.provider_signed_at=null;source.source.clinical_session_id=20;
  m.load.mockImplementation(async(user,input)=>({...source,phase:input.phase || 'output',sourceHash:narrivaSourceHash({narrative:source.narrative,meta:source.meta,encounter:source.encounter,phase:input.phase})}));
  facts.draftReadyForDisplay=true;
  m.model.mockResolvedValueOnce({text:source.narrative,finishReason:'STOP',modelName:'synthetic-writer'});
  const created=await createNarrivaReview({user:clinician,body:{agencyId:2,draftId:42,phase:'pre_generation'}});for(let i=0;i<5;i++)await drain();
  return readNarrivaReview(clinician,created.id,2);
 }
 it('records a manual edit, reviews it without rewriting again, and retains its compliance flag',async()=>{
  const original=await checked();const before=m.model.mock.calls.length;
  const edited='Provider-authored clarification of the observed functional impact and assessment recommendation.';
  const result=await resolveNarrivaFinding({user:clinician,params:{reviewId:original.id},body:{agencyId:2,action:'edit_draft',sections:{Subjective:edited}}});
  expect(result.status).toBe('running');for(let i=0;i<5;i++)await drain();
  const reviewed=await readNarrivaReview(clinician,original.id,2);
  expect(reviewed).toMatchObject({manualEdited:true,status:'bypassed',quickSignEligible:false});expect(reviewed.draftPreview).toContain(edited);expect(m.model.mock.calls.length-before).toBe(1);
  const proof=await assertNarrivaPreGeneration({user:clinician,body:{preflightReviewId:reviewed.id,draftApproval:approvalFor(reviewed)}},{agencyId:2,clientId:10,draftId:42,clinicalSessionId:20,inputText:source.inputText});expect(proof.keptAsIs).toBe(true);expect(proof.decisions.some(item=>item.checkId==='manual_edit')).toBe(true);
 });
 it('does not let a supervisor overwrite the author’s preview through the edit endpoint',async()=>{
  const original=await checked();await expect(resolveNarrivaFinding({user:supervisor,params:{reviewId:original.id},body:{agencyId:2,action:'edit_draft',sections:{Subjective:'A synthetic edit by another reviewer.'}}})).rejects.toMatchObject({status:403});
 });
 it.each([false,true])('reuses finalization evidence only while the saved text is unchanged (edited=%s)',async edited=>{
  const original=await checked();const {recordNarrivaFinalization}=await import('../narrivaReview.service.js');
  const sections={Subjective:source.narrative};
  await recordNarrivaFinalization({reviewId:original.id,userId:7,agencyId:2,sourceHash:original.sourceHash,sections});
  source.sectionContent={...sections};if(edited)source.sectionContent.Subjective+=' New provider-added content requires review.';
  source.meta.narrivaPreflight={reviewId:original.id,sourceHash:original.sourceHash,inputHash:original.inputHash};
  const before=m.model.mock.calls.length;
  const next=await createNarrivaReview({user:clinician,body:{agencyId:2,draftId:42,phase:'output'}});for(let i=0;i<5;i++)await drain();
  const final=await readNarrivaReview(clinician,next.id,2);expect(['passed','action_required','bypassed']).toContain(final.status);expect(m.model.mock.calls.length-before).toBe(edited?1:0);
 });
});

import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),load:vi.fn(),agency:vi.fn(),model:vi.fn(),policy:vi.fn(),audit:vi.fn(),knowledge:vi.fn(),requireAgency:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:()=>()=>{}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:s=>'sealed:'+s,maybeDecryptNotePayload:s=>s?.startsWith('sealed:')?s.slice(7):s}));
vi.mock('../narrivaSource.service.js',()=>({loadNarrivaSource:m.load}));
vi.mock('../sessionAiPrivacy.service.js',()=>({callPrivateSessionText:m.model,createSessionPrivacyContext:input=>({testPrivacyInput:input})}));
vi.mock('../clinicalKnowledgeBase.service.js',()=>({getKnowledgeBaseContext:m.knowledge,noteAidKnowledgeBaseOptions:v=>v}));
vi.mock('../supervisedBillingPolicy.service.js',()=>({resolveNoteDocumentationPolicy:m.policy}));
vi.mock('../noteAidChartAudit.service.js',()=>({logNoteAidChartEvent:m.audit}));
// Source ownership is exercised by its own tests; this suite drives the real
// asynchronous review runner, persisted result transitions, rules and sign gate.
vi.mock('../narrivaAccess.service.js',async importOriginal=>{const actual=await importOriginal();return {...actual,requireNarrivaAgency:m.requireAgency};});
import {createNarrivaReview,readNarrivaReview,resolveNarrivaFinding,assertNarrivaQuickSign,narrivaModelPayload} from '../narrivaReview.service.js';
import {assertNarrivaRiskBeforeSignature} from '../narrivaRiskAssessment.service.js';
import {narrivaSourceHash} from '../narrivaReviewPolicy.service.js';
let rows,source,facts,features,riskRequired;
const clinician={id:7,role:'provider'},supervisor={id:9,role:'supervisor'};
const req=(user=supervisor,extra={})=>({user,body:{agencyId:2,noteId:25,...extra},params:{}});
const drain=()=>new Promise(resolve=>setImmediate(resolve));
async function completedReview(extra={}){const review=await createNarrivaReview(req(supervisor,extra));for(let i=0;i<3;i++)await drain();return readNarrivaReview(supervisor,review.id,2);}
beforeEach(()=>{
 vi.clearAllMocks();rows=new Map();features={};riskRequired=false;
 source={agencyId:2,noteId:25,draftId:null,source:{id:25,agency_id:2,client_id:10,clinical_session_id:20,created_by_user_id:7,provider_signed_by_user_id:7,provider_signed_at:'2026-11-06T10:00:00Z',supervisor_cosigned_at:null,clinical_version_pending_id:null},
  meta:{toolId:'clinical_psychotherapy_note'},narrative:'Client reported anxiety. Provider practiced grounding. Client engaged and improved practice. Continued anxiety impairs school. Reviewed coping goal and next session plan.',inputText:'Factual Session Narrative.',
  client:{id:10,full_name:'Private Client',first_name:'Private',last_name:'Client',initials:'PC',email:'private@example.com'},provider:{first_name:'Private',last_name:'Provider'},identifiers:['Private Client','private@example.com'],
  service:{code:'90837',allowed:true,durationAllowed:true,modalityAllowed:true},encounter:{durationMinutes:60,dateValid:true,timesValid:true,location:'Office',modality:'in_person',consentConfirmed:true,participants:'Client and Provider',clientPresent:true,additionalParticipantsDocumented:false},
  clinical:{hasDiagnosis:true,hasJustification:true,hasPresentingProblem:true,riskAssessmentComplete:false,assessmentEvidencePresent:false,riskRequiredFromPriorReview:false}};
 facts={currentRisk:false,riskUncertain:false,safetyInterventionsNecessary:false,safetyInterventionsDocumented:false,clientPresent:true,additionalParticipants:false,crisisService:false,serviceDocumentationSupported:true,interventionsDocumented:true,medicalNecessityDocumented:true,assessmentMentioned:false,engagementDocumented:true,responseDocumented:true,progressDocumented:true,goalsDocumented:true,followUpDocumented:true};
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
 it('does not send identity records, service dates, storage ids or signature metadata as model fields',()=>{const payload=narrivaModelPayload(source);expect(Object.keys(payload).sort()).toEqual(['deliveryMethod','durationMinutes','note','participants','serviceCode','sessionNarrative'].sort());expect(JSON.stringify(payload)).not.toMatch(/Private Client|private@example|provider_signed|clinical_session_id/);});
});

describe('persisted risk cannot be removed through optional branding metadata',()=>{
 it('requires a risk assessment even after writerMode and narrivaContext are stripped',async()=>{riskRequired=true;await expect(assertNarrivaRiskBeforeSignature({id:25,agency_id:2,clinical_session_id:20,metadata_json:{}})).rejects.toMatchObject({status:409,code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});});
 it('does not accept UI reviewed=false or arbitrary fields as a completed assessment',async()=>{riskRequired=true;await expect(assertNarrivaRiskBeforeSignature({id:25,agency_id:2,clinical_session_id:20,metadata_json:{narrivaContext:{riskAssessmentCompleted:true},structuredChart:{riskAssessment:{reviewed:false,foo:0}}}})).rejects.toMatchObject({status:409});});
 it('accepts the actual completed editor assessment and explicit clinician confirmation',async()=>{riskRequired=true;await expect(assertNarrivaRiskBeforeSignature({id:25,agency_id:2,clinical_session_id:20,metadata_json:{narrivaContext:{riskAssessmentCompleted:true},structuredChart:{riskAssessment:{patientDeniesAll:true}}}})).resolves.toBeUndefined();});
});

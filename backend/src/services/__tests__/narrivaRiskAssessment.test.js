import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({execute:vi.fn(),draft:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:mocks.execute}}));
vi.mock('../../models/ClinicalNoteDraft.model.js',()=>({default:{findByIdForUser:mocks.draft}}));
import {completeNarrivaRiskAssessment,protectNarrivaPreflightMetadata,assertNarrivaRiskBeforeSignature,narrivaDraftEvidenceHash,narrivaNoteEvidenceHash,verifiedBoundNarrivaDecisions} from '../narrivaRiskAssessment.service.js';
import {maybeEncryptNotePayload,maybeDecryptNotePayload} from '../clinicalNoteCrypto.service.js';
import {narrivaSourceHash,NARRIVA_RULES_VERSION} from '../narrivaReviewPolicy.service.js';
let draft,session,note,review,row,rows,later,required;
const evidence=()=>({reviewId:row.id,inputHash:review.inputHash,sourceHash:review.sourceHash,keptAsIs:true,decisions:[{id:'client-forged-decision'}]});
function save(){row.result_encrypted=maybeEncryptNotePayload(JSON.stringify(review));draft.output_json=maybeEncryptNotePayload(JSON.stringify({sections:{Response:'Observed response.'},meta:{narrivaPreflight:evidence(),narrivaContext:{riskAssessmentIncluded:review.riskAssessmentIncluded}}}));}
async function attach(){save();note.metadata_json=await protectNarrivaPreflightMetadata({metadata:{draftId:draft.id,narrivaPreflight:evidence()},draft,session,authorUserId:note.created_by_user_id,notePayload:note.note_payload});return note.metadata_json;}
beforeEach(()=>{
 vi.clearAllMocks();
 process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64=Buffer.alloc(32,7).toString('base64');
 session={id:7301,agency_id:83,client_id:4102};
 draft={id:6201,user_id:5101,agency_id:83,client_id:4102,clinical_session_id:7301,input_text:maybeEncryptNotePayload('Client described current safety concerns; provider reviewed the narrative and retained it.')};
 note={id:8401,agency_id:83,client_id:4102,clinical_session_id:7301,created_by_user_id:5101,note_payload:'{"sections":{"Response":"Observed response."}}',metadata_json:{draftId:6201}};
 review={id:9101,phase:'pre_generation',rulesVersion:NARRIVA_RULES_VERSION,status:'bypassed',agencyId:83,actorUserId:5101,draftId:6201,clientId:4102,clinicalSessionId:7301,inputHash:narrivaSourceHash(maybeDecryptNotePayload(draft.input_text)),sourceHash:'saved-source-hash',riskAssessmentIncluded:false,checks:[{id:'risk_safety',status:'bypassed',findings:[{id:'risk_safety:assessment',canBypass:true,bypassed:true,bypassedBy:5101,bypassedAt:'2026-11-17T20:00:00Z',bypassReason:'Provider retained the actual source for supervisor review.',message:'Risk was detected.'}]}]};
 row={id:9101,agency_id:83,actor_user_id:5101,draft_id:6201,clinical_note_id:null,clinical_session_id:7301,source_hash:'saved-source-hash',status:'bypassed'};
 rows=[row];later=null;required=1;save();
 mocks.execute.mockImplementation(async sql=>sql.includes('MAX(risk_assessment_required)')?[[{required}]]:sql.startsWith('SELECT id FROM narriva_reviews')?[[later].filter(Boolean)]:[rows]);
 mocks.draft.mockImplementation(async()=>draft);
});
describe('explicit assessment completion',()=>{
 it('rejects selections and incomplete legacy areas; accepts all three assessed domains',()=>{
  expect(completeNarrivaRiskAssessment({items:{'Suicidal Ideation':{status:'selected'}}})).toBe(false);
  expect(completeNarrivaRiskAssessment({areas:[{name:'Suicidal Ideation',level:'Low'}]})).toBe(false);
  expect(completeNarrivaRiskAssessment({areas:['Suicidal Ideation','Homicidal Ideation','Self-Harm'].map(name=>({name,level:'No reported risk'}))})).toBe(true);
 });
 it('requires clinician-selected assessment completion even without detected risk',async()=>{
  required=0;note.metadata_json={narrivaContext:{riskAssessmentIncluded:true}};
  await expect(assertNarrivaRiskBeforeSignature(note)).rejects.toMatchObject({code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});
  note.metadata_json={narrivaContext:{riskAssessmentIncluded:true,riskAssessmentCompleted:true},structuredChart:{riskAssessment:{patientDeniesAll:true}}};
  await expect(assertNarrivaRiskBeforeSignature(note)).resolves.toBeUndefined();
 });
 it('retains persisted risk when client branding metadata is stripped',async()=>{
  note.metadata_json={};await expect(assertNarrivaRiskBeforeSignature(note)).rejects.toMatchObject({status:409});
 });
});
describe('server-owned risk Keep as is',()=>{
 it('allows exact latest author decision, stores supervisor evidence, and disables Quick Sign',async()=>{
  const metadata=await attach();
  expect(metadata).toMatchObject({quickSignEligible:false,narrivaSupervisorFlags:[{category:'risk',reviewId:9101,id:'risk_safety:assessment',bypassedBy:5101}]});
  expect(metadata.narrivaPreflight.decisions[0].id).not.toBe('client-forged-decision');
  expect(JSON.parse(metadata.narrivaPreflightBinding)._enc).toBe(true);
  await expect(assertNarrivaRiskBeforeSignature(note)).resolves.toBeUndefined();
 });
 it('strips caller bypass and supervisor evidence without a reviewed saved draft',async()=>{
  const metadata=await protectNarrivaPreflightMetadata({metadata:{narrivaPreflight:evidence(),narrivaPreflightBinding:'fake',narrivaSupervisorFlags:[{category:'fake'}]},draft:null,session,authorUserId:5101,notePayload:note.note_payload});
  expect(metadata).toEqual({});
 });
 it('preserves ordinary sessionless chart-action attachment without manufacturing compliance evidence',async()=>{
  draft.clinical_session_id=null;draft.output_json=maybeEncryptNotePayload(JSON.stringify({sections:{Recommendations:'Provider guidance.'}}));
  const metadata=await protectNarrivaPreflightMetadata({metadata:{draftId:draft.id,noteType:'TERMINATION',narrivaPreflight:evidence()},draft,session,authorUserId:5101,notePayload:note.note_payload});
  expect(metadata).toEqual({draftId:draft.id,noteType:'TERMINATION'});expect(mocks.execute).not.toHaveBeenCalled();
 });
 it.each(['author','client','agency','session','draft','input','source','status','latest','reason','optional'])('rejects %s mismatch',async mismatch=>{
  if(mismatch==='author')draft.user_id=999;
  if(mismatch==='client')draft.client_id=999;
  if(mismatch==='agency')draft.agency_id=999;
  if(mismatch==='session')row.clinical_session_id=999;
  if(mismatch==='draft')review.draftId=999;
  if(mismatch==='input')draft.input_text=maybeEncryptNotePayload('Changed narrative with different safety information.');
  if(mismatch==='source')row.source_hash='different';
  if(mismatch==='status')row.status='action_required';
  if(mismatch==='latest')rows=[{...row,id:9102},row];
  if(mismatch==='reason')review.checks[0].findings[0].bypassReason='';
  if(mismatch==='optional')review.checks[0].findings[0].canBypass=false;
  if(['reason','optional'].includes(mismatch)){
   await attach();await expect(assertNarrivaRiskBeforeSignature(note)).rejects.toMatchObject({code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});
  }else await expect(attach()).rejects.toMatchObject({code:'NARRIVA_PREFLIGHT_STALE'});
 });
 it.each(['plaintext','modified_envelope','note_payload','metadata','client','author','input','later_risk','included'])('denies forged or stale signature evidence (%s)',async mismatch=>{
  await attach();
  if(mismatch==='plaintext')note.metadata_json.narrivaPreflightBinding=maybeDecryptNotePayload(note.metadata_json.narrivaPreflightBinding);
  if(mismatch==='modified_envelope'){const envelope=JSON.parse(note.metadata_json.narrivaPreflightBinding);envelope.ciphertext='AAAA';note.metadata_json.narrivaPreflightBinding=JSON.stringify(envelope);}
  if(mismatch==='note_payload')note.note_payload+=' New safety information.';
  if(mismatch==='metadata')note.metadata_json.narrivaPreflight.sourceHash='invented';
  if(mismatch==='client')note.client_id=999;
  if(mismatch==='author')note.created_by_user_id=999;
  if(mismatch==='input')draft.input_text=maybeEncryptNotePayload('Changed current source');
  if(mismatch==='later_risk')later={id:9102};
  if(mismatch==='included')note.metadata_json.narrivaContext={riskAssessmentIncluded:true};
  await expect(assertNarrivaRiskBeforeSignature(note)).rejects.toMatchObject({code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});
 });
 it('cannot bypass a selected assessment by clearing the checkbox later',async()=>{
  review.riskAssessmentIncluded=true;await attach();
  await expect(assertNarrivaRiskBeforeSignature(note)).rejects.toMatchObject({code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});
 });
 it('accepts current exact output-draft risk bypass despite the historical required flag',async()=>{
  review.phase='output';save();review.draftEvidenceHash=narrivaDraftEvidenceHash(draft);row.result_encrypted=maybeEncryptNotePayload(JSON.stringify(review));
  note.metadata_json=await protectNarrivaPreflightMetadata({metadata:{draftId:draft.id},draft,session,authorUserId:5101,notePayload:note.note_payload});
  expect(note.metadata_json.narrivaPreflight.phase).toBe('output');
  await expect(assertNarrivaRiskBeforeSignature(note)).resolves.toBeUndefined();
 });
 it('preserves earlier Keep-as-is flags when the generated output has no matching finding',async()=>{
  review.phase='output';review.priorDecisions=[{checkId:'participation_plan',id:'participation_plan:responseDocumented',message:'Describe the response.',reason:'Retained provider source.',bypassedBy:5101}];review.checks=[];
  save();review.draftEvidenceHash=narrivaDraftEvidenceHash(draft);row.result_encrypted=maybeEncryptNotePayload(JSON.stringify(review));
  const metadata=await protectNarrivaPreflightMetadata({metadata:{draftId:draft.id},draft,session,authorUserId:5101,notePayload:note.note_payload});
  expect(metadata).toMatchObject({quickSignEligible:false,narrivaPreflight:{keptAsIs:true},narrivaSupervisorFlags:[{category:'documentation',id:'participation_plan:responseDocumented'}]});
 });
 it('rejects an old output bypass after any saved output changes',async()=>{
  review.phase='output';save();review.draftEvidenceHash=narrivaDraftEvidenceHash(draft);row.result_encrypted=maybeEncryptNotePayload(JSON.stringify(review));
  draft.output_json=maybeEncryptNotePayload(JSON.stringify({sections:{Response:'Different safety findings.'}}));
  await expect(protectNarrivaPreflightMetadata({metadata:{draftId:draft.id},draft,session,authorUserId:5101,notePayload:note.note_payload})).rejects.toMatchObject({code:'NARRIVA_PREFLIGHT_STALE'});
 });
 it('ignores only the derived risk-required badge when hashing saved draft evidence',()=>{
  const previous=narrivaDraftEvidenceHash(draft),output=JSON.parse(maybeDecryptNotePayload(draft.output_json));
  output.meta.narrivaContext.riskAssessmentRequired=true;draft.output_json=maybeEncryptNotePayload(JSON.stringify(output));
  expect(narrivaDraftEvidenceHash(draft)).toBe(previous);
  output.meta.narrivaContext.riskAssessmentIncluded=true;draft.output_json=maybeEncryptNotePayload(JSON.stringify(output));
  expect(narrivaDraftEvidenceHash(draft)).not.toBe(previous);
 });
});

describe('current attached-note output risk review',()=>{
 function outputReview(){review.phase='output';review.noteId=note.id;review.draftId=null;review.noteEvidenceHash=narrivaNoteEvidenceHash(note);row.clinical_note_id=note.id;row.draft_id=null;row.result_encrypted=maybeEncryptNotePayload(JSON.stringify(review));}
 it('honors only the provider’s persisted bypass of this exact note',async()=>{
  outputReview();await expect(assertNarrivaRiskBeforeSignature(note)).resolves.toBeUndefined();
 });
 it('preserves the author’s note risk decision through provider signature stamps and supervisor queue synchronization',async()=>{
  outputReview();note.provider_signed_at='2026-11-17T20:00:00Z';
  Object.assign(note.metadata_json,{attestation:{attestedByUserId:5101,statement:'Provider reviewed the note.'},supervisionPolicyAtSignature:{supervisorUserId:5102},supervisorQueue:{revision:'synthetic',synchronizedAt:'2026-11-17T20:01:00Z'},treatmentPlanEligibility:{eligible:true},flags:{missingDiagnosis:true}});
  await expect(assertNarrivaRiskBeforeSignature(note)).resolves.toBeUndefined();
  note.metadata_json.narrivaContext={riskAssessmentIncluded:true};
  await expect(assertNarrivaRiskBeforeSignature(note)).rejects.toMatchObject({code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});
 });
 it.each(['payload','metadata','author','client','session','selected','pending','later'])('rejects stale or non-bypass note evidence (%s)',async mismatch=>{
  outputReview();
  if(mismatch==='payload')note.note_payload+=' Changed symptoms.';
  if(mismatch==='metadata')note.metadata_json.locationLabel='Different setting';
  if(mismatch==='author')row.actor_user_id=999;
  if(mismatch==='client')review.clientId=999;
  if(mismatch==='session')row.clinical_session_id=999;
  if(mismatch==='selected')review.riskAssessmentIncluded=true;
  if(mismatch==='pending')row.status='running';
  if(mismatch==='later')later={id:9202};
  row.result_encrypted=maybeEncryptNotePayload(JSON.stringify(review));
  await expect(assertNarrivaRiskBeforeSignature(note)).rejects.toMatchObject({code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});
 });
});

describe('verified supervisor decision inheritance',()=>{
 it('retains exact signed-note provider decisions after the working draft is deleted',async()=>{
  await attach();note.provider_signed_at='2026-11-17T20:00:00Z';mocks.draft.mockResolvedValue(null);
  expect(await verifiedBoundNarrivaDecisions(note)).toEqual([expect.objectContaining({id:'risk_safety:assessment',bypassedBy:5101})]);
  await expect(assertNarrivaRiskBeforeSignature(note)).resolves.toBeUndefined();
 });
 it('does not let a signed note reuse its earlier decision after newer unresolved risk is recorded',async()=>{
  await attach();note.provider_signed_at='2026-11-17T20:00:00Z';mocks.draft.mockResolvedValue(null);later={id:9202};
  expect(await verifiedBoundNarrivaDecisions(note)).toEqual([]);
  await expect(assertNarrivaRiskBeforeSignature(note)).rejects.toMatchObject({code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});
 });
 it('does not grant the signed-note retention exception to an unsigned draft',async()=>{
  await attach();mocks.draft.mockResolvedValue(null);
  expect(await verifiedBoundNarrivaDecisions(note)).toEqual([]);
  await expect(assertNarrivaRiskBeforeSignature(note)).rejects.toMatchObject({code:'NARRIVA_RISK_ASSESSMENT_REQUIRED'});
 });
 it('returns only persisted decisions from the protected exact note binding',async()=>{
  await attach();expect(await verifiedBoundNarrivaDecisions(note)).toEqual([expect.objectContaining({id:'risk_safety:assessment',bypassedBy:5101})]);
 });
 it('does not grant inheritance from arbitrary supervisor flags on a note or draft',async()=>{
  note.metadata_json={draftId:draft.id,narrivaSupervisorFlags:[{checkId:'risk_safety',id:'risk_safety:assessment',bypassedBy:5101,reason:'Invented flag.'}]};
  expect(await verifiedBoundNarrivaDecisions(note)).toEqual([]);
 });
 it('ignores altered display flags and returns the persisted canonical provider decision',async()=>{
  await attach();note.metadata_json.narrivaSupervisorFlags=[{checkId:'risk_safety',id:'risk_safety:invented',bypassedBy:5101,reason:'Invented flag.'}];
  expect(await verifiedBoundNarrivaDecisions(note)).toEqual([expect.objectContaining({id:'risk_safety:assessment'})]);
 });
 it('rejects a copied binding after the note or author changes',async()=>{
  await attach();note.note_payload+=' Different safety evidence.';expect(await verifiedBoundNarrivaDecisions(note)).toEqual([]);
 });
});

it('requires the clinician MSE before a Narriva 90837 signature and permits an H-code without an MSE',async()=>{
 required=false;
 note.service_code='90837';
 note.metadata_json={narrivaContext:{writerMode:'narriva'}};
 await expect(assertNarrivaRiskBeforeSignature(note)).rejects.toMatchObject({code:'NARRIVA_MSE_REQUIRED'});
 note.metadata_json.structuredChart={mentalStatusExam:{allNormal:true}};
 await expect(assertNarrivaRiskBeforeSignature(note)).resolves.toBeUndefined();
 note.service_code='H0004';delete note.metadata_json.structuredChart;
 await expect(assertNarrivaRiskBeforeSignature(note)).resolves.toBeUndefined();
});

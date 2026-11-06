import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m=vi.hoisted(()=>({execute:vi.fn(),agency:vi.fn(),agencies:vi.fn(),care:vi.fn(),client:vi.fn(),guardians:vi.fn(),
  context:vi.fn(),findDraft:vi.fn(),createDraft:vi.fn(),updateDraft:vi.fn(),knowledge:vi.fn(),model:vi.fn(),custom:vi.fn(),customAccess:vi.fn(),audit:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute},onTableWrite:()=>()=>{}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/Agency.model.js',()=>({default:{findById:m.agency}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:m.agencies}}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:m.client}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listForClient:m.guardians}}));
vi.mock('../../models/ClinicalNoteDraft.model.js',()=>({default:{findByIdForUser:m.findDraft,create:m.createDraft,updateForUser:m.updateDraft}}));
vi.mock('../../models/NoteAidAgencyCatalog.model.js',()=>({default:{findCustomAid:m.custom,userCanAccessCustomAid:m.customAccess,parseKbFolders:value=>Array.isArray(value)?value:[]}}));
vi.mock('../clinicalAppointmentAlerts.service.js',()=>({default:{assertReviewed:vi.fn()}}));
vi.mock('../clinicalDraftSessionContext.service.js',()=>({resolveClinicalDraftSessionContext:m.context}));
vi.mock('../staffCareEligibility.service.js',()=>({readStaffCareEligibility:m.care,requireStaffCareEligibility:m.care}));
vi.mock('../../utils/noteAidClientAgency.js',()=>({coerceNoteAidAgencyForClient:async()=>({agencyId:2,memberships:[2]}),canRemapDraftAgency:()=>false,listClientAgencyMembershipIds:async()=>[2]}));
vi.mock('../billingPolicy.service.js',()=>({listEligiblePolicyServiceCodes:async()=>[],resolvePolicyRuleForServiceCode:async()=>({enabledForAgency:true,allowedForCredentialTier:true})}));
vi.mock('../billingRules.service.js',async importOriginal=>({...await importOriginal(),loadCredentialOverrides:async()=>new Map(),grantedServiceCodesForProvider:async()=>[]}));
vi.mock('../clinicalKnowledgeBase.service.js',()=>({getKnowledgeBaseContext:m.knowledge,getKnowledgeBaseEvidence:m.knowledge,noteAidKnowledgeBaseOptions:value=>value}));
vi.mock('../sessionAiPrivacy.service.js',()=>({callPrivateSessionText:m.model,createSessionPrivacyContext:()=>({redact:async value=>value})}));
vi.mock('../noteAidChartAudit.service.js',()=>({logNoteAidChartEvent:m.audit}));

// The controller, shared guidance packer, exact service reference, authoring tool,
// credential checks, prompt builder, section parser and encryption remain real.
// Only external AI and the authorized database/storage boundaries are synthetic.
import { generateClinicalNote } from '../../controllers/clinicalNoteGenerator.controller.js';
import { getClinicalServiceReference } from '../clinicalServiceReference.service.js';
import { maybeDecryptNotePayload } from '../clinicalNoteCrypto.service.js';

const ownerGuide='OWNER_GUIDE_CANARY: Document the actual intervention, participant response and service rationale.';
const ownerExample='OWNER_EXAMPLE_CANARY: After practicing paced breathing, Client described less tension; do not invent a response.';
const request=(body={})=>({user:{id:7,role:'provider'},body:{agencyId:2,clientId:10,clinicalSessionId:20,draftId:55,
  dateOfService:'2026-11-06',durationMinutes:60,serviceCode:'H0004',writerMode:'narriva',inputText:'Client practiced paced breathing and reported less tension.',...body}});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
const invoke=async body=>{const req=request(body),res=response(),next=vi.fn();await generateClinicalNote(req,res,next);return {req,res,next};};
let saved,care;
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));
 saved={id:55,user_id:7,agency_id:2,client_id:10,clinical_session_id:20,service_code:'H0004',input_text:'Original saved Session Narrative.',output_json:JSON.stringify({sections:{Subjective:'Original saved note.'},meta:{serviceCode:'H0004'}})};
 care={credential:'BA',credentialTier:'bachelors',agencyRole:'provider',canProvideCare:true};
 m.care.mockImplementation(async()=>care);m.agencies.mockResolvedValue([{id:2}]);
 m.agency.mockResolvedValue({id:2,feature_flags:{narriva:{writing:true},noteAidKbExtraFolders:['owner_guides']}});
 m.client.mockResolvedValue({id:10,first_name:'Protected',last_name:'Identity',date_of_birth:'1990-01-01'});m.guardians.mockResolvedValue([]);
 m.context.mockResolvedValue({clinicalSessionId:20,agencyId:2,clientId:10});
 m.findDraft.mockImplementation(async()=>saved);m.createDraft.mockResolvedValue({id:56});
 m.updateDraft.mockImplementation(async({patch})=>{saved={...saved,service_code:patch.serviceCode,input_text:patch.inputText,output_json:patch.outputJson};return saved;});
 m.knowledge.mockResolvedValue({text:ownerGuide+'\n'+ownerExample,complete:true,documents:[{id:'owner-guide',contentHash:'guide-v1',role:'authored_training'},{id:'owner-example',contentHash:'example-v1',role:'approved_example'}],coverage:{complete:true}});
 m.custom.mockResolvedValue(null);m.customAccess.mockResolvedValue(true);
 m.model.mockResolvedValue({text:'Subjective:\nClient described tension during school transitions.\nObjective:\nClient practiced paced breathing.\nInterventions:\nPaced Breathing, Skills Practice\nPlan:\nClient will practice the breathing skill before the next school transition.',modelName:'synthetic-only',latencyMs:2,finishReason:'STOP'});
 m.execute.mockImplementation(async sql=>{if(sql.includes('SELECT DISTINCT service_code'))return [[{service_code:'H0004'},{service_code:'H2011'},{service_code:'90837'},{service_code:'97535'}]];throw new Error('Unexpected database access in generation test');});
});
afterEach(()=>vi.unstubAllEnvs());

describe('actual clinical generator shared service guidance boundary',()=>{
 it('delivers the approved exact service definition and owner guide/examples to the actual writer prompt',async()=>{
  const {res,next}=await invoke();expect(next).not.toHaveBeenCalled();expect(res.status).not.toHaveBeenCalled();expect(m.model).toHaveBeenCalledOnce();
  const {prompt}=m.model.mock.calls[0][0],reference=getClinicalServiceReference('H0004');
  expect(prompt).toContain(reference.serviceDescription);expect(prompt).toContain(reference.documentation);expect(prompt).toContain(reference.providerQualifications);
  expect(prompt).toContain(ownerGuide);expect(prompt).toContain(ownerExample);expect(prompt).toContain('Client practiced paced breathing and reported less tension.');
  expect(prompt).toContain('not to invent facts that make this service fit');
  expect(m.knowledge).toHaveBeenCalledWith(expect.objectContaining({query:'H0004',folders:expect.arrayContaining(['shared','H0004_note','owner_guides'])}));
  const output=res.json.mock.calls[0][0].outputJson;
  expect(output.meta.guidanceSnapshot).toMatchObject({serviceCode:'H0004',supportCoverageComplete:true,supportingDocumentCount:2,guidanceHash:expect.stringMatching(/^[a-f0-9]{64}$/),serviceReferenceHash:expect.stringMatching(/^[a-f0-9]{64}$/)});
  expect(JSON.parse(maybeDecryptNotePayload(saved.output_json)).meta.guidanceSnapshot).toEqual(output.meta.guidanceSnapshot);
 });
 it('includes authorized custom owner training through the same complete guidance path',async()=>{
  m.custom.mockResolvedValue({enabled:1,system_prompt:'CUSTOM_SYSTEM_CANARY',training_notes:'CUSTOM_TRAINING_CANARY',guidance:'CUSTOM_EXAMPLE_CANARY',kbFolders:['custom_examples']});
  const {res,next}=await invoke({aidId:'custom_9'});expect(next).not.toHaveBeenCalled();expect(res.status).not.toHaveBeenCalled();
  const {prompt}=m.model.mock.calls[0][0];for(const value of ['CUSTOM_SYSTEM_CANARY','CUSTOM_TRAINING_CANARY','CUSTOM_EXAMPLE_CANARY',ownerGuide,ownerExample])expect(prompt).toContain(value);
  expect(m.customAccess).toHaveBeenCalledWith(2,7,9);expect(m.knowledge).toHaveBeenCalledWith(expect.objectContaining({folders:expect.arrayContaining(['custom_examples'])}));
 });
 it.each([null,{text:'Partial owner guide',complete:false,coverage:{unreadable:1}},{text:'',complete:true}])('blocks dispatch and preserves the exact saved draft when required guidance is unavailable (%j)',async evidence=>{
  const before=structuredClone(saved);m.knowledge.mockResolvedValue(evidence);
  const {res,next}=await invoke();expect(next).not.toHaveBeenCalled();expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({error:expect.objectContaining({code:'NARRIVA_GUIDANCE_UNAVAILABLE'})});
  expect(m.model).not.toHaveBeenCalled();expect(m.createDraft).not.toHaveBeenCalled();expect(m.updateDraft).not.toHaveBeenCalled();expect(saved).toEqual(before);
 });
 it('does not generate against a fabricated manual entry for a catalog code absent from the supplied handbook',async()=>{
  care={...care,credential:'LPC',credentialTier:'intern_plus'};
  const before=structuredClone(saved),{res}=await invoke({serviceCode:'97535',toolId:'clinical_code_decider'});
  expect(res.status).toHaveBeenCalledWith(503);expect(m.model).not.toHaveBeenCalled();expect(m.knowledge).not.toHaveBeenCalled();expect(m.updateDraft).not.toHaveBeenCalled();expect(saved).toEqual(before);
 });
 it('uses an explicit pro bono underlying clinical reference without changing the saved funding/service choice',async()=>{
  saved={...saved,service_code:'PRO-BONO SERVICE',output_json:JSON.stringify({sections:{Subjective:'Original free session note.'},meta:{serviceCode:'PRO-BONO SERVICE',underlyingServiceCode:'H0004',fundingDisposition:'pro_bono'}})};
  const {res,next}=await invoke({serviceCode:'PRO-BONO SERVICE'});expect(next).not.toHaveBeenCalled();expect(res.status).not.toHaveBeenCalled();
  const {prompt}=m.model.mock.calls[0][0],underlying=getClinicalServiceReference('H0004'),funding=getClinicalServiceReference('PRO-BONO SERVICE');
  expect(prompt).toContain(underlying.serviceDescription);expect(prompt).toContain(funding.serviceDescription);expect(prompt).toContain('Keep clinical service and pro bono funding separate');
  expect(m.context.mock.calls.every(([context])=>context.serviceCode==='PRO-BONO SERVICE')).toBe(true);
  expect(m.updateDraft).toHaveBeenCalledWith(expect.objectContaining({patch:expect.objectContaining({serviceCode:'PRO-BONO SERVICE'})}));
  expect(saved.service_code).toBe('PRO-BONO SERVICE');
  expect(res.json.mock.calls[0][0].outputJson.meta).toMatchObject({serviceCode:'PRO-BONO SERVICE',underlyingServiceCode:'H0004',guidanceSnapshot:{serviceCode:'H0004'}});
  expect(m.knowledge).toHaveBeenCalledWith(expect.objectContaining({query:'H0004'}));
 });
 it('does not infer an underlying clinical code from duration or the selected writer tool',async()=>{
  saved={...saved,service_code:'PRO-BONO SERVICE',output_json:JSON.stringify({sections:{Subjective:'Original free session note.'},meta:{serviceCode:'PRO-BONO SERVICE'}})};
  const before=structuredClone(saved),{res}=await invoke({serviceCode:'PRO-BONO SERVICE',toolId:'clinical_h0004_note',durationMinutes:60});
  expect(res.status).toHaveBeenCalledWith(422);expect(res.json).toHaveBeenCalledWith({error:expect.objectContaining({code:'NARRIVA_UNDERLYING_SERVICE_REQUIRED'})});
  expect(m.model).not.toHaveBeenCalled();expect(m.updateDraft).not.toHaveBeenCalled();expect(saved).toEqual(before);
 });
 it('does not let pro bono funding grant a bachelor provider an ineligible underlying psychotherapy service',async()=>{
  const before=structuredClone(saved),{res}=await invoke({serviceCode:'PRO-BONO SERVICE',underlyingServiceCode:'90837'});
  expect(res.status).toHaveBeenCalledWith(403);expect(m.model).not.toHaveBeenCalled();expect(m.updateDraft).not.toHaveBeenCalled();expect(saved).toEqual(before);
 });
});

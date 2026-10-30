import {expect,it,vi} from 'vitest';
import fs from 'node:fs';
import * as signing from '../../utils/multiChildIntake.js';
import { assertInvitedEnrollmentChildren } from '../../services/coGuardianEnrollmentRoster.js';
import { assertPortalEnrollmentIdentity } from '../../utils/portalEnrollmentBinding.js';
import { submittedChildCount, submissionArtifactsComplete } from '../../services/enrollmentSubmissionRoster.service.js';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {assertActiveCoGuardianInvite,assertCoGuardianSubmissionBinding} from '../../services/coGuardianInvite.service.js';

// Run the actual finalize handler against synthetic persistence boundaries.
// Stop at account acceptance so tests cannot generate documents or send mail.
const source=fs.readFileSync(new URL('../publicIntake.controller.js',import.meta.url),'utf8');
function setup({allowResume=false,bundles=[],failed=false,templates=[],signedDocs=[],bindingClients=[{id:5}],requiredSteps=[],firstGuardian=false}={}) {
 bindingClients=bindingClients.map((c,i)=>({...c,full_name:`Child ${i} Example`,date_of_birth:'2015-01-01'}));
 const intakeData={clients:bindingClients.map(c=>({clientId:c.id,fullName:c.full_name,dateOfBirth:c.date_of_birth})),responses:{submission:{}}};
 if(bindingClients.length>1)intakeData.multiClientSignatureConsent={accepted:true,acceptedAt:new Date().toISOString(),clientCount:bindingClients.length};
 const submission={id:18,intake_link_id:8,status:'submitted',guardian_user_id:9,co_guardian_invite_id:3,session_token:'session',
 intake_data:JSON.stringify({...intakeData,...(failed?{packetGeneration:{status:'needs_review'}}:{})})};
 if(firstGuardian){delete submission.co_guardian_invite_id;submission.client_id=5;}
 const invite={id:3,status:'accepted',agency_id:2,public_key:'packet',invited_email:'parent@example.test',accepted_user_id:9,
  expires_at:new Date(Date.now()+86400000).toISOString()};
 const reachedAcceptance=new Error('reached verified account acceptance');
 const accept=vi.fn(async()=>{throw reachedAcceptance;});
 const update=vi.fn(async(_id,updates)=>({...submission,...updates}));
 const deps={...signing,assertInvitedEnrollmentChildren,assertPortalEnrollmentIdentity,submittedChildCount,submissionArtifactsComplete,
  restoreSubmissionRoster:async()=>{throw reachedAcceptance;},
  validationResult:()=>({isEmpty:()=>true}),
  resolvePublicIntakeContext:async()=>({link:{id:8,is_active:true,scope_type:'agency',form_type:'intake',organization_id:2,create_client:1,create_guardian:1,intake_steps:requiredSteps}}),
  applyChannelMasterReadOnly:async link=>link,applySmartRoiPayloadFallback:()=>{},resolveAgencyIdForLink:async()=>2,
  CoGuardianInvite:{assertCoGuardianSubmissionBinding,resolveCoGuardianResumeBinding:async(_row,token)=>allowResume&&token===submission.session_token?{invite,clients:bindingClients,acceptedUserId:9}:null,resolveCoGuardianIntakeBinding:async()=>({invite:assertActiveCoGuardianInvite(invite,{agencyId:2,publicKey:'packet'}),clients:bindingClients,acceptedUserId:9}),acceptCoGuardianInvite:accept},
  matchesIntakeSession:(a,b)=>a===b,IntakeSubmission:{findById:async()=>submission,updateById:update,bindCoGuardianInvite:async()=>submission},
  loadAllowedTemplates:async()=>templates,hasProgrammedSchoolRoiStep:()=>false,isSmartDisclosureForm:()=>false,isSmartSchoolRoiForm:()=>false,isSubmissionExpired:()=>false,
  IntakeSubmissionClient:{listBySubmissionId:async()=>bundles},IntakeSubmissionDocument:{listBySubmissionId:async()=>signedDocs},
  parseSubmissionIntakeData:row=>JSON.parse(row.intake_data),StorageService:{getSignedUrl:async path=>`https://storage.test/${path}`},repairSmartSchoolRoiClientDateOfBirthFromSubmission:async()=>{},
  validateIntakeMatchingPreferences:()=>{},validateAndStampIntakeCommunications:async()=>{},
  isIntakeStepVisibleForClientMatch:()=>true,extractRegistrationClientMatchFromIntakeData:()=>({}),matchesShowIf:()=>true,mergeShowIfValues:()=>({}),
  stripIneligibleProviderPreference:()=>{},validateSubmittedProviderPreferences:async()=>{},prepareLearningPacket:async()=>{},ensureLinkBoundCompanyEventSelection:()=>{},stampInsuranceAuthorizationSignatureMeta:()=>{},
  filterPacketDocumentTemplates:()=>templates,resolveRetentionPolicy:async()=>null,buildRetentionExpiresAt:()=>null,hashIntakeData:()=> 'synthetic'
 };
 const start=source.indexOf('export const finalizePublicIntake = '),end=source.indexOf('export const submitPublicIntake = ',start);
 const handler=new Function(...Object.keys(deps),`${source.slice(start,end).replace('export const','const')} return finalizePublicIntake;`)(...Object.values(deps));
 const req={params:{publicKey:'packet',submissionId:'18'},headers:{},body:{sessionToken:'session',coGuardianToken:'accepted-token',guardian:{firstName:'Parent',email:'parent@example.test'},clients:intakeData.clients,intakeData}};
 if(firstGuardian)delete req.body.coGuardianToken;
 const output={};const res={status(code){output.status=code;return this;},json(value){output.body=value;return this;}};
 return {run:async()=>{await handler(req,res,error=>{output.error=error;});return output;},accept,update,reachedAcceptance,req,submission};
}
it('permits the still-active accepted token to retry when no packet was completed',async()=>{
 const state=setup();const result=await state.run();
 expect(result.error).toBe(state.reachedAcceptance);expect(result.body?.success).not.toBe(true);
 expect(state.accept).toHaveBeenCalledWith(expect.objectContaining({token:'accepted-token',enrollmentCompleted:true}));
});
it('does not short-circuit a failed demographic pass just because a prior bundle exists',async()=>{
 const state=setup({failed:true,bundles:[{client_id:5,bundle_pdf_path:'partial.pdf'}]});
 expect((await state.run()).error).toBe(state.reachedAcceptance);expect(state.accept).toHaveBeenCalledOnce();
});
it('does not treat one sibling’s artifact as completion of all invited children',async()=>{
 const state=setup({bindingClients:[{id:5},{id:6}],bundles:[{client_id:5,bundle_pdf_path:'first.pdf'}]});
 expect((await state.run()).error).toBe(state.reachedAcceptance);expect(state.accept).toHaveBeenCalledOnce();
});
it('retries the first parent’s remaining sibling instead of returning the first child as full completion',async()=>{
 const state=setup({firstGuardian:true,bindingClients:[{id:5},{id:6}],bundles:[{client_id:5,bundle_pdf_path:'first.pdf'},{client_id:6}]});
 expect((await state.run()).error).toBe(state.reachedAcceptance);
 expect(state.accept).not.toHaveBeenCalled();
});
it('reuses completed artifacts without activating or changing the account again',async()=>{
 const state=setup({bundles:[{client_id:5,bundle_pdf_path:'complete.pdf'}]});
 expect((await state.run()).body).toMatchObject({success:true,clientBundles:[{clientId:5}]});
 expect(state.accept).not.toHaveBeenCalled();expect(state.update).not.toHaveBeenCalled();
});
it('blocks missing programmed consent before either submitted-state changes or portal activation',async()=>{
 const state=setup({requiredSteps:[{type:'packet_policy_services',label:'Agency policies'}]});
 const result=await state.run();expect(result.error).toBeUndefined();expect(result.status).toBe(400);expect(result.body.error.message).toContain('Agency policies');
 expect(state.accept).not.toHaveBeenCalled();expect(state.update).not.toHaveBeenCalled();
});
it('does not allow an unrelated signed document to stand in for a required template before activation',async()=>{
 const state=setup({templates:[{id:40,name:'Required agreement'}],signedDocs:[{document_template_id:41,signed_pdf_path:'unrelated.pdf'}]});
 const result=await state.run();expect(result.error).toBeUndefined();expect(result.status).toBe(400);expect(result.body.error.message).toContain('Required agreement');
 expect(state.accept).not.toHaveBeenCalled();expect(state.update).not.toHaveBeenCalled();
});
it('queues a guardian’s changes before making that child’s completed bundle available',async()=>{
 const loop=source.indexOf("console.info('[publicIntake] intake/school finalize per-client loop starting'");
 const start=source.indexOf('const clientPayload = rawClients[i];',loop),end=source.indexOf('const clientPaths = [];',start);
 const published=vi.fn(),persist=vi.fn(async()=>{throw new Error('Review queue unavailable');});
 const deps={rawClients:[{id:5,fullName:'Child Example'}],i:0,submissionId:18,intakeClientRows:[],
  IntakeSubmissionClient:{listBySubmissionId:async()=>[],create:async()=>({id:21,client_id:5})},coGuardianBinding:{clients:[{id:5}]},
  intakeData:{},now:new Date(),sharedDocuments:{failures:new Map()},persistChildIntakeData:persist,
  console:{info:()=>{}},publishBundle:published};
 const run=new Function(...Object.keys(deps),`return (async()=>{${source.slice(start,end)} await publishBundle();})();`);
 await expect(run(...Object.values(deps))).rejects.toThrow('Review queue unavailable');
 expect(persist).toHaveBeenCalledWith(expect.objectContaining({clientId:5,submissionId:18,preserveClientDemographics:true}));
 expect(published).not.toHaveBeenCalled();
});
it('fails closed if a bound enrollment retry omits its guardian token',async()=>{
 const state=setup({bundles:[{client_id:5,bundle_pdf_path:'complete.pdf'}]});
 delete state.req.body.coGuardianToken;
 const result=await state.run();expect(result.error).toHaveProperty('status',403);expect(result.body?.success).not.toBe(true);
 expect(state.accept).not.toHaveBeenCalled();expect(state.update).not.toHaveBeenCalled();
});
it('also requires the matching invitation for older server-attributed guardian submissions',async()=>{
 const state=setup();delete state.submission.co_guardian_invite_id;
 state.submission.intake_data=JSON.stringify({guardianSubmission:{kind:'additional_guardian',inviteId:3,guardianUserId:9}});
 delete state.req.body.coGuardianToken;
 expect((await state.run()).error).toHaveProperty('status',403);
});
it('rejects switching a durable invitation or its accepted guardian identity',()=>{
 const binding={invite:{id:3,accepted_user_id:9},acceptedUserId:9};
 for(const row of [{co_guardian_invite_id:4},{co_guardian_invite_id:3,guardian_user_id:10},
  {intake_data:JSON.stringify({guardianSubmission:{kind:'additional_guardian',inviteId:4,guardianUserId:9}})},
  {intake_data:JSON.stringify({guardianSubmission:{kind:'additional_guardian',inviteId:3,guardianUserId:10}})}]){
  expect(()=>assertCoGuardianSubmissionBinding(row,binding)).toThrow('original guardian invitation');
 }
 expect(()=>assertCoGuardianSubmissionBinding({co_guardian_invite_id:3,guardian_user_id:9},binding)).not.toThrow();
});
it('stores only the server-resolved invitation when starting a session',async()=>{
 const create=vi.fn(async data=>({id:18,...data}));
 const deps={validationResult:()=>({isEmpty:()=>true}),resolvePublicIntakeContext:async()=>({link:{id:8,is_active:true}}),
  CoGuardianInvite:{resolveCoGuardianIntakeBinding:async()=>({invite:{id:3}})},resolveAgencyIdForLink:async()=>2,
  resolveIntakeOrgContext:async()=>({organization:{},agency:{}}),isSmartSchoolRoiForm:()=>false,requiresCaptchaForLink:()=>false,
  config:{nodeEnv:'test',recaptcha:{}},isLocalRecaptchaBypassRequest:()=>false,getClientIpAddress:()=> '127.0.0.1',
  IntakeSubmission:{countStartsByLinkAndIp:async()=>0,create},loadAllowedTemplates:async()=>[],isEnrollmentReminderLink:()=>false,
  BASE_CONSENT_TTL_MS:86400000,PER_PAGE_TTL_MS:1000,crypto:{randomBytes:()=>({toString:()=> 'synthetic-session'})}};
 const start=source.indexOf('export const createPublicIntakeSession = '),end=source.indexOf('export const postPublicIntakeReminderConsent = ',start);
 const handler=new Function(...Object.keys(deps),`${source.slice(start,end).replace('export const','const')} return createPublicIntakeSession;`)(...Object.values(deps));
 const req={params:{publicKey:'packet'},body:{coGuardianToken:'valid-token',coGuardianInviteId:999,co_guardian_invite_id:999},get:()=> 'test'};
 const next=vi.fn(),res={json:vi.fn(),status(){return this;}};
 await handler(req,res,next);expect(next).not.toHaveBeenCalled();expect(create).toHaveBeenLastCalledWith(expect.objectContaining({coGuardianInviteId:3}));
 delete req.body.coGuardianToken;await handler(req,res,next);
 expect(create).toHaveBeenLastCalledWith(expect.objectContaining({coGuardianInviteId:null}));
});
it('blocks the legacy submit endpoint for a durable guardian session even when its token is omitted',async()=>{
 const deps={validationResult:()=>({isEmpty:()=>true}),resolvePublicIntakeContext:async()=>({link:{id:8,is_active:true}}),
  applySmartRoiPayloadFallback:()=>{},IntakeSubmission:{findById:async()=>({id:18,intake_link_id:8,co_guardian_invite_id:3})},
  CoGuardianInvite:{assertCoGuardianSubmissionBinding}};
 const start=source.indexOf('export const submitPublicIntake = '),end=source.indexOf('\nexport const ',start+10);
 const handler=new Function(...Object.keys(deps),`${source.slice(start,end).replace('export const','const')} return submitPublicIntake;`)(...Object.values(deps));
 const next=vi.fn(),res={json:vi.fn(),status(){return this;}};
 await handler({params:{publicKey:'packet'},body:{submissionId:18}},res,next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(res.json).not.toHaveBeenCalled();
});
it('reuses the existing child association when a failed guardian enrollment is retried',async()=>{
 const start=source.indexOf('const clientPayload = rawClients[i];',source.indexOf("console.info('[publicIntake] intake/school finalize per-client loop starting'"));
 const end=source.indexOf('const clientPaths = [];',start);
 const existing={id:21,client_id:5,bundle_pdf_path:null};const create=vi.fn(),rows=[];
 const deps={rawClients:[{id:5,fullName:'Child Example'}],i:0,submissionId:18,intakeClientRows:rows,
  IntakeSubmissionClient:{listBySubmissionId:async()=>[existing],create},coGuardianBinding:{clients:[{id:5}]},
  intakeData:{},now:new Date(),sharedDocuments:{failures:new Map()},persistChildIntakeData:async()=>{},console:{info:()=>{}}};
 await new Function(...Object.keys(deps),`return (async()=>{${source.slice(start,end)}})();`)(...Object.values(deps));
 expect(rows).toEqual([existing]);expect(create).not.toHaveBeenCalled();
});
it('clears an old recovery flag only after every invited child has a completed bundle',async()=>{
 const start=source.indexOf('async function clearRecoveredPacketFailure('),end=source.indexOf('\nconst normalizeName',start);
 const update=vi.fn();let rows=[{client_id:5,bundle_pdf_path:'five.pdf'}];
 const deps={IntakeSubmission:{findById:async()=>({intake_data:JSON.stringify({packetGeneration:{status:'needs_review',failedClientIds:[6]}})}),updateById:update},parseSubmissionIntakeData:s=>JSON.parse(s.intake_data),IntakeSubmissionClient:{listBySubmissionId:async()=>rows},hashIntakeData:()=> 'hash'};
 const clear=new Function(...Object.keys(deps),`${source.slice(start,end)} return clearRecoveredPacketFailure;`)(...Object.values(deps));
 await clear(18,[5,6]);expect(update).not.toHaveBeenCalled();
 rows.push({client_id:6,bundle_pdf_path:'six.pdf'});await clear(18,[5,6]);
 expect(JSON.parse(update.mock.calls[0][1].intake_data).packetGeneration).toEqual({status:'complete',failedClientIds:[]});
});

it('finalizes a verified bound resume session without requiring the invitation query parameter again',async()=>{
 const state=setup({allowResume:true});delete state.req.body.coGuardianToken;
 expect((await state.run()).error).toBe(state.reachedAcceptance);
 expect(state.accept).toHaveBeenCalledWith(expect.objectContaining({resume:{agencyId:2,publicKey:'packet',submissionId:18,sessionToken:'session'},enrollmentCompleted:true}));
});
it('does not fall back to the saved session when an explicit different invitation was supplied',async()=>{
 const state=setup({allowResume:true});state.submission.co_guardian_invite_id=4;
 expect((await state.run()).error).toHaveProperty('status',403);
 expect(state.accept).not.toHaveBeenCalled();
});

it('rejects additional children before accepting or changing a guardian account',async()=>{
 const state=setup();state.req.body.clients.push({fullName:'Uninvited Child',dateOfBirth:'2018-01-01'});
 expect((await state.run()).error).toHaveProperty('status',400);
 expect(state.accept).not.toHaveBeenCalled();expect(state.update).not.toHaveBeenCalled();
});

import {issueNarrivaGenerationReceipt} from '../../services/narrivaGenerationReceipt.service.js';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/clinical/ClinicalSession.model.js',()=>({default:{findById:vi.fn(),findByOfficeEventAndClient:vi.fn()}}));
vi.mock('../../models/ClinicalNoteDraft.model.js',()=>({default:{findByIdForUser:vi.fn(),findReusableOpen:vi.fn()}}));
vi.mock('../../models/clinical/ClinicalTreatmentPlan.model.js',()=>({default:{listByClient:vi.fn(),findById:vi.fn()}}));
vi.mock('../../models/clinical/ClinicalTreatmentObjectiveRating.model.js',()=>({default:{findLatestForDedupe:vi.fn(),findPreviousSession:vi.fn()}}));
vi.mock('../../models/NoteAidWorkQueueItem.model.js',()=>({default:{findByIdForUser:vi.fn(),findByClientKeyForUser:vi.fn()}}));
vi.mock('../../models/SessionRecording.model.js',()=>({default:{findByIdForUser:vi.fn()}}));
vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listForClient:vi.fn()}}));
vi.mock('../../services/narrivaAccess.service.js',()=>({requireNarrivaAgency:vi.fn(),requireNarrivaClient:vi.fn(),maskMobileClientName:client=>[client.first_name||String(client.full_name||'').split(' ')[0],client.last_name||String(client.full_name||'').split(' ').at(-1)].filter(Boolean).map(part=>part.slice(0,3)+(part.length>3?'*':'')).join(' '),positiveId:value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):null,narrivaError:(status,message)=>Object.assign(new Error(message),{status}),parseNarrivaObject:value=>{if(value&&typeof value==='object')return value;try{return JSON.parse(value||'{}');}catch{return {};}}}));
vi.mock('../../services/narrivaSource.service.js',()=>({loadNarrivaSource:vi.fn(),decryptNarrivaDraft:vi.fn(value=>value||'')}));
vi.mock('../../services/staffCareEligibility.service.js',()=>({readStaffCareEligibility:vi.fn()}));
vi.mock('../../services/agencySchedulingCatalog.service.js',()=>({resolveAgencySchedulingCatalog:vi.fn()}));
vi.mock('../../services/narrivaReview.service.js',()=>({narrivaWriterCapabilities:vi.fn(),latestNarrivaStatus:vi.fn()}));
vi.mock('../../services/guardianClinicalAccess.service.js',()=>({clinicalAccess:vi.fn()}));
vi.mock('../../services/clientSecureConversation.service.js',()=>({clientSecureAudience:vi.fn(),ensureClientSecureConversation:vi.fn()}));
vi.mock('../../services/providerSmsRelayIdentity.service.js',()=>({resolveRelayFamily:vi.fn()}));
vi.mock('../../services/clinicalSmsSend.service.js',()=>({sendClinicalSms:vi.fn()}));
vi.mock('../../services/clinicalSessionRecording.service.js',()=>({getAuthorizedRecordingNarrative:vi.fn()}));
vi.mock('../medicalBilling.controller.js',()=>({getClinicalNoteById:vi.fn(),listServiceLocations:vi.fn()}));
vi.mock('../supervisedBilling.controller.js',()=>({getSuperviseeReviewDocument:vi.fn()}));
vi.mock('../chat.controller.js',()=>({sendMessage:vi.fn()}));
vi.mock('../../services/secureMessageNotify.service.js',()=>({sendSecureMessageNotification:vi.fn()}));
vi.mock('../notesToSign.controller.js',()=>({listNotesToSign:vi.fn()}));
import {sendMessage} from '../chat.controller.js';
import {sendSecureMessageNotification} from '../../services/secureMessageNotify.service.js';
import pool from '../../config/database.js';
import {currentAccessAgencyId} from '../../utils/agencyAccessContext.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import User from '../../models/User.model.js';
import ClinicalSession from '../../models/clinical/ClinicalSession.model.js';
import ClinicalNoteDraft from '../../models/ClinicalNoteDraft.model.js';
import ClinicalTreatmentPlan from '../../models/clinical/ClinicalTreatmentPlan.model.js';
import Work from '../../models/NoteAidWorkQueueItem.model.js';
import Recording from '../../models/SessionRecording.model.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import {requireNarrivaClient,requireNarrivaAgency} from '../../services/narrivaAccess.service.js';
import {loadNarrivaSource,decryptNarrivaDraft} from '../../services/narrivaSource.service.js';
import {readStaffCareEligibility} from '../../services/staffCareEligibility.service.js';
import {resolveAgencySchedulingCatalog} from '../../services/agencySchedulingCatalog.service.js';
import {narrivaWriterCapabilities,latestNarrivaStatus} from '../../services/narrivaReview.service.js';
import {clinicalAccess} from '../../services/guardianClinicalAccess.service.js';
import {clientSecureAudience,ensureClientSecureConversation} from '../../services/clientSecureConversation.service.js';
import {resolveRelayFamily} from '../../services/providerSmsRelayIdentity.service.js';
import {sendClinicalSms} from '../../services/clinicalSmsSend.service.js';
import {getClinicalNoteById,listServiceLocations} from '../medicalBilling.controller.js';
import {getSuperviseeReviewDocument} from '../supervisedBilling.controller.js';
import {listNotesToSign} from '../notesToSign.controller.js';
import {requireMobileClinicalSession,scopedMobileClinicalHandler,getMobileClinicalContext,getMobileClientSummary,resolveMobileClientContact,sendMobileClientContact,getMobileNotesToSign} from '../mobileClinical.controller.js';
const client={id:20,first_name:'Michael',last_name:'Anderson',full_name:'Michael Anderson',date_of_birth:'2014-04-14',contact_phone:'+13035550000'};
const session={id:10,agency_id:4,client_id:20,provider_user_id:1,scheduled_start_at:'2026-11-06 16:00:00',scheduled_end_at:'2026-11-06 17:00:00',source_timezone:'America/Denver',service_code:'H2011',place_of_service:'11'};
const guardian={guardian_user_id:11,access_enabled:1,is_active:1,status:'ACTIVE',first_name:'Katherine',last_name:'Anderson',email:'guardian@example.test',phone:'+13035550111',relationship_type:'guardian',relationship_title:'Parent',permissions_json:{}};
const request=(overrides={})=>({quickView:{userId:1,agencyId:4,mobileDeviceSessionId:7},query:{},body:{},params:{},headers:{},...overrides});
const response=()=>{const res={set:vi.fn(),json:vi.fn(),status:vi.fn()};res.set.mockReturnValue(res);res.json.mockReturnValue(res);res.status.mockReturnValue(res);return res;};
beforeEach(()=>{
 vi.resetAllMocks();listServiceLocations.mockImplementation((req,res)=>res.json({choices:[{value:'service:8',name:'Assigned office',label:'Assigned office (POS 11)',serviceLocationId:8,billingOfficeLocationId:2,placeOfService:'11'}]}));vi.setSystemTime(new Date('2026-11-06T19:00:00Z'));User.findById.mockResolvedValue({id:1,role:'provider',is_active:1,status:'ACTIVE'});
 pool.execute.mockImplementation(async sql=>sql.includes('user_agencies')?[[{present:1}]]:sql.includes('default_mode')?[[{default_mode:'manual'}]]:[[]]);
 clinicalPool.execute.mockResolvedValue([[{agency_id:4,client_id:20}]]);
 requireNarrivaAgency.mockResolvedValue();requireNarrivaClient.mockResolvedValue({...client});
 ClinicalSession.findById.mockResolvedValue({...session});ClinicalSession.findByOfficeEventAndClient.mockResolvedValue(null);
 ClinicalNoteDraft.findByIdForUser.mockResolvedValue(null);ClinicalTreatmentPlan.listByClient.mockResolvedValue([]);Work.findByIdForUser.mockResolvedValue(null);Recording.findByIdForUser.mockResolvedValue(null);
 readStaffCareEligibility.mockResolvedValue({canProvideCare:true,credentialTier:'bachelors'});resolveAgencySchedulingCatalog.mockResolvedValue({eligibleServiceCodes:[{code:'H2011',label:'Crisis intervention',serviceInfo:{code:'H2011'}}]});narrivaWriterCapabilities.mockResolvedValue({enabled:true,manualAllowed:true});latestNarrivaStatus.mockResolvedValue({id:80,quickSignEligible:true,status:'passed'});decryptNarrivaDraft.mockImplementation(value=>value||'');
 ClientGuardian.listForClient.mockResolvedValue([{...guardian}]);clinicalAccess.mockResolvedValue({scopes:['clinical_messages'],reviewRequired:false});clientSecureAudience.mockResolvedValue({userIds:[1,11]});resolveRelayFamily.mockResolvedValue({guardianUserId:11,phone:guardian.phone});ensureClientSecureConversation.mockResolvedValue({threadId:88,agencyId:4,clientId:20,participants:[{id:1,name:'QA Provider',role:'provider'},{id:11,name:'QA Guardian',role:'guardian'}]});sendClinicalSms.mockResolvedValue({messageLog:{id:90}});
});
afterEach(()=>vi.useRealTimers());
describe('primary mobile clinical boundary',()=>{
 it('rejects legacy PIN sessions before reading a user, client or chart',async()=>{const req=request({quickView:{userId:1,agencyId:4}}),res=response(),next=vi.fn();await requireMobileClinicalSession(req,res,next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(User.findById).not.toHaveBeenCalled();expect(requireNarrivaClient).not.toHaveBeenCalled();});
 it('runs downstream handlers in the exact token agency context with the fresh effective actor',async()=>{
  requireNarrivaAgency.mockImplementation(async user=>{Object.assign(user,{role:'provider',scopedAgencyId:4,agencyAccess:{agencyId:4,permissions:{has_billing_access:false}}});return user;});
  const req=request(),seen=[];await requireMobileClinicalSession(req,response(),()=>seen.push(currentAccessAgencyId()));
  expect(seen).toEqual([4]);expect(req.user.role).toBe('provider');expect(User.findById).toHaveBeenCalledWith(1,{raw:true});
 });
 it('rejects a different requested workspace',async()=>{const next=vi.fn();await requireMobileClinicalSession(request({body:{agencyId:99}}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(User.findById).not.toHaveBeenCalled();});
 it('checks current token-workspace authority even for administrators',async()=>{User.findById.mockResolvedValue({id:1,role:'super_admin',is_active:1,status:'ACTIVE'});requireNarrivaAgency.mockRejectedValue(Object.assign(new Error('Access revoked'),{status:403}));const next=vi.fn();await requireMobileClinicalSession(request(),response(),next);expect(requireNarrivaAgency).toHaveBeenCalledWith(expect.objectContaining({id:1}),4);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));});
 it('accepts an already authorized platform grant without requiring a duplicate membership row',async()=>{pool.execute.mockResolvedValue([[]]);const req=request(),next=vi.fn();await requireMobileClinicalSession(req,response(),next);expect(next).toHaveBeenCalledWith();expect(req.mobileClinical).toMatchObject({verified:true,agencyId:4,userId:1});expect(requireNarrivaAgency).toHaveBeenCalledWith(expect.objectContaining({id:1}),4);});
 it('rejects an inactive user before chart access',async()=>{User.findById.mockResolvedValue({id:1,role:'provider',is_active:0,status:'ARCHIVED'});const next=vi.fn();await requireMobileClinicalSession(request(),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(pool.execute).not.toHaveBeenCalled();});
 it('rechecks body scope after multipart parsing replaces the middleware body',async()=>{const req=request(),res=response(),next=vi.fn();await requireMobileClinicalSession(req,res,next);req.body={agencyId:99};const handler=vi.fn();const failed=vi.fn();await scopedMobileClinicalHandler(handler)(req,res,failed);expect(failed).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(handler).not.toHaveBeenCalled();});
 it('rejects an unowned or cross-agency draft before invoking a writer',async()=>{ClinicalNoteDraft.findByIdForUser.mockResolvedValue({id:30,user_id:1,agency_id:99,client_id:20});const handler=vi.fn(),next=vi.fn();await scopedMobileClinicalHandler(handler,{draftParam:'draftId'})(request({params:{draftId:30}}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404}));expect(handler).not.toHaveBeenCalled();});
 it('rejects a body-linked draft/client mismatch before model invocation',async()=>{ClinicalNoteDraft.findByIdForUser.mockResolvedValue({id:30,user_id:1,agency_id:4,client_id:99});const handler=vi.fn(),next=vi.fn();await scopedMobileClinicalHandler(handler,{requireClient:true})(request({body:{clientId:20,draftId:30}}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(handler).not.toHaveBeenCalled();});
 it('rejects a session owned by another provider',async()=>{ClinicalSession.findById.mockResolvedValue({...session,provider_user_id:2});const handler=vi.fn(),next=vi.fn();await scopedMobileClinicalHandler(handler,{sessionParam:'sessionId'})(request({params:{sessionId:10}}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404}));expect(handler).not.toHaveBeenCalled();});
 it('rejects objective/client mismatches',async()=>{clinicalPool.execute.mockResolvedValue([[{agency_id:4,client_id:99}]]);const handler=vi.fn(),next=vi.fn();await scopedMobileClinicalHandler(handler,{objectiveParam:'objectiveId'})(request({params:{objectiveId:50},body:{clientId:20}}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(handler).not.toHaveBeenCalled();});
 it('rejects another workspace recording before invoking capture handlers',async()=>{Recording.findByIdForUser.mockResolvedValue({id:40,agency_id:99,client_id:20});const handler=vi.fn(),next=vi.fn();await scopedMobileClinicalHandler(handler,{recordingParam:'recordingId'})(request({params:{recordingId:40}}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404}));expect(handler).not.toHaveBeenCalled();});
 it('masks recorder participant/signers in mobile state while preserving timestamps',async()=>{
  const req=request({body:{clientId:20}}),res=response(),json=res.json,next=vi.fn();
  const handler=vi.fn((req,res)=>res.json({participants:[{name:'Michael Anderson',signers:[{name:'Katherine Anderson'}]}],recording:{createdAt:new Date('2026-11-06T18:00:00Z')}}));
  await scopedMobileClinicalHandler(handler,{requireClient:true,maskRecordingNames:true})(req,res,next);
  expect(next).not.toHaveBeenCalled();expect(json.mock.calls[0][0]).toMatchObject({participants:[{name:'Mic* And*',signers:[{name:'Kat* And*'}]}],recording:{createdAt:'2026-11-06T18:00:00.000Z'}});
 });
 it('binds the authenticated actor and strips identifying metadata from adapted responses',async()=>{const req=request({body:{clientId:20,userId:999}}),res=response(),next=vi.fn();const handler=vi.fn((req,res)=>res.json({draft:{clientName:'Full Private Name',clientDob:'2014-04-14',outputJson:{meta:{clientDob:'2014-04-14'},sections:{Narrative:'Synthetic session'}}}}));await scopedMobileClinicalHandler(handler,{requireClient:true})(req,res,next);expect(handler.mock.calls[0][0].user.id).toBe(1);expect(req.body.agencyId).toBe(4);expect(JSON.stringify(res.json.mock?.calls||[])).not.toContain('2014-04-14');expect(next).not.toHaveBeenCalled();});
});
describe('mobile writer context',()=>{
 it('restores the author’s saved desktop draft when a phone launch supplies only the encounter',async()=>{
  ClinicalNoteDraft.findReusableOpen.mockResolvedValue({id:30,user_id:1,agency_id:4,client_id:20,clinical_session_id:10,input_text:'Saved desktop narrative',output_json:JSON.stringify({sections:{Narrative:'Saved draft output'},meta:{}})});
  const res=response(),next=vi.fn();await getMobileClinicalContext(request({query:{clientId:20,clinicalSessionId:10}}),res,next);
  expect(next).not.toHaveBeenCalled();expect(ClinicalNoteDraft.findReusableOpen).toHaveBeenCalledWith({userId:1,agencyId:4,clientId:20,officeEventId:null,clinicalSessionId:10});
  expect(res.json.mock.calls[0][0].draft).toMatchObject({id:30,inputText:'Saved desktop narrative',outputJson:{sections:{Narrative:'Saved draft output'}}});
 });
 it('does not substitute another encounter’s draft for a schedule launch',async()=>{
  ClinicalNoteDraft.findReusableOpen.mockResolvedValue({id:30,user_id:1,agency_id:4,client_id:20,clinical_session_id:11});
  const res=response(),next=vi.fn();await getMobileClinicalContext(request({query:{clientId:20,clinicalSessionId:10}}),res,next);
  expect(res.json).not.toHaveBeenCalled();expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
 });
 it('returns masked names, age, scoped service information and actual local encounter time without DOB',async()=>{const res=response(),next=vi.fn();await getMobileClinicalContext(request({query:{clientId:20,clinicalSessionId:10}}),res,next);expect(next).not.toHaveBeenCalled();const data=res.json.mock.calls[0][0];expect(data.client).toEqual({id:20,maskedName:'Mic* And*',age:12});expect(data.session).toMatchObject({id:10,dateOfService:'2026-11-06',startTimeLocal:'09:00',endTimeLocal:'10:00',durationMinutes:60});expect(data.serviceCodes[0].serviceInfo.code).toBe('H2011');expect(JSON.stringify(data)).not.toContain('2014-04-14');expect(JSON.stringify(data)).not.toContain('Michael Anderson');});
 it('shows current age while keeping encounter dates and eligibility tied to the actual service date',async()=>{
  ClinicalSession.findById.mockResolvedValue({...session,scheduled_start_at:'2020-11-06 16:00:00',scheduled_end_at:'2020-11-06 17:00:00'});
  const res=response();await getMobileClinicalContext(request({query:{clientId:20,clinicalSessionId:10}}),res,vi.fn());
  expect(res.json.mock.calls[0][0].client.age).toBe(12);expect(res.json.mock.calls[0][0].session.dateOfService).toBe('2020-11-06');
 });
 it('respects the existing manual-writing preference instead of defaulting a restricted account to Manual',async()=>{
  narrivaWriterCapabilities.mockResolvedValue({writing:true,manualAllowed:false});const res=response();await getMobileClinicalContext(request({query:{clientId:20,clinicalSessionId:10}}),res,vi.fn());
  expect(res.json.mock.calls[0][0].preferences).toEqual({defaultMode:'narriva',features:{writing:true,manualAllowed:false}});
 });
 it('does not use another user’s work item or a different current workspace',async()=>{const next=vi.fn();await getMobileClinicalContext(request({query:{workId:9}}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404}));expect(requireNarrivaClient).not.toHaveBeenCalled();});
 it('loads a monotonic required-risk flag from only the current authorized draft/note/session IDs',async()=>{
  ClinicalNoteDraft.findByIdForUser.mockResolvedValue({id:30,agency_id:4,client_id:20,clinical_session_id:10,input_text:'',output_json:'{}'});
  pool.execute.mockImplementation(async sql=>sql.includes('user_agencies')?[[{present:1}]]:sql.includes('MAX(risk_assessment_required)')?[[{required:1}]]:[[]]);
  const res=response(),next=vi.fn();await getMobileClinicalContext(request({query:{draftId:30}}),res,next);expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].riskAssessmentRequired).toBe(true);
  expect(pool.execute.mock.calls.find(([sql])=>sql.includes('MAX(risk_assessment_required)'))[1]).toEqual([4,30,null,10]);
 });
 it('does not combine one draft with another encounter for the same client',async()=>{ClinicalNoteDraft.findByIdForUser.mockResolvedValue({id:30,agency_id:4,client_id:20,clinical_session_id:11});const next=vi.fn();await getMobileClinicalContext(request({query:{draftId:30,clinicalSessionId:10}}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));});
 it('fails closed when an encrypted draft cannot be decrypted',async()=>{ClinicalNoteDraft.findByIdForUser.mockResolvedValue({id:30,agency_id:4,client_id:20,clinical_session_id:10,input_text:'encrypted-envelope',output_json:'{}'});decryptNarrivaDraft.mockImplementation(()=>{throw new Error('Missing key');});const res=response(),next=vi.fn();await getMobileClinicalContext(request({query:{draftId:30}}),res,next);expect(res.json).not.toHaveBeenCalled();expect(next).toHaveBeenCalledWith(expect.objectContaining({message:'Missing key'}));});
 it('exposes a supervisor review only through the existing responsible-reviewer document workflow',async()=>{const providerSession={...session,provider_user_id:2};ClinicalSession.findById.mockResolvedValue(providerSession);loadNarrivaSource.mockResolvedValue({client:{...client},source:{id:99,created_by_user_id:2,provider_signed_at:'signed'},session:providerSession,meta:{},narrative:'Synthetic approved note'});getClinicalNoteById.mockImplementation((req,res)=>res.json({note:{id:99,providerSignedAt:'signed',outputJson:{sections:{Narrative:'Synthetic approved note'},meta:{clientDob:'2014-04-14'}},reviewSnapshotToken:'note-token'}}));getSuperviseeReviewDocument.mockImplementation((req,res)=>res.json({canCosign:true,contentHash:'current-hash',reviewSnapshotToken:'review-token',reviewSnapshot:{providerSignedAt:'signed'},versions:{entryManifestHash:'entries-current'}}));const res=response(),next=vi.fn();await getMobileClinicalContext(request({query:{noteId:99}}),res,next);expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].review).toMatchObject({canCosign:true,contentHash:'current-hash',reviewSnapshotToken:'review-token',entryManifestHash:'entries-current',narriva:{quickSignEligible:true}});expect(getSuperviseeReviewDocument.mock.calls[0][0].params.providerId).toBe('2');});
 it('keeps pending amendment versions out of Quick Sign',async()=>{ClinicalSession.findById.mockResolvedValue({...session,provider_user_id:2});loadNarrivaSource.mockResolvedValue({client:{...client},source:{id:99,created_by_user_id:2,provider_signed_at:'signed'},session:{...session,provider_user_id:2},meta:{},narrative:'Synthetic'});getClinicalNoteById.mockImplementation((req,res)=>res.json({note:{id:99,providerSignedAt:'signed'}}));getSuperviseeReviewDocument.mockImplementation((req,res)=>res.json({canCosign:true,versions:{pendingRevisionId:7}}));const res=response(),next=vi.fn();await getMobileClinicalContext(request({query:{noteId:99}}),res,next);expect(res.json.mock.calls[0][0].review.canCosign).toBe(false);});
});
describe('authorized client contact actions',()=>{
 it('shows a limited client/guardian summary with only masked names and current contact channels',async()=>{const res=response(),next=vi.fn();await getMobileClientSummary(request({params:{clientId:20}}),res,next);expect(next).not.toHaveBeenCalled();const data=res.json.mock.calls[0][0];expect(data.client.maskedName).toBe('Mic* And*');expect(data.contacts[0]).toMatchObject({key:'guardian:11',maskedName:'Kat* And*',email:guardian.email,phone:guardian.phone,channels:{secure:true,sms:true,email:true}});expect(JSON.stringify(data)).not.toContain('Katherine');expect(JSON.stringify(data)).not.toContain('2014-04-14');});
 it('rechecks guardian clinical disclosure permission before presenting any contact',async()=>{clinicalAccess.mockResolvedValue({scopes:[],reviewRequired:true});const res=response();await getMobileClientSummary(request({params:{clientId:20}}),res,vi.fn());expect(res.json.mock.calls[0][0].contacts).toEqual([]);});
 it('resolves the currently authorized shared secure conversation',async()=>{const res=response(),next=vi.fn();await resolveMobileClientContact(request({params:{clientId:20},body:{recipientKey:'guardian:11',channel:'secure'}}),res,next);expect(ensureClientSecureConversation).toHaveBeenCalledWith({clientId:20,agencyId:4,actorUserId:1});expect(res.json).toHaveBeenCalledWith({threadId:88,suite:'secure',agencyId:4,clientId:20,participants:[{id:1,name:'QA Provider',role:'provider'},{id:11,name:'QA Guardian',role:'guardian'}],sharingPolicy:'all_eligible_family'});});
 it('never accepts a caller-supplied recipient address',async()=>{const next=vi.fn();await sendMobileClientContact(request({params:{clientId:20},body:{recipientKey:'guardian:11',channel:'sms',text:'Synthetic',phone:'+13035550999'}}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:400}));expect(sendClinicalSms).not.toHaveBeenCalled();});
 it('routes SMS through existing consent, assignment, opt-out and assigned-number enforcement with a server-verified guardian',async()=>{const res=response(),next=vi.fn();await sendMobileClientContact(request({params:{clientId:20},body:{recipientKey:'guardian:11',channel:'sms',text:'Synthetic message'}}),res,next);expect(sendClinicalSms).toHaveBeenCalledWith({userId:1,clientId:20,body:'Synthetic message',relayRecipient:{phone:guardian.phone,guardianUserId:11}});expect(res.json).toHaveBeenCalledWith({ok:true,messageId:90,conversationId:null});});
 it('honors sender consent/permission failures instead of retrying through an unscoped transport',async()=>{const blocked=Object.assign(new Error('Opted out'),{status:403});sendClinicalSms.mockRejectedValue(blocked);const res=response(),next=vi.fn();await sendMobileClientContact(request({params:{clientId:20},body:{recipientKey:'guardian:11',channel:'sms',text:'Synthetic'}}),res,next);expect(next).toHaveBeenCalledWith(blocked);expect(res.json).not.toHaveBeenCalled();});
 it('does not retain access after a guardian or permitted channel is revoked',async()=>{ClientGuardian.listForClient.mockResolvedValue([{...guardian,access_enabled:0}]);const next=vi.fn();await sendMobileClientContact(request({params:{clientId:20},body:{recipientKey:'guardian:11',channel:'sms',text:'Synthetic'}}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(sendClinicalSms).not.toHaveBeenCalled();});
});

describe('supervisor mobile queue',()=>{
 it('returns only authorized current-workspace notes with masked identity and disables pending-version Quick Sign',async()=>{
  listNotesToSign.mockImplementation((req,res)=>res.json({isSupervisor:true,notes:[{id:1,agency_id:4,clinical_note_id:99,client_name:'Michael Anderson',client_code:'MA',date_of_service:'2026-11-06',clinical_revision_id:7,narriva:{quickSignEligible:true}},{id:2,agency_id:99,clinical_note_id:100},{id:3,agency_id:4,clinical_note_id:101}]}));
  loadNarrivaSource.mockImplementation(async(user,{noteId})=>{if(noteId===101)throw Object.assign(new Error('Reviewer revoked'),{status:403});return {client:{...client}};});
  const res=response(),next=vi.fn();await getMobileNotesToSign(request(),res,next);expect(next).not.toHaveBeenCalled();
  const data=res.json.mock.calls[0][0];expect(data.count).toBe(1);expect(data.notes[0]).toMatchObject({clinicalNoteId:99,clientMaskedName:'Mic* And*',clientAge:12,narriva:{quickSignEligible:false}});expect(JSON.stringify(data)).not.toContain('Michael Anderson');expect(JSON.stringify(data)).not.toContain('client_code');
 });
});

describe('mobile assigned locations and secure setup',()=>{
 it('preserves a saved remote location edit over the original office appointment and loads existing chart diagnoses',async()=>{
  ClinicalSession.findById.mockResolvedValue({...session,service_location_id:8,billing_office_location_id:2});
  ClinicalNoteDraft.findByIdForUser.mockResolvedValue({id:61,agency_id:4,client_id:20,clinical_session_id:10,input_text:'Saved evidence.',output_json:JSON.stringify({sections:{Narrative:'Saved note.'},meta:{sessionContext:{locationLabel:'Telehealth',placeOfService:'10',serviceLocationId:9,billingOfficeLocationId:2},narrivaContext:{modality:'video'}}})});
  clinicalPool.execute.mockImplementation(async sql=>sql.includes('FROM clinical_diagnoses')?[[{id:3,icd10_code:'F41.1',description:'Generalized anxiety disorder',justification:'Previously reviewed evidence.'}]]:[[{agency_id:4,client_id:20}]]);
  const res=response(),next=vi.fn();await getMobileClinicalContext(request({query:{clientId:20,clinicalSessionId:10,draftId:61}}),res,next);
  expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0]).toMatchObject({session:{locationLabel:'Telehealth',placeOfService:'10',serviceLocationId:9,modality:'video'},clinicalContext:{diagnoses:[{code:'F41.1',justification:'Previously reviewed evidence.'}]}});
 });
 it('opens the assigned encounter location without requiring the clinician to select it again',async()=>{ClinicalSession.findById.mockResolvedValue({...session,service_location_id:8,billing_office_location_id:2});const res=response(),next=vi.fn();await getMobileClinicalContext(request({query:{clientId:20,clinicalSessionId:10}}),res,next);expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0].session).toMatchObject({serviceLocationId:8,billingOfficeLocationId:2,placeOfService:'11',locationLabel:'Assigned office'});});
 it('preserves an encounter historical location label instead of replacing it with a renamed site',async()=>{ClinicalSession.findById.mockResolvedValue({...session,service_location_id:8,metadata_json:JSON.stringify({locationLabel:'Former office name'})});const res=response();await getMobileClinicalContext(request({query:{clientId:20,clinicalSessionId:10}}),res,vi.fn());expect(res.json.mock.calls[0][0].session.locationLabel).toBe('Former office name');});
 it('loads only the note-writer location choices in the token workspace',async()=>{const res=response(),next=vi.fn();await getMobileClinicalContext(request({query:{clientId:20,clinicalSessionId:10,includeInactive:'1',forNoteAid:'0'}}),res,next);expect(next).not.toHaveBeenCalled();expect(listServiceLocations.mock.calls[0][0].query).toMatchObject({agencyId:4,forNoteAid:'1',includeInactive:'0'});expect(res.json.mock.calls[0][0].locationChoices).toHaveLength(1);});
 it('preserves the note context and labels unavailable locations instead of silently offering generic sites',async()=>{listServiceLocations.mockImplementation((req,res,next)=>next(new Error('Unavailable')));const res=response(),next=vi.fn();await getMobileClinicalContext(request({query:{clientId:20,clinicalSessionId:10}}),res,next);expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0]).toMatchObject({locationChoices:[],locationChoicesUnavailable:true,client:{id:20}});});
 it('shows secure setup requirements with no authorized portal recipients and does not create a thread',async()=>{ClientGuardian.listForClient.mockResolvedValue([]);clientSecureAudience.mockResolvedValue({userIds:[1]});const res=response(),next=vi.fn();await getMobileClientSummary(request({params:{clientId:20}}),res,next);expect(next).not.toHaveBeenCalled();expect(res.json.mock.calls[0][0]).toMatchObject({contacts:[],secureMessaging:{available:false}});expect(ensureClientSecureConversation).not.toHaveBeenCalled();});
});

describe('mobile secure message and pending portal invitation',()=>{
 const body={recipientKey:'guardian:11',channel:'secure',text:'SYNTHETIC PRIVATE MESSAGE',invite:true,requestKey:'synthetic-request-000001'};
 function pending(){requireNarrivaClient.mockResolvedValue({...client,guardian_portal_enabled:1});ClientGuardian.listForClient.mockResolvedValue([{...guardian,role:'client_guardian',status:'PENDING_SETUP'}]);clientSecureAudience.mockResolvedValue({userIds:[1]});}
 it('offers explicit Send & invite without creating a conversation on selection',async()=>{
  pending();const res=response(),next=vi.fn();await getMobileClientSummary(request({params:{clientId:20}}),res,next);
  expect(res.json.mock.calls[0][0].contacts[0]).toMatchObject({secureInvitation:true,channels:{secure:true}});
  const open=response();await resolveMobileClientContact(request({params:{clientId:20},body}),open,next);
  expect(open.json).toHaveBeenCalledWith({requiresInvitation:true,recipientKey:'guardian:11'});expect(ensureClientSecureConversation).not.toHaveBeenCalled();expect(sendSecureMessageNotification).not.toHaveBeenCalled();
 });
 it('requires the explicit invitation action and current clinical permission',async()=>{
  pending();let next=vi.fn();await sendMobileClientContact(request({params:{clientId:20},body:{...body,invite:false}}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:400}));
  clinicalAccess.mockResolvedValue({reviewRequired:true,scopes:[]});next=vi.fn();await sendMobileClientContact(request({params:{clientId:20},body}),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(sendMessage).not.toHaveBeenCalled();expect(sendSecureMessageNotification).not.toHaveBeenCalled();
 });
 it('uses encrypted chat send and returns queued delivery without a claim token; retry never resends',async()=>{
  pending();let saved=null;
  pool.execute.mockImplementation(async(sql,params)=>{
   if(sql.startsWith('SELECT id FROM mobile_secure'))return [saved?[saved]:[]];
   if(sql.startsWith('INSERT IGNORE INTO mobile_secure')){const fresh=!saved;saved ||= {id:9,content_hash:params[5],delivery_status:'pending'};return [{affectedRows:fresh?1:0}];}
   if(sql.startsWith('SELECT * FROM mobile_secure'))return [[saved]];
   return [{affectedRows:1}];
  });
  sendMessage.mockImplementation(async(req,res)=>{expect(req.mobileSecureDelivery).toEqual({id:9});expect(req.body).toEqual({body:body.text,method:'secure',clientId:20});saved={...saved,message_id:90,thread_id:88};res.status(201).json({id:90});});
  sendSecureMessageNotification.mockResolvedValue({sent:false,deliveryStatus:'queued',claimUrl:'SECRET-CLAIM',tokenShownOnce:'SECRET-TOKEN'});
  const res=response(),next=vi.fn();await sendMobileClientContact(request({params:{clientId:20},body}),res,next);expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith({ok:true,threadId:88,messageId:90,deliveryStatus:'queued'});expect(JSON.stringify(res.json.mock.calls)).not.toContain('SECRET');
  saved.delivery_status='queued';await sendMobileClientContact(request({params:{clientId:20},body}),response(),next);
  expect(sendMessage).toHaveBeenCalledOnce();expect(sendSecureMessageNotification).toHaveBeenCalledOnce();
 });
});

it('blocks a mobile Narriva attach until current source has server generation evidence, including encounter scope',async()=>{
 const previous=process.env.JWT_SECRET;process.env.JWT_SECRET='synthetic-mobile-generation-secret';
 try{const draft={id:61,user_id:1,agency_id:4,client_id:20,clinical_session_id:10,office_event_id:null,service_code:'H2011',input_text:'Synthetic session narrative.'};ClinicalNoteDraft.findByIdForUser.mockResolvedValue(draft);
 const handler=vi.fn((req,res)=>res.json({ok:true})),next=vi.fn();const req=request({params:{sessionId:'10'},body:{clientId:20,metadata:{draftId:61,writerMode:'narriva'}},user:{id:1},mobileClinical:{verified:true,agencyId:4,userId:1}});
 const wrapped=scopedMobileClinicalHandler(handler,{sessionParam:'sessionId',requireClient:true,requireGeneratedNote:true});await wrapped(req,response(),next);expect(handler).not.toHaveBeenCalled();expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));
 req.body.metadata.generationReceipt=issueNarrivaGenerationReceipt({userId:1,agencyId:4,clientId:20,clinicalSessionId:10,inputText:draft.input_text,serviceCode:'H2011',writerMode:'narriva'});next.mockClear();await wrapped(req,response(),next);expect(handler).toHaveBeenCalledTimes(1);
 draft.input_text+=' Changed source.';handler.mockClear();await wrapped(req,response(),next);expect(handler).not.toHaveBeenCalled();expect(next).toHaveBeenLastCalledWith(expect.objectContaining({status:409}));
 draft.input_text='Synthetic session narrative.';draft.clinical_session_id=11;await wrapped(req,response(),next);expect(handler).not.toHaveBeenCalled();
 }finally{if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous;}
});

import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../safetyPlans/notificationQueue.js',()=>({queueClinicalFormNotification:vi.fn().mockResolvedValue(undefined)}));
vi.mock('../../models/AgencyOfficeIntakeMaster.model.js',()=>({default:{findByAgencyLanguage:vi.fn().mockResolvedValue(null)}}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn(),getConnection:vi.fn()}}));
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{getAgencies:vi.fn()}}));
vi.mock('../clientRecordAccess.service.js',()=>({resolveClientRecordAccess:vi.fn()}));
vi.mock('../staffCareEligibility.service.js',()=>({requireStaffCareEligibility:vi.fn()}));
vi.mock('../../utils/supervisorSchoolAccess.js',()=>({supervisorCanAccessClientInOrg:vi.fn()}));
vi.mock('../guardianClinicalAccess.service.js',()=>({requireClinicalScope:vi.fn()}));
import db from '../../config/clinicalDatabase.js';
import main from '../../config/database.js';
import User from '../../models/User.model.js';
import {resolveClientRecordAccess} from '../clientRecordAccess.service.js';
import {requireStaffCareEligibility} from '../staffCareEligibility.service.js';
import {requireClinicalScope} from '../guardianClinicalAccess.service.js';
import {maybeDecryptNotePayload} from '../clinicalNoteCrypto.service.js';
import {normalizeSafetyPlan,signatureEvidence} from '../safetyPlans/template.js';
import * as records from '../safetyPlans/records.js';
import {queueClinicalFormNotification} from '../safetyPlans/notificationQueue.js';
const staff={id:7,role:'provider',first_name:'Synthetic',last_name:'Clinician'};
const guardian={id:20,role:'client_guardian'},clientUser={id:21,role:'client'};
const client={id:41,agency_id:2,full_name:'Synthetic Client'};
const data=()=>({personLabel:'Synthetic Client',planDate:'2026-10-11',thoughts:'Synthetic warning',coping:'Synthetic coping',selfCare:'Routine',safePlaces:'Safe location',unsafeItems:'Secured by caregiver',medications:'Caregiver manages access',safetyResponsibility:'Caregiver today',familyNotification:'Contact caregiver as agreed',reviewPlan:'Review at next appointment',copyProvided:'Client portal',supports:[{name:'Synthetic adult',phone:'555-0100'}],professionals:[{name:'988 Lifeline',phone:'988'}]});
const input=()=>({agencyId:2,clientId:41,data:data()});
const signature=()=>({name:'Synthetic Signer',consent:true,signature:'data:image/png;base64,'+Buffer.from('89504e470d0a1a0a0000000000000000000000000000000000000000','hex').toString('base64')});
let state,backup,failSnapshot;
function rows(value){return [value];}
async function execute(sql,p=[]){
 if(sql.startsWith('SELECT * FROM clinical_form_records WHERE id'))return rows(state.plans.filter(r=>r.id===Number(p[0])));
 if(sql.includes('AND created_by_user_id=? AND client_id IS NULL'))return rows(state.plans.filter(r=>r.agency_id===Number(p[0])&&r.created_by_user_id===p[1]&&!r.client_id));
 if(sql.startsWith('SELECT * FROM clinical_form_records WHERE agency'))return rows(state.plans.filter(r=>r.agency_id===Number(p[0])&&(sql.includes('AND client_id=?')?r.client_id===Number(p[1]):r.created_by_user_id===p[1]||(!r.client_id&&p[2]===1))));
 if(sql.startsWith('INSERT INTO clinical_form_records(')){const id=state.plans.length+1;state.plans.push({id,agency_id:p[0],client_id:p[1],created_by_user_id:p[2],document_key:p[3],current_version:1});return [{insertId:id}];}
 if(sql.startsWith('UPDATE clinical_form_records SET current_version')){state.plans.find(r=>r.id===p[1]).current_version=p[0];return [{affectedRows:1}];}
 if(sql.startsWith('UPDATE clinical_form_records SET client_id')){Object.assign(state.plans.find(r=>r.id===p[2]),{client_id:p[0],current_version:p[1]});return [{affectedRows:1}];}
 if(sql.startsWith('INSERT INTO clinical_form_versions')){if(failSnapshot)throw Error('Storage failure');state.versions.push({plan_id:p[0],version:p[1],payload_encrypted:p[2],content_hash:p[3],created_by_user_id:p[4]});return [{affectedRows:1}];}
 if(sql.startsWith('SELECT * FROM clinical_form_versions'))return rows(state.versions.filter(r=>r.plan_id===p[0]&&r.version===p[1]));
 if(sql.startsWith('SELECT version,created_by'))return rows(state.versions.filter(r=>r.plan_id===p[0]).map(({version,created_by_user_id})=>({version,created_by_user_id})));
 if(sql.startsWith('INSERT INTO clinical_form_events')){state.events.push(p);return [{affectedRows:1}];}
 if(sql.startsWith('INSERT INTO clinical_form_signers')){const id=state.signers.length+1;state.signers.push({id,plan_id:p[0],version:p[1],signer_kind:p[2],recipient_user_id:p[3],details_encrypted:p[4],portal_shared_at:p[5],revoked_at:null,signed_at:null});return [{insertId:id}];}
 if(sql.startsWith('SELECT * FROM clinical_form_signers WHERE plan_id'))return rows(state.signers.filter(r=>r.plan_id===p[0]&&r.version===p[1]&&(!sql.includes('signer_kind=?')||(r.signer_kind===p[2]&&!r.revoked_at))));
 if(sql.startsWith('SELECT * FROM clinical_form_signers WHERE id'))return rows(state.signers.filter(r=>r.id===p[0]&&(sql.includes('recipient_user_id=?')?r.recipient_user_id===p[1]&&r.portal_shared_at&&!r.revoked_at:r.plan_id===p[1]&&r.version===p[2])));
 if(sql.startsWith('UPDATE clinical_form_signers SET signature')){Object.assign(state.signers.find(r=>r.id===p[3]),{signature_encrypted:p[0],actor_user_id:p[1],signing_method:p[2],signed_at:'2026-10-11T15:00:00Z'});return [{affectedRows:1}];}
 if(sql.startsWith('UPDATE clinical_form_signers SET revoked')){const r=state.signers.find(r=>r.id===p[0]&&r.plan_id===p[1]&&r.version===p[2]&&!r.revoked_at);if(r)r.revoked_at='now';return [{affectedRows:r?1:0}];}
 if(sql.startsWith('SELECT s.id,s.plan_id'))return rows(state.signers.filter(r=>r.recipient_user_id===p[0]&&r.portal_shared_at&&!r.revoked_at).map(r=>({...r,...state.plans.find(p=>p.id===r.plan_id),id:r.id})).filter(r=>r.client_id===p[1]));
 throw Error('Unhandled SQL: '+sql);
}
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,3).toString('base64'));state={plans:[],versions:[],events:[],signers:[]};failSnapshot=false;
 db.execute.mockImplementation(execute);db.getConnection.mockResolvedValue({execute,beginTransaction:async()=>{backup=structuredClone(state);},commit:async()=>{},rollback:async()=>{state=backup;},release:()=>{}});
 User.getAgencies.mockResolvedValue([{id:2}]);requireStaffCareEligibility.mockResolvedValue({});requireClinicalScope.mockResolvedValue({});resolveClientRecordAccess.mockResolvedValue({ok:true,isAssignedClinician:true,client});
 main.execute.mockImplementation(async(sql,p)=>{
  if(sql.includes('FROM agencies'))return [[{id:2,name:'ITSCO',slug:'itsco',logo_path:'logos/itsco.png',color_palette:'{"primary":"#175b48"}'}]];
  if(sql.includes('SELECT guardian_user_id'))return [[{id:20,relationship_type:'parent'},{id:21,relationship_type:'self'}]];
  if(sql.includes('cg.relationship_type'))return [[{relationship_type:p[1]===21?'self':'parent',first_name:'Synthetic',last_name:p[1]===21?'Client':'Guardian'}]];
  throw Error('Unexpected main SQL');
 });
});
describe('safety-plan access and storage',()=>{
 it('defaults to the authorized client agency and retains branded encrypted versions',async()=>{const p=await records.savePlan(staff,input());expect(p.clientId).toBe(41);expect(p.branding).toMatchObject({name:'ITSCO',font:'Comfortaa'});expect(state.versions[0].payload_encrypted).not.toContain('Synthetic');expect(JSON.parse(state.versions[0].payload_encrypted)._enc).toBe(true);});
 it('rejects absent clients unless the author explicitly records the override',async()=>{for(const extra of [{},{allowUnlinked:true},{allowUnlinked:true,overrideReason:'Awaiting import',data:{...data(),personLabel:''}}])await expect(records.savePlan(staff,{agencyId:2,data:data(),...extra})).rejects.toMatchObject({status:400});expect(state.plans).toHaveLength(0);});
 it('keeps unlinked drafts private, permits authorized admins, and links only within the agency',async()=>{const p=await records.savePlan(staff,{agencyId:2,allowUnlinked:true,overrideReason:'Awaiting import',data:data()});await expect(records.readPlan({...staff,id:8},p.id)).rejects.toMatchObject({status:403});await expect(records.readPlan({...staff,id:8,role:'admin'},p.id)).resolves.toMatchObject({clientId:null});await expect(records.linkPlan(staff,p.id,{version:1,clientId:41})).rejects.toMatchObject({status:400});resolveClientRecordAccess.mockResolvedValueOnce({ok:true,isAssignedClinician:true,client:{...client,agency_id:6}});await expect(records.linkPlan(staff,p.id,{version:1,clientId:41,confirmIdentity:true})).rejects.toMatchObject({status:403});const linked=await records.linkPlan(staff,p.id,{version:1,clientId:41,confirmIdentity:true});expect(linked).toMatchObject({clientId:41,version:2,unlinked:null});expect(JSON.parse(maybeDecryptNotePayload(state.versions[0].payload_encrypted)).unlinked.reason).toBe('Awaiting import');});
 it('rejects cross-organization creation and unknown clinical roles',async()=>{await expect(records.savePlan(staff,{...input(),agencyId:6})).rejects.toMatchObject({status:403});for(const role of ['school_staff','client_guardian','support','staff'])await expect(records.savePlan({...staff,role},input())).rejects.toMatchObject({status:403});});
 it('requires assignment and active care eligibility for writes',async()=>{resolveClientRecordAccess.mockResolvedValueOnce({ok:true,isAssignedClinician:false,client});await expect(records.savePlan(staff,input())).rejects.toMatchObject({status:403});requireStaffCareEligibility.mockRejectedValueOnce(Object.assign(Error('inactive'),{status:403}));await expect(records.savePlan(staff,input())).rejects.toMatchObject({status:403});});
 it('blocks impersonation and cross-tenant unlinked access',async()=>{await expect(records.savePlan({...staff,switchedFromUserId:1},input())).rejects.toMatchObject({status:403});User.getAgencies.mockResolvedValue([]);await expect(records.savePlan(staff,{agencyId:2,data:data(),allowUnlinked:true,overrideReason:'Import pending'})).rejects.toMatchObject({status:403});});
 it('rolls back a failed snapshot and refuses to write without encryption',async()=>{failSnapshot=true;await expect(records.savePlan(staff,input())).rejects.toThrow();expect(state.plans).toHaveLength(0);failSnapshot=false;vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64','');await expect(records.savePlan(staff,input())).rejects.toThrow();expect(state.plans).toHaveLength(0);});
 it('does not overwrite versions or accept stale concurrent edits',async()=>{await records.savePlan(staff,input());const original=state.versions[0].payload_encrypted;const next=await records.savePlan(staff,{...input(),version:1,data:{...data(),coping:'Revised coping'}},1);expect(next.version).toBe(2);expect(state.versions[0].payload_encrypted).toBe(original);await expect(records.savePlan(staff,{...input(),version:1},1)).rejects.toMatchObject({status:409});expect((await records.readPlan(staff,1,1)).data.coping).toBe('Synthetic coping');});
 it('never allows silently changing an existing client link',async()=>{await records.savePlan(staff,input());await expect(records.savePlan(staff,{...input(),clientId:42,version:1},1)).rejects.toMatchObject({status:400});});
 it('omits linked plans when their author loses client access',async()=>{await records.savePlan(staff,input());resolveClientRecordAccess.mockResolvedValue({ok:false,status:403});expect((await records.listPlans(staff,{agencyId:2})).plans).toEqual([]);});
});
describe('version-bound signatures and portal sharing',()=>{
 const share=async(kind='guardian',userId=20)=>{await records.savePlan(staff,input());return records.addSigner(staff,1,{version:1,kind,userId,authorityConfirmed:true});};
 it('requires complete plan areas before requesting signatures',async()=>{await records.savePlan(staff,{...input(),data:{personLabel:'Synthetic'}});await expect(records.addSigner(staff,1,{version:1,kind:'client',name:'Synthetic'})).rejects.toMatchObject({status:400});});
 it('requires a linked client and a current disclosure grant for portal sharing',async()=>{await records.savePlan(staff,{agencyId:2,data:data(),allowUnlinked:true,overrideReason:'Import'});await expect(records.addSigner(staff,1,{version:1,kind:'guardian',userId:20})).rejects.toMatchObject({status:400});await records.linkPlan(staff,1,{version:1,clientId:41,confirmIdentity:true});requireClinicalScope.mockRejectedValue(Object.assign(Error('grant denied'),{status:403}));await expect(records.addSigner(staff,1,{version:2,kind:'guardian',userId:20})).rejects.toMatchObject({status:403});});
 it('isolates recipients and blocks revoked clinical permissions on reads and signatures',async()=>{await share();await expect(records.portalRead({...guardian,id:99},1)).rejects.toMatchObject({status:404});const plan=await records.portalRead(guardian,1);requireClinicalScope.mockRejectedValue(Object.assign(Error('revoked'),{status:403}));await expect(records.portalRead(guardian,1)).rejects.toMatchObject({status:403});await expect(records.signPlan(guardian,1,1,{...signature(),version:1,contentHash:plan.contentHash},{portal:true})).rejects.toMatchObject({status:403});});
 it('supports separate client, guardian and staff signatures on the same hash',async()=>{let plan=await share();plan=await records.addSigner(staff,1,{version:1,kind:'client',userId:21});plan=await records.addSigner(staff,1,{version:1,kind:'clinician',name:'Synthetic Clinician'});for(const [user,id,portal] of [[guardian,1,true],[clientUser,2,true],[staff,3,false]])await records.signPlan(user,1,id,{...signature(),version:1,contentHash:plan.contentHash},{portal});expect(state.signers.every(s=>s.signed_at)).toBe(true);expect(state.signers.map(s=>JSON.parse(maybeDecryptNotePayload(s.signature_encrypted)).contentHash)).toEqual(Array(3).fill(plan.contentHash));});
 it('requires a live witness for an in-person client signature',async()=>{await records.savePlan(staff,input());const plan=await records.addSigner(staff,1,{version:1,kind:'client',name:'Synthetic Client'});const signed={...signature(),version:1,contentHash:plan.contentHash};await expect(records.signPlan(staff,1,1,signed)).rejects.toMatchObject({status:400});await records.signPlan(staff,1,1,{...signed,witnessConfirmed:true});expect(state.signers[0].signing_method).toBe('in_person');expect(JSON.parse(maybeDecryptNotePayload(state.signers[0].signature_encrypted)).witnessUserId).toBe(7);});
 it('requires guardian authority for a named in-person signer',async()=>{await records.savePlan(staff,input());await expect(records.addSigner(staff,1,{version:1,kind:'guardian',name:'Synthetic Guardian'})).rejects.toMatchObject({status:400});await expect(records.addSigner(staff,1,{version:1,kind:'guardian',name:'Synthetic Guardian',authorityConfirmed:true})).resolves.toBeTruthy();});
 it('rejects stale content, duplicate signatures, and another clinician’s account',async()=>{const plan=await share();await expect(records.signPlan(guardian,1,1,{...signature(),version:1,contentHash:'wrong'},{portal:true})).rejects.toMatchObject({status:409});await records.signPlan(guardian,1,1,{...signature(),version:1,contentHash:plan.contentHash},{portal:true});await expect(records.signPlan(guardian,1,1,{...signature(),version:1,contentHash:plan.contentHash},{portal:true})).rejects.toMatchObject({status:409});await expect(records.addSigner(staff,1,{version:1,kind:'clinician',userId:8,name:'Other'})).rejects.toMatchObject({status:403});});
 it('retains signed old copies while preventing signatures on a superseded version',async()=>{const plan=await share();await records.signPlan(guardian,1,1,{...signature(),version:1,contentHash:plan.contentHash},{portal:true});const original=state.signers[0].signature_encrypted;await records.savePlan(staff,{...input(),version:1},1);expect((await records.readPlan(staff,1)).signers).toEqual([]);expect((await records.portalRead(guardian,1)).version).toBe(1);expect(state.signers[0].signature_encrypted).toBe(original);await expect(records.signPlan(guardian,1,1,{...signature(),version:1,contentHash:plan.contentHash},{portal:true})).rejects.toMatchObject({status:409});});
 it('withdraws portal access without deleting recorded signatures',async()=>{const plan=await share();await records.signPlan(guardian,1,1,{...signature(),version:1,contentHash:plan.contentHash},{portal:true});await records.revokeSigner(staff,1,1,{version:1});await expect(records.portalRead(guardian,1)).rejects.toMatchObject({status:404});expect(state.signers[0].signature_encrypted).toBeTruthy();});
 it('does not disclose the private override reason or clinical history to recipients',async()=>{await share();const p=await records.portalRead(guardian,1);expect(p).not.toHaveProperty('unlinked');expect(p).not.toHaveProperty('history');});
});
describe('input validation',()=>{
 it('rejects overlong content, invalid dates and contact floods',()=>{for(const value of [{coping:'a'.repeat(6001)},{planDate:'2026-02-31'},{supports:Array(13).fill({})}])expect(()=>normalizeSafetyPlan(value)).toThrow();});
 it('drops unrecognized fields and requires explicit signature consent and PNG',()=>{expect(normalizeSafetyPlan({...data(),score:100})).not.toHaveProperty('score');expect(()=>signatureEvidence({...signature(),consent:false})).toThrow();expect(()=>signatureEvidence({...signature(),signature:'data:image/svg+xml;base64,abc'})).toThrow();});
});

describe('reusable clinical forms',()=>{
 const roiData=()=>({personLabel:'Synthetic Client',planDate:'2026-10-11',recipientName:'Synthetic clinic',recipientPhone:'555-0101',purpose:'Coordinate care',direction:['Discuss information with the named recipient'],information:['Summary of sessions and treatment'],expirationDate:'2027-10-11'});
 const roiInput=()=>({...input(),documentKey:'release-of-information',data:roiData()});
 const attendanceInput=()=>({...input(),documentKey:'attendance-verification',data:{personLabel:'Synthetic Client',planDate:'2026-10-11',appointmentDate:'2026-10-10',startTime:'10:00',endTime:'10:50',timezone:'America/Denver',location:'Virtual visit',issuerName:'Synthetic Provider',issuerTitle:'Facilitator',attendanceStatus:'Confirmed attended',excuseRequested:'Yes'}});
 it('uses clinical-document disclosure scope for ROI and keeps types immutable',async()=>{const p=await records.savePlan(staff,roiInput());expect(p.template.title).toBe('Release of information');await records.addSigner(staff,p.id,{version:1,kind:'guardian',userId:20,authorityConfirmed:true});expect(requireClinicalScope).toHaveBeenLastCalledWith(expect.objectContaining({scope:'clinical_documents'}));await expect(records.savePlan(staff,{...roiInput(),version:1,documentKey:'safety-plan'},p.id)).rejects.toMatchObject({status:400});});
 it('requires exact recipient, purpose, scope, and expiration before an ROI can be signed',async()=>{const p=await records.savePlan(staff,{...roiInput(),data:{...roiData(),recipientName:''}});await expect(records.addSigner(staff,p.id,{version:1,kind:'client',userId:21})).rejects.toMatchObject({status:400});});
 it('preserves an original signed authorization when revoked and blocks further signing/editing',async()=>{let p=await records.savePlan(staff,roiInput());p=await records.addSigner(staff,p.id,{version:1,kind:'client',userId:21});await records.signPlan(clientUser,p.id,1,{...signature(),version:1,contentHash:p.contentHash},{portal:true});const original=state.versions[0].payload_encrypted;const revoked=await records.revokeAuthorization(clientUser,p.id,{version:1,reason:'Please stop future sharing.',confirm:true},{portalShareId:1});expect(revoked.revocation.reason).toBe('Please stop future sharing.');expect(state.versions[0].payload_encrypted).toBe(original);await expect(records.savePlan(staff,{...roiInput(),version:2},p.id)).rejects.toMatchObject({status:409});expect((await records.readPlan(staff,p.id,1)).revocation).toBeTruthy();});
 it('cannot revoke another recipient’s authorization or a different type of form',async()=>{await records.savePlan(staff,roiInput());await records.addSigner(staff,1,{version:1,kind:'client',userId:21});await expect(records.revokeAuthorization({...clientUser,id:99},1,{version:1,reason:'Cancel',confirm:true},{portalShareId:1})).rejects.toMatchObject({status:404});await records.savePlan(staff,input());await expect(records.revokeAuthorization(staff,2,{version:1,reason:'Cancel',confirm:true})).rejects.toMatchObject({status:400});});
 it('requires verified attendance and staff signature before sharing an attendance letter',async()=>{const p=await records.savePlan(staff,attendanceInput());await expect(records.addSigner(staff,p.id,{version:1,kind:'client',userId:21,copyOnly:true})).rejects.toMatchObject({status:400});const staffPlan=await records.addSigner(staff,p.id,{version:1,kind:'clinician',name:'Synthetic'});await records.signPlan(staff,p.id,1,{...signature(),version:1,contentHash:staffPlan.contentHash});await records.addSigner(staff,p.id,{version:1,kind:'client',userId:21,copyOnly:true});const copy=await records.portalRead(clientUser,2);expect(copy.signers.find(s=>s.id===2).copyOnly).toBe(true);await expect(records.signPlan(clientUser,p.id,2,{...signature(),version:1,contentHash:copy.contentHash},{portal:true})).rejects.toMatchObject({status:400});expect(state.signers[0].signature_encrypted).not.toContain('Synthetic');});
 it('cannot issue letters for unconfirmed attendance or future appointments',async()=>{for(const patch of [{attendanceStatus:'Not yet confirmed'},{appointmentDate:'2099-01-01'}]){const p=await records.savePlan(staff,{...attendanceInput(),data:{...attendanceInput().data,...patch}});await expect(records.addSigner(staff,p.id,{version:1,kind:'clinician',name:'Synthetic'})).rejects.toMatchObject({status:400});}});
 it('does not include clinical notes, diagnoses, or arbitrary extra data in an attendance letter',async()=>{const p=await records.savePlan(staff,{...attendanceInput(),data:{...attendanceInput().data,diagnosis:'Private',clinicalNotes:'Private'}});expect(p.data).not.toHaveProperty('diagnosis');expect(p.data).not.toHaveProperty('clinicalNotes');});
 it('supports new organizations without hardcoded company names',async()=>{main.execute.mockImplementation(async(sql)=>sql.includes('FROM agencies')?[[{id:2,name:'New Agency',slug:'new-agency',color_palette:{primary:'#334455'}}]]:[[]]);const p=await records.savePlan(staff,roiInput());expect(p.branding.name).toBe('New Agency');expect(p.branding.font).toBe('Montserrat');expect(JSON.stringify(p.template)).not.toContain('ITSCO');});
});

describe('information updates awaiting review',()=>{
 const createUpdate=async()=>{const p=await records.savePlan(staff,{...input(),documentKey:'client-information-update',data:{personLabel:'Synthetic Client',planDate:'2026-10-11'}});return records.addSigner(staff,p.id,{version:1,kind:'client',userId:21});};
 it('accepts a portal response as a new signed version without mutating the original or updating demographics',async()=>{const p=await createUpdate(),original=state.versions[0].payload_encrypted;await records.portalSubmitUpdate(clientUser,1,{...signature(),version:1,contentHash:p.contentHash,data:{...p.data,phone_number:'555-0102'}});const current=await records.readPlan(staff,p.id);expect(current).toMatchObject({version:2,reviewStatus:'pending'});expect(current.data.phone_number).toBe('555-0102');expect(current.signers[0].signedAt).toBeTruthy();expect(state.versions[0].payload_encrypted).toBe(original);expect(main.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);expect(current.signers[0].evidence.contentHash).toBe(current.contentHash);});
 it('rejects a stale submission and a different recipient',async()=>{const p=await createUpdate();const request={...signature(),version:1,contentHash:p.contentHash,data:p.data};await expect(records.portalSubmitUpdate({...clientUser,id:99},1,request)).rejects.toMatchObject({status:404});await records.portalSubmitUpdate(clientUser,1,request);await expect(records.portalSubmitUpdate(clientUser,1,request)).rejects.toMatchObject({status:409});});
 it('does not submit changes through a withdrawn request or without consent',async()=>{const p=await createUpdate();await expect(records.portalSubmitUpdate(clientUser,1,{...signature(),consent:false,version:1,contentHash:p.contentHash,data:p.data})).rejects.toMatchObject({status:400});expect(state.versions).toHaveLength(1);await records.revokeSigner(staff,p.id,1,{version:1});await expect(records.portalSubmitUpdate(clientUser,1,{...signature(),version:1,contentHash:p.contentHash,data:p.data})).rejects.toMatchObject({status:404});});
 it('records staff review separately and preserves the signed response',async()=>{const p=await createUpdate();await records.portalSubmitUpdate(clientUser,1,{...signature(),version:1,contentHash:p.contentHash,data:p.data});await expect(records.reviewUpdate(staff,p.id,{version:2})).rejects.toMatchObject({status:400});const reviewed=await records.reviewUpdate(staff,p.id,{version:2,reviewed:true});expect(reviewed.reviewStatus).toBe('reviewed');expect((await records.readPlan(staff,p.id,2)).signers[0].signedAt).toBeTruthy();expect(main.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);});
});


describe('standalone C-SSRS records',()=>{
 const screen=()=>({personLabel:'Synthetic individual',planDate:'2026-10-14',cssrs_1:'no',cssrs_2:'no',cssrs_6:'no',administeredBy:'Synthetic provider',followUp:'Synthetic clinical review and follow-up.',fitConfirmed:'yes',screenStatus:'completed'});
 const unlinked=(data=screen())=>({agencyId:2,documentKey:'cssrs-screener',allowUnlinked:true,overrideReason:'Client import pending',data});
 it('saves an encrypted unlinked screening, reopens it and links its unchanged responses later',async()=>{
  const saved=await records.savePlan(staff,unlinked());
  expect(saved).toMatchObject({documentKey:'cssrs-screener',clientId:null,data:{screenStatus:'completed',cssrs_1:'no'}});
  expect(state.versions[0].payload_encrypted).not.toContain('Synthetic individual');
  await expect(records.readPlan({...staff,id:8},saved.id)).rejects.toMatchObject({status:403});
  const linked=await records.linkPlan(staff,saved.id,{version:1,clientId:41,confirmIdentity:true});
  expect(linked.clientId).toBe(41);expect(linked.data).toEqual(saved.data);
 });
 it('keeps incomplete screens as drafts and requires every applicable answer and clinical review for completion',async()=>{
  await expect(records.savePlan(staff,unlinked({personLabel:'Synthetic',screenStatus:'draft'}))).resolves.toMatchObject({data:{screenStatus:'draft'}});
  for(const patch of [{cssrs_2:'yes'},{cssrs_6:'yes'},{cssrs_1:''},{followUp:''},{fitConfirmed:''},{cssrs_1:'maybe'}])await expect(records.savePlan(staff,unlinked({...screen(),...patch}))).rejects.toMatchObject({status:400});
  const saved=await records.savePlan(staff,unlinked({...screen(),cssrs_2:'yes',cssrs_3:'no',cssrs_4:'no',cssrs_5:'no',cssrs_6:'yes',cssrs_6_recent:'no'}));expect(saved.data.screenStatus).toBe('completed');
 });
 it('removes stale hidden answers without treating unanswered questions as No',async()=>{
  const saved=await records.savePlan(staff,unlinked({...screen(),cssrs_3:'yes',cssrs_4:'yes',cssrs_5:'yes',cssrs_6_recent:'yes'}));
  expect(saved.data).toMatchObject({cssrs_3:'',cssrs_4:'',cssrs_5:'',cssrs_6_recent:''});
  const draft=await records.savePlan(staff,unlinked({personLabel:'Synthetic'}));expect(draft.data.cssrs_1).toBe('');
 });
 it('My files only lists the current author’s unlinked records even for an admin',async()=>{
  const saved=await records.savePlan(staff,unlinked());
  await records.savePlan({...staff,id:8},unlinked());
  await records.savePlan(staff,{...unlinked(),clientId:41});
  expect((await records.listPlans({...staff,role:'admin'},{agencyId:2,mine:'1'})).plans.map(p=>p.id)).toEqual([saved.id]);
 });
});


describe('named forms and client completion permissions',()=>{
 it('retains a custom name in encrypted content, lists and historical versions',async()=>{
  const saved=await records.savePlan(staff,{...input(),data:{...data(),documentName:'Fall support plan'}});
  expect(saved.data.documentName).toBe('Fall support plan');expect(state.versions[0].payload_encrypted).not.toContain('Fall support plan');
  expect((await records.listPlans(staff,{agencyId:2})).plans[0].documentName).toBe('Fall support plan');
  await records.savePlan(staff,{...input(),version:1,data:{...data(),documentName:'Revised support plan'}},saved.id);
  expect((await records.readPlan(staff,saved.id,1)).data.documentName).toBe('Fall support plan');
 });
 it('lets an authorized recipient complete a partial plan and submit a signed version for staff review',async()=>{
  const saved=await records.savePlan(staff,{...input(),data:{personLabel:'Synthetic Client',planDate:'2026-10-17'}});
  const shared=await records.addSigner(staff,saved.id,{version:1,kind:'guardian',userId:20,authorityConfirmed:true,allowCompletion:true});
  expect(shared.signers[0].allowCompletion).toBe(true);expect(queueClinicalFormNotification).toHaveBeenCalledWith(expect.anything(),2,20);
  await records.portalSubmitUpdate(guardian,1,{...signature(),version:1,contentHash:shared.contentHash,data:data()});
  const submitted=await records.readPlan(staff,saved.id);expect(submitted).toMatchObject({version:2,reviewStatus:'pending'});expect(submitted.signers[0].signedAt).toBeTruthy();
  const reviewed=await records.reviewUpdate(staff,saved.id,{version:2,reviewed:true});expect(reviewed.reviewStatus).toBe('reviewed');
  expect((await records.readPlan(staff,saved.id,1)).data.coping).toBe('');
 });
 it('rejects incomplete submissions and sign-only edits',async()=>{
  const saved=await records.savePlan(staff,input());const shared=await records.addSigner(staff,saved.id,{version:1,kind:'guardian',userId:20,authorityConfirmed:true});
  await expect(records.portalSubmitUpdate(guardian,1,{...signature(),version:1,contentHash:shared.contentHash,data:data()})).rejects.toMatchObject({status:400});
  await records.revokeSigner(staff,saved.id,1,{version:1});await records.addSigner(staff,saved.id,{version:1,kind:'guardian',userId:20,authorityConfirmed:true,allowCompletion:true});
  await expect(records.portalSubmitUpdate(guardian,2,{...signature(),version:1,contentHash:shared.contentHash,data:{personLabel:'Synthetic'}})).rejects.toMatchObject({status:400});expect(state.versions).toHaveLength(1);
 });
 it('keeps staff-administered assessments out of client completion and never queues in-person requests',async()=>{
  const saved=await records.savePlan(staff,{...input(),documentKey:'cssrs-screener',data:{personLabel:'Synthetic',planDate:'2026-10-17'}});
  await expect(records.addSigner(staff,saved.id,{version:1,kind:'guardian',userId:20,authorityConfirmed:true,allowCompletion:true})).rejects.toMatchObject({status:400});expect(queueClinicalFormNotification).not.toHaveBeenCalled();
  const plan=await records.savePlan(staff,input());await records.addSigner(staff,plan.id,{version:1,kind:'client',name:'Synthetic'});expect(queueClinicalFormNotification).not.toHaveBeenCalled();
 });
});

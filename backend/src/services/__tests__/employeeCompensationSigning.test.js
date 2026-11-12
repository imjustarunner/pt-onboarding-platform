import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),signed:vi.fn(),access:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../../models/SignedDocument.model.js',()=>({default:{findByTask:m.signed}}));
vi.mock('../../models/DocumentSignatureWorkflow.model.js',()=>({default:{}}));
vi.mock('../../models/DocumentTemplate.model.js',()=>({default:{}}));
vi.mock('../../models/UserSpecificDocument.model.js',()=>({default:{}}));
vi.mock('../../models/User.model.js',()=>({default:{}}));
vi.mock('../storage.service.js',()=>({default:{}}));
vi.mock('../agencyAccessProfiles.service.js',()=>({readAgencyAccess:m.access}));
import DocumentSigningService from '../documentSigning.service.js';

let task,generation,actor;
beforeEach(()=>{
 vi.clearAllMocks();
 task={id:20,reference_id:21,assigned_to_user_id:30,assigned_to_agency_id:453,metadata:{}};
 generation={id:22,agency_id:453,candidate_user_id:30,user_specific_document_id:21,rendered_html:'Reviewed synthetic compensation',token_values_json:{draftKind:'provider_update_compensation',createdVia:'employee_compensation_ui',releasedAt:'2026-11-12T21:00:00Z',employee:{userId:30},countersignerUserId:40}};
 actor={id:30,role:'staff',status:'ACTIVE_EMPLOYEE',is_active:1,is_archived:0,is_demo:1,
  signing_agency_id:453,signing_agency_slug:'nlu-qa-demo',signing_agency_active:1,signing_agency_archived:0,
  signing_agency_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6}}};
 m.execute.mockImplementation(async(sql)=>{
  if(sql.includes('FROM tasks t'))return [[task]];
  if(sql.includes('FROM contract_generations WHERE task_id='))return [generation?[generation]:[]];
  if(sql.includes('FROM user_specific_documents WHERE id='))return [[{id:21,user_id:30,task_id:20,template_type:'html',document_action_type:'signature',html_content:generation.rendered_html}]];
  if(sql.includes('FROM users u JOIN user_agencies'))return [actor?[actor]:[]];
  throw Error('Unexpected mutation or lookup before employment validation');
 });
 m.signed.mockResolvedValue({id:50,user_id:30,signed_pdf_path:'synthetic/signed.pdf'});
});
const portalSign=()=>DocumentSigningService.signTask({taskId:20,userId:30,signerName:'Synthetic QA employee',signatureData:'synthetic-only',context:'prehire_portal'});
describe('the portal signing service enforces the issued compensation employment boundary',()=>{
 it.each(['revoked membership','pending onboarding','non-staff identity','disabled agency'])('an owned portal token cannot sign after %s',async reason=>{
  if(reason==='revoked membership')actor=null;
  if(reason==='pending onboarding')actor.status='ONBOARDING';
  if(reason==='non-staff identity')actor.role='guardian';
  if(reason==='disabled agency')actor.signing_agency_active=0;
  await expect(portalSign()).rejects.toMatchObject({status:403});
  expect(m.signed).not.toHaveBeenCalled();
  expect(m.execute.mock.calls.some(([sql])=>/^(UPDATE|INSERT|DELETE)/.test(sql))).toBe(false);
 });
 it('allows the same finalized document for the original active employee without creating another signature',async()=>{
  await expect(portalSign()).resolves.toMatchObject({alreadyFinalized:true,signedDocument:{id:50}});
  expect(m.signed).toHaveBeenCalledOnce();expect(m.access).not.toHaveBeenCalled();
 });
 it('preserves the existing legacy portal signing behavior without adopting new compensation prerequisites',async()=>{
  generation=null;actor=null;
  await expect(portalSign()).resolves.toMatchObject({alreadyFinalized:true});
  expect(m.execute.mock.calls.some(([sql])=>sql.includes('FROM users u JOIN user_agencies'))).toBe(false);
 });
});

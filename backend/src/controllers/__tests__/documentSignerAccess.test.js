import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/Task.model.js',()=>({default:{findById:vi.fn(),findByUser:vi.fn(),markComplete:vi.fn()}}));
vi.mock('../../models/DocumentTemplate.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../../models/SignedDocument.model.js',()=>({default:{findByTask:vi.fn(),create:vi.fn()}}));
vi.mock('../../models/DocumentSignatureWorkflow.model.js',()=>({default:{recordIntent:vi.fn(),findBySignedDocument:vi.fn()}}));
vi.mock('../../services/documentSigning.service.js',()=>({default:{generateFinalizedPDF:vi.fn()}}));
vi.mock('../../models/UserDocument.model.js',()=>({default:{findByTask:vi.fn()}}));
vi.mock('../../models/UserSpecificDocument.model.js',()=>({default:{findByTask:vi.fn()}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:vi.fn(),getAgencies:vi.fn()}}));
vi.mock('../../services/agencyAccessProfiles.service.js',()=>({readAgencyAccess:vi.fn()}));
import Task from '../../models/Task.model.js';
import Signed from '../../models/SignedDocument.model.js';
import Workflow from '../../models/DocumentSignatureWorkflow.model.js';
import pool from '../../config/database.js';
import { giveConsent,recordIntent,signDocument,counterSignDocument,downloadSignedDocument,viewSignedDocument } from '../documentSigning.controller.js';
import {documentSignerAccess,requireAssignedDocumentSigner,requireValidPrimarySignature} from '../../utils/documentSignerAccess.js';
import {readAgencyAccess} from '../../services/agencyAccessProfiles.service.js';
import {requireEmployeeCompensationSignatureAccess} from '../../services/employeeCompensationSigning.service.js';
const task={id:2147,task_type:'document',assigned_to_user_id:567,metadata:{requiredCountersignerUserId:501}};
const supervisor={id:501,role:'super_admin'};
const signed={id:196,user_id:567,signed_pdf_path:'signed.pdf',audit_trail:{}};
let req,res,next;
beforeEach(()=>{vi.clearAllMocks();Task.findById.mockResolvedValue(task);Signed.findByTask.mockResolvedValue(signed);req={params:{taskId:'2147'},user:supervisor,body:{signatureData:'test-only'},get:()=>'',ip:'127.0.0.1',connection:{remoteAddress:'127.0.0.1'}};res={status:vi.fn().mockReturnThis(),json:vi.fn()};next=vi.fn();});
describe('assigned document signer boundaries',()=>{
 it.each([['consent',giveConsent],['intent',recordIntent],['signature',signDocument]])('blocks an administrator from the recipient %s endpoint before mutation',async(_name,handler)=>{
  await handler(req,res,next);
  expect(res.status.mock.calls[0]?.[0]||next.mock.calls[0]?.[0]?.status).toBe(403);
  expect(Signed.create).not.toHaveBeenCalled();expect(Workflow.recordIntent).not.toHaveBeenCalled();expect(pool.execute).not.toHaveBeenCalled();
 });
 it('allows the assigned signer to act only on their own signature record',()=>{
  expect(()=>requireAssignedDocumentSigner(task,{id:567},signed)).not.toThrow();
  expect(()=>requireAssignedDocumentSigner(task,{id:567},{...signed,user_id:501})).toThrow(/another signer/);
 });
 it('keeps pending documents waiting for the assigned signer',()=>{
  expect(documentSignerAccess(task,null,supervisor)).toMatchObject({signed:false,canSign:false,canCountersign:false});
  expect(documentSignerAccess(task,null,{id:567,role:'provider'}).canSign).toBe(true);
 });
 it('enables the designated countersigner only after the intended signer signs',()=>{
  expect(documentSignerAccess(task,signed,supervisor).canCountersign).toBe(true);
  expect(documentSignerAccess(task,signed,{id:502,role:'admin'}).canCountersign).toBe(false);
  expect(documentSignerAccess(task,{...signed,audit_trail:{adminCountersign:{signedAt:'2026-10-29'}}},supervisor).canCountersign).toBe(false);
 });
 it('rejects a recorded signature by the wrong person before countersigning',async()=>{
  Signed.findByTask.mockResolvedValue({...signed,user_id:501});await counterSignDocument(req,res,next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(pool.execute).not.toHaveBeenCalled();
 });
 it('cannot countersign your own primary signature',()=>{
  expect(()=>requireValidPrimarySignature({...task,assigned_to_user_id:501},{...signed,user_id:501},supervisor)).toThrow(/original signer/);
 });
 it.each([viewSignedDocument,downloadSignedDocument])('prevents a superseded copy from being served as the signed document',async handler=>{
  Task.findById.mockResolvedValue({...task,metadata:{signatureRequestSupersededAt:'2026-10-29',replacementTaskId:2148}});
  await handler(req,res,next);expect(res.status).toHaveBeenCalledWith(409);
 });
 it('disables all signature actions for superseded requests without deleting audit data',()=>{
  const old={...task,metadata:JSON.stringify({signatureRequestSupersededAt:'2026-10-29',replacementTaskId:2148})};
  expect(documentSignerAccess(old,signed,supervisor)).toMatchObject({superseded:true,replacementTaskId:2148,canSign:false,canCountersign:false});
  expect(()=>requireAssignedDocumentSigner(old,{id:567},signed)).toThrow(/superseded/);
 });
});

describe('issued employee compensation agreement signing',()=>{
 let compensationTask,generation,actor;
 beforeEach(()=>{
  compensationTask={...task,reference_id:800,assigned_to_agency_id:453,metadata:{source:'provider_update',amendmentMode:'compensation',generationId:400,requiredCountersignerUserId:501}};
  generation={id:400,agency_id:453,candidate_user_id:567,user_specific_document_id:800,rendered_html:'Reviewed synthetic compensation',token_values_json:{draftKind:'provider_update_compensation',createdVia:'employee_compensation_ui',releasedAt:'2026-11-12T21:00:00Z',employee:{userId:567},countersignerUserId:501}};
  actor={id:567,role:'staff',status:'ACTIVE_EMPLOYEE',is_active:1,is_archived:0,is_demo:1,terminated_at:null,
   signing_agency_id:453,signing_agency_slug:'nlu-qa-demo',signing_agency_active:1,signing_agency_archived:0,
   signing_agency_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:6}}};
  Task.findById.mockResolvedValue(compensationTask);
  pool.execute.mockImplementation(async(sql)=>{
   if(sql.includes('FROM contract_generations WHERE task_id='))return [generation?[generation]:[]];
   if(sql.includes('FROM user_specific_documents WHERE id='))return [[{id:800,user_id:567,task_id:task.id,template_type:'html',document_action_type:'signature',html_content:generation.rendered_html}]];
   if(sql.includes('FROM users u JOIN user_agencies'))return [actor?[actor]:[]];
   throw new Error('Unexpected signing-boundary SQL');
  });
  readAgencyAccess.mockResolvedValue({role:'admin',membership:true});
 });
 it.each([giveConsent,recordIntent,signDocument])('rejects an employee whose membership was revoked after issue before any signature mutation',async handler=>{
  req.user={id:567,role:'staff'};actor=null;
  await handler(req,res,next);
  expect(res.status.mock.calls[0]?.[0]||next.mock.calls[0]?.[0]?.status).toBe(403);
  expect(Signed.create).not.toHaveBeenCalled();expect(Workflow.recordIntent).not.toHaveBeenCalled();
  expect(pool.execute.mock.calls.some(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
 });
 it.each([
  ['pending onboarding',{status:'ONBOARDING'}],['inactive employee',{is_active:0}],['terminated employee',{terminated_at:'2026-11-12'}],
  ['archived employee',{is_archived:1}],['non-staff role',{role:'guardian'}],['assistant account',{is_assistant_account:1}],
  ['disabled organization',{signing_agency_active:0}],['archived organization',{signing_agency_archived:1}],
  ['unverified QA source',{signing_agency_flags:{qaSandbox:{syntheticOnly:true,program:'tutoring',sourceAgencyId:7}}}]
 ])('keeps %s from supplying a new employee signature',async(_reason,patch)=>{
  Object.assign(actor,patch);
  await expect(requireEmployeeCompensationSignatureAccess(compensationTask,{id:567,role:'staff'})).rejects.toMatchObject({status:403});
 });
 it('allows the original active employee without granting an employer countersignature',async()=>{
  await expect(requireEmployeeCompensationSignatureAccess(compensationTask,{id:567,role:'staff'})).resolves.toBe(true);
  expect(readAgencyAccess).not.toHaveBeenCalled();
  await expect(requireEmployeeCompensationSignatureAccess(compensationTask,{id:567,role:'admin'},{countersign:true})).rejects.toMatchObject({status:403});
 });
 it('blocks the designated administrator after their agency membership is revoked, before countersigning',async()=>{
  actor=null;await counterSignDocument(req,res,next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));
  expect(pool.execute.mock.calls.some(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
 });
 it.each([{role:'staff',membership:true},{role:'admin',membership:false},null])('requires current scoped employer access in addition to a global administrator role: %j',async access=>{
  actor={...actor,id:501,role:'admin'};readAgencyAccess.mockResolvedValue(access);
  await counterSignDocument(req,res,next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));
  expect(pool.execute.mock.calls.some(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
 });
 it('allows only the distinct designated active employer administrator',async()=>{
  actor={...actor,id:501,role:'admin'};
  await expect(requireEmployeeCompensationSignatureAccess(compensationTask,supervisor,{countersign:true})).resolves.toBe(true);
  expect(readAgencyAccess).toHaveBeenCalledWith(501,453,pool);
 });
 it('keeps the normal NLU organization available to its active real employees and designated administrator',async()=>{
  generation.agency_id=6;compensationTask.assigned_to_agency_id=6;
  actor={...actor,is_demo:0,signing_agency_id:6,signing_agency_slug:'nlu',signing_agency_flags:{}};
  await expect(requireEmployeeCompensationSignatureAccess(compensationTask,{id:567,role:'staff'})).resolves.toBe(true);
  actor={...actor,id:501,role:'admin'};
  await expect(requireEmployeeCompensationSignatureAccess(compensationTask,supervisor,{countersign:true})).resolves.toBe(true);
  expect(readAgencyAccess).toHaveBeenCalledWith(501,6,pool);
 });
 it('uses the issued generation instead of allowing task metadata to change the employee or countersigner',async()=>{
  const changed={...compensationTask,metadata:{},assigned_to_user_id:568};
  await expect(requireEmployeeCompensationSignatureAccess(changed,{id:568})).rejects.toMatchObject({status:403});
  await expect(requireEmployeeCompensationSignatureAccess({...compensationTask,metadata:{requiredCountersignerUserId:502}},{id:502,role:'admin'},{countersign:true})).rejects.toMatchObject({status:403});
  expect(pool.execute.mock.calls[0][1]).toEqual([task.id]);
 });
 it('rejects an issued task redirected to another document',async()=>{
  compensationTask.reference_id=801;
  await expect(requireEmployeeCompensationSignatureAccess(compensationTask,{id:567})).rejects.toMatchObject({status:403});
 });
 it.each(['html','owner','task','action'])('rejects a replaced issued document %s before signing',async changed=>{
  const original=pool.execute.getMockImplementation();
  pool.execute.mockImplementation(async(sql,...args)=>{
   if(!sql.includes('FROM user_specific_documents WHERE id='))return original(sql,...args);
   const document={id:800,user_id:567,task_id:task.id,template_type:'html',document_action_type:'signature',html_content:generation.rendered_html};
   if(changed==='html')document.html_content='Different child rate schedule';
   if(changed==='owner')document.user_id=568;
   if(changed==='task')document.task_id=task.id+1;
   if(changed==='action')document.document_action_type='acknowledgment';
   return [[document]];
  });
  await expect(requireEmployeeCompensationSignatureAccess(compensationTask,{id:567})).rejects.toMatchObject({status:409});
  expect(pool.execute.mock.calls.some(([sql])=>/^(INSERT|UPDATE|DELETE)/.test(sql))).toBe(false);
 });
 it('leaves legacy tasks under their existing signing rules without checking new employment prerequisites',async()=>{
  generation=null;
  await expect(requireEmployeeCompensationSignatureAccess(task,supervisor,{countersign:true})).resolves.toBe(false);
  expect(pool.execute).toHaveBeenCalledOnce();expect(readAgencyAccess).not.toHaveBeenCalled();
 });
});

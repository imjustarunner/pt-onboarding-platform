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
import Task from '../../models/Task.model.js';
import Signed from '../../models/SignedDocument.model.js';
import Workflow from '../../models/DocumentSignatureWorkflow.model.js';
import pool from '../../config/database.js';
import { giveConsent,recordIntent,signDocument,counterSignDocument,downloadSignedDocument,viewSignedDocument } from '../documentSigning.controller.js';
import {documentSignerAccess,requireAssignedDocumentSigner,requireValidPrimarySignature} from '../../utils/documentSignerAccess.js';
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

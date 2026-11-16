import { beforeEach,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),get:vi.fn(),encrypt:vi.fn(),decrypt:vi.fn(),audit:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.get}}));
vi.mock('../../services/demographicsImport.service.js',()=>({encryptDemographicsPayload:m.encrypt,decryptDemographicsPayload:m.decrypt}));
vi.mock('../../services/auditEvent.service.js',()=>({logAuditEvent:m.audit}));
import {getClientCreationDraft,saveClientCreationDraft} from '../clientCreationDraft.controller';
const req=()=>({user:{id:10,role:'support'},get:()=> '2',body:{revision:0,value:{form:{fullName:'Synthetic Client'}}}});
const response=()=>({set:vi.fn().mockReturnThis(),json:vi.fn()});let db;
beforeEach(()=>{vi.resetAllMocks();m.execute.mockResolvedValue([[{id:2}]]);m.encrypt.mockReturnValue({ciphertext:'encrypted-value'});db={execute:vi.fn().mockResolvedValue([[]]),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};m.get.mockResolvedValue(db);});
it.each(['school_staff','client_guardian','staff'])('rejects %s before a draft query',async role=>{const request=req();request.user.role=role;const next=vi.fn();await getClientCreationDraft(request,response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));expect(m.execute).not.toHaveBeenCalled();});
it('encrypts with both agency and actual user context and stores only ciphertext',async()=>{
 const next=vi.fn(),res=response();await saveClientCreationDraft(req(),res,next);expect(next).not.toHaveBeenCalled();expect(m.encrypt).toHaveBeenCalledWith({context:'client_creation:2:10',value:{form:{fullName:'Synthetic Client'}}});const call=db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT'));expect(call[1]).toEqual([2,10,JSON.stringify({ciphertext:'encrypted-value'}),1]);expect(JSON.stringify(call)).not.toContain('Synthetic');expect(db.commit).toHaveBeenCalledOnce();
});
it('blocks a stale revision instead of overwriting another window',async()=>{
 db.execute.mockImplementation(async sql=>sql.startsWith('SELECT payload')?[[{payload_enc:'cipher',revision:4}]]:[[]]);m.decrypt.mockReturnValue({context:'client_creation:2:10',value:{}});const next=vi.fn();await saveClientCreationDraft(req(),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(db.rollback).toHaveBeenCalledOnce();expect(db.commit).not.toHaveBeenCalled();expect(m.encrypt).not.toHaveBeenCalled();
});
it('refuses an encrypted draft copied from another agency or user',async()=>{
 m.execute.mockResolvedValueOnce([[{id:2}]]).mockResolvedValueOnce([[{payload_enc:'cipher',revision:1}]]);m.decrypt.mockReturnValue({context:'client_creation:99:10',value:{}});const next=vi.fn();await getClientCreationDraft(req(),response(),next);expect(next).toHaveBeenCalledWith(expect.objectContaining({message:'Client draft context mismatch'}));
});

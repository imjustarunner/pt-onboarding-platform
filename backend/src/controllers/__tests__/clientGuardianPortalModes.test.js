import {beforeEach,expect,it,vi} from 'vitest';const m=vi.hoisted(()=>({client:vi.fn(),links:vi.fn(),getLink:vi.fn(),upsert:vi.fn(),user:vi.fn(),assign:vi.fn(),audit:vi.fn()}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:m.client}}));vi.mock('../../models/ClientGuardian.model.js',()=>({default:{listForClient:m.links,getLink:m.getLink,upsertLink:m.upsert}}));vi.mock('../../models/User.model.js',()=>({default:{findByEmail:m.user,assignToAgency:m.assign,getAgencies:async()=>[{id:2}]}}));vi.mock('../../services/auditEvent.service.js',()=>({logAuditEvent:m.audit}));
vi.mock('../../services/clientRecordAccess.service.js',()=>({resolveClientRecordAccess:async()=>({ok:true})}));
import {upsertClientGuardian,updateClientGuardian} from '../clientGuardian.controller.js';
const req=body=>({params:{id:'8',guardianUserId:'10'},user:{id:5,role:'admin'},body});const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});beforeEach(()=>{vi.clearAllMocks();m.client.mockResolvedValue({id:8,agency_id:2,email:'client@example.test'});m.links.mockResolvedValue([{guardian_user_id:10,relationship_type:'guardian',access_enabled:0,permissions_json:{noView:true}}]);m.user.mockResolvedValue({id:10,role:'client_guardian',email:'client@example.test'});m.getLink.mockResolvedValue({guardian_user_id:10,relationship_type:'guardian'});});
it('requires explicit saved client-owned contact confirmation before self-account preparation',async()=>{const res=response(),next=vi.fn();await upsertClientGuardian(req({email:'parent@example.test',firstName:'Synthetic',lastName:'Client',relationshipType:'self'}),res,next);expect(res.status).toHaveBeenCalledWith(400);expect(m.user).not.toHaveBeenCalled();expect(m.upsert).not.toHaveBeenCalled();});
it('refuses converting an existing guardian identity into the client through either create or patch',async()=>{const res=response(),next=vi.fn();await upsertClientGuardian(req({email:'client@example.test',firstName:'Synthetic',lastName:'Client',relationshipType:'self',clientOwnContactConfirmed:true}),res,next);expect(res.status).toHaveBeenCalledWith(409);expect(m.assign).not.toHaveBeenCalled();await updateClientGuardian(req({relationshipType:'self'}),res,next);expect(res.status).toHaveBeenLastCalledWith(409);expect(m.upsert).not.toHaveBeenCalled();});
it('keeps prior privacy restrictions when selecting payment-only access and records the actual staff actor',async()=>{const res=response(),next=vi.fn();const request=req({accessMode:'payment_only',accessReason:'Client requests billing only'});await updateClientGuardian(request,res,next);expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({createdByUserId:5,accessEnabled:true,permissionsJson:expect.objectContaining({noView:true,billingOnly:true,canViewDocs:false,canMessage:false})}));expect(m.audit).toHaveBeenCalledWith(request,expect.objectContaining({actionType:'client_portal_access_updated'}));expect(next).not.toHaveBeenCalled();});

it('disables and re-enables the same relationship without reconnecting or losing permissions, and records both changes', async () => {
 let link={guardian_user_id:10,relationship_type:'guardian',relationship_title:'Parent',access_enabled:1,
  permissions_json:{noView:true,canViewDocs:false,canMessage:true}};
 const originalPermissions={...link.permissions_json};
 m.links.mockImplementation(async()=>[structuredClone(link)]);
 m.upsert.mockImplementation(async update=>{link={...link,access_enabled:update.accessEnabled?1:0,permissions_json:update.permissionsJson};});
 const disabled=req({accessEnabled:false,accessReason:'Temporary pause'}),next=vi.fn();
 await updateClientGuardian(disabled,response(),next);
 expect(next).not.toHaveBeenCalled();
 expect(link.access_enabled).toBe(0);
 expect(link.permissions_json).toEqual(originalPermissions);
 expect(link.permissions_json).not.toHaveProperty('relationshipRevoked');
 const enabled=req({accessEnabled:true,accessReason:'Resume existing access'});
 await updateClientGuardian(enabled,response(),next);
 expect(next).not.toHaveBeenCalled();
 expect(link.access_enabled).toBe(1);
 expect(link.guardian_user_id).toBe(10);
 expect(link.relationship_title).toBe('Parent');
 expect(link.permissions_json).toEqual(originalPermissions);
 expect(m.upsert.mock.calls.map(([update])=>[update.clientId,update.guardianUserId])).toEqual([[8,10],[8,10]]);
 expect(m.user).not.toHaveBeenCalled();
 expect(m.assign).not.toHaveBeenCalled();
 expect(m.audit).toHaveBeenNthCalledWith(1,disabled,expect.objectContaining({metadata:expect.objectContaining({previousAccessEnabled:true,accessEnabled:false,reason:'Temporary pause'})}));
 expect(m.audit).toHaveBeenNthCalledWith(2,enabled,expect.objectContaining({metadata:expect.objectContaining({previousAccessEnabled:false,accessEnabled:true,reason:'Resume existing access'})}));
});

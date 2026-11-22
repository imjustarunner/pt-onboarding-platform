import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),connection:vi.fn(),client:vi.fn(),access:vi.fn(),user:vi.fn(),email:vi.fn(),update:vi.fn(),audit:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.connection},onTableWrite:vi.fn()}));
vi.mock('../../models/Client.model.js',()=>({default:{findById:m.client}}));
vi.mock('../../models/User.model.js',()=>({default:{findById:m.user,findByEmail:m.email,update:m.update}}));
vi.mock('../../services/clientRecordAccess.service.js',()=>({resolveClientRecordAccess:m.access}));
vi.mock('../../services/auditEvent.service.js',()=>({logAuditEvent:m.audit}));
import ClientGuardian from '../../models/ClientGuardian.model.js';
import {updateClientGuardian} from '../clientGuardian.controller.js';
const contact={firstName:'Synthetic',lastName:'Parent',email:'parent@example.test',phone:'719-555-0101'};
const request=body=>({params:{id:'4',guardianUserId:'20'},user:{id:7,role:'admin'},body});
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
let link,db;
beforeEach(()=>{
 vi.resetAllMocks();
 ClientGuardian._hasRelationshipTypeColumn=true;
 link={client_id:4,guardian_user_id:20,relationship_type:'guardian',relationship_title:'Guardian',access_enabled:0,
  permissions_json:{relationshipRevoked:true,noContact:true,noView:true}};
 m.client.mockResolvedValue({id:4,agency_id:2});m.access.mockResolvedValue({ok:true});
 m.user.mockResolvedValue({id:20,role:'client_guardian'});m.email.mockResolvedValue(null);
 m.execute.mockImplementation(async()=>[[structuredClone(link)]]);
 db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),
  execute:vi.fn(async(sql,params)=>{
   if(sql.includes('SELECT access_enabled'))return [[structuredClone(link)]];
   if(sql.startsWith('UPDATE client_guardians SET relationship_title')){link.relationship_title=params[0];return [{affectedRows:1}];}
   return [[]];
  })};
 m.connection.mockResolvedValue(db);
});
it.each([
 {enabled:0,permissions:{relationshipRevoked:true,noContact:true,noView:true}},
 {enabled:0,permissions:{noView:true,billingOnly:true}},
 {enabled:1,permissions:{pendingGuardianVerification:true,noView:true}}
])('saves the real editor request without changing relationship access: %j',async({enabled,permissions})=>{
 link.access_enabled=enabled;link.permissions_json=permissions;
 const original=structuredClone(link),res=response(),next=vi.fn();
 await updateClientGuardian(request({contact,relationshipTitle:'Father'}),res,next);
 expect(next).not.toHaveBeenCalled();
 expect(res.status).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({ok:true});
 expect(m.update).toHaveBeenCalledExactlyOnceWith(20,{firstName:'Synthetic',lastName:'Parent',email:'parent@example.test',personalEmail:'parent@example.test',phoneNumber:'719-555-0101'});
 expect(link).toEqual({...original,relationship_title:'Father'});
 expect(db.execute.mock.calls.filter(([sql])=>/^(UPDATE|INSERT|DELETE)/.test(sql))).toEqual([
  ['UPDATE client_guardians SET relationship_title = ? WHERE client_id = ? AND guardian_user_id = ?', ['Father',4,20]]
 ]);
 expect(db.commit).toHaveBeenCalled();expect(db.rollback).not.toHaveBeenCalled();
});
it('still rejects explicitly enabling an incorrect relationship before updating any contact data',async()=>{
 const res=response(),next=vi.fn();
 await updateClientGuardian(request({accessEnabled:true}),res,next);
 expect(res.status).toHaveBeenCalledWith(409);expect(m.update).not.toHaveBeenCalled();
 expect(db.execute).not.toHaveBeenCalled();
});
it('retains the model guard against reconnecting an incorrect relationship',async()=>{
 await expect(ClientGuardian.upsertLink({clientId:4,guardianUserId:20,accessEnabled:true})).rejects.toMatchObject({status:409});
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 expect(db.rollback).toHaveBeenCalled();
});
it.each([
 {accessEnabled:true},{accessEnabled:false},{accessMode:'care'},{permissionsJson:{relationshipRevoked:false}},
 {relationshipType:'self'},{metadataOnly:true}
])('rejects mixed contact and access changes before writing anything: %j',async extra=>{
 const res=response(),next=vi.fn();
 await updateClientGuardian(request({contact,relationshipTitle:'Father',...extra}),res,next);
 expect(res.status).toHaveBeenCalledWith(400);expect(m.update).not.toHaveBeenCalled();
 expect(m.connection).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});
it.each([null,[],false])('rejects invalid contact data before writing: %j',async value=>{
 const res=response();await updateClientGuardian(request({contact:value}),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(400);expect(m.update).not.toHaveBeenCalled();
});
it('rejects an oversized relationship label before updating contact data',async()=>{
 const res=response();await updateClientGuardian(request({contact,relationshipTitle:'x'.repeat(101)}),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(400);expect(m.update).not.toHaveBeenCalled();
});
it('rejects unauthorized client access before contact or relationship writes',async()=>{
 m.access.mockResolvedValue({ok:false,status:403,message:'Client access denied.'});
 const res=response();await updateClientGuardian(request({contact,relationshipTitle:'Father'}),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(403);expect(m.update).not.toHaveBeenCalled();expect(m.connection).not.toHaveBeenCalled();
});
it('preserves a concurrent access restriction and audits this as a contact correction',async()=>{
 m.update.mockImplementation(async()=>{link.permissions_json={relationshipRevoked:true,noContact:true,noView:true,reviewReason:'New restriction'};});
 const req=request({contact,relationshipTitle:'Father'}),res=response(),next=vi.fn();
 await updateClientGuardian(req,res,next);
 expect(next).not.toHaveBeenCalled();expect(link.permissions_json.reviewReason).toBe('New restriction');
 expect(link.access_enabled).toBe(0);
 expect(m.audit).toHaveBeenCalledExactlyOnceWith(req,expect.objectContaining({actionType:'guardian_contact_updated',metadata:expect.objectContaining({clientId:4,guardianUserId:20,accessEnabled:false})}));
});

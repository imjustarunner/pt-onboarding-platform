import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({execute:vi.fn(),connection:vi.fn(),access:vi.fn(),audit:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute,getConnection:m.connection},onTableWrite:vi.fn()}));
vi.mock('../../models/Client.model.js',()=>({default:{}}));
vi.mock('../../models/User.model.js',()=>({default:{}}));
vi.mock('../../services/clientRecordAccess.service.js',()=>({resolveClientRecordAccess:m.access}));
vi.mock('../../services/auditEvent.service.js',()=>({logAuditEvent:m.audit}));
import ClientGuardian from '../../models/ClientGuardian.model.js';
import {restoreClientGuardian} from '../clientGuardian.controller.js';
let link,originalHistory,events,snapshot,independent,otherGuardians,db;
const req=body=>({params:{id:'4',guardianUserId:'20'},user:{id:7,role:'admin'},body});
const body={relationshipVerified:true,accessMode:'care',accessReason:'Verified the current parent and authority'};
const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn()});
beforeEach(()=>{
 vi.resetAllMocks();
 link={client_id:4,guardian_user_id:20,relationship_type:'guardian',access_enabled:0,
  permissions_json:{relationshipRevoked:true,noContact:true,noView:true,canSignDocs:false,noViewOtherGuardian:true,pendingOtherGuardianEnrollment:true}};
 snapshot={guardianUserId:20,accessEnabled:false,permissions:{canSignDocs:false,noViewOtherGuardian:true}};
 originalHistory={id:30,from_value:JSON.stringify(snapshot),to_value:'20'};events=[];independent=null;otherGuardians=[];
 m.access.mockResolvedValue({ok:true,client:{id:4,agency_id:2}});
 m.execute.mockImplementation(async()=>[[structuredClone(link)]]);
 db={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,params)=>{
  if(sql.includes('SELECT relationship_type'))return [[structuredClone(link)]];
  if(sql.includes('SELECT from_value'))return snapshot?[[{from_value:JSON.stringify(snapshot)}]]:[[]];
  if(sql.includes('SELECT user_id FROM client_portal_independence'))return [[independent].filter(Boolean)];
  if(sql.includes('SELECT guardian_user_id'))return [otherGuardians];
  if(sql.startsWith('UPDATE client_guardians')){link.access_enabled=params[0];link.permissions_json=JSON.parse(params[1]);return [{affectedRows:1}];}
  if(sql.includes('INSERT INTO client_status_history')){events.push(params);return [{insertId:31}];}
  return [[]];
 })};m.connection.mockResolvedValue(db);
});
it('restores the same row after review, preserves independent restrictions and appends an attributed history event',async()=>{
 const res=response(),next=vi.fn(),request=req(body),oldHistory=structuredClone(originalHistory);
 await restoreClientGuardian(request,res,next);
 expect(next).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith({ok:true,accessEnabled:true});
 expect(link).toMatchObject({client_id:4,guardian_user_id:20,access_enabled:1,permissions_json:{relationshipRevoked:false,canSignDocs:false,noViewOtherGuardian:true,pendingOtherGuardianEnrollment:true,pendingGuardianVerification:false}});
 expect(link.permissions_json).not.toHaveProperty('noContact');expect(link.permissions_json).not.toHaveProperty('noView');
 expect(events).toHaveLength(1);expect(events[0].slice(0,2)).toEqual([4,7]);expect(events[0][4]).toBe(body.accessReason);
 expect(JSON.parse(events[0][2]).permissions.relationshipRevoked).toBe(true);
 expect(JSON.parse(events[0][3]).permissions.relationshipRevoked).toBe(false);
 expect(originalHistory).toEqual(oldHistory);
 expect(db.execute.mock.calls.some(([sql])=>/DELETE|INSERT INTO client_guardians|UPDATE client_status_history/.test(sql))).toBe(false);
 expect(db.commit).toHaveBeenCalled();
 expect(m.audit).toHaveBeenCalledWith(request,expect.objectContaining({actionType:'guardian_relationship_restored'}));
});
it('can restore without enabling portal access',async()=>{
 const res=response(),next=vi.fn();await restoreClientGuardian(req({...body,accessMode:'none'}),res,next);
 expect(next).not.toHaveBeenCalled();expect(link.access_enabled).toBe(0);expect(link.permissions_json.relationshipRevoked).toBe(false);
 expect(res.json).toHaveBeenCalledWith({ok:true,accessEnabled:false});
});
it('preserves a privacy/contact restriction that predated the incorrect-link action',async()=>{
 snapshot.permissions={noContact:true,noView:true};
 await restoreClientGuardian(req(body),response(),vi.fn());
 expect(link.permissions_json).toMatchObject({noContact:true,noView:true,relationshipRevoked:false});
});
it('keeps restrictions when no original snapshot is available',async()=>{
 snapshot=null;await restoreClientGuardian(req(body),response(),vi.fn());
 expect(link.permissions_json).toMatchObject({noContact:true,noView:true,relationshipRevoked:false});
});
it.each([{relationshipVerified:false},{accessReason:''},{accessMode:'invalid'},{accessReason:'x'.repeat(1001)}])('requires a complete review before any writes: %j',async invalid=>{
 const res=response();await restoreClientGuardian(req({...body,...invalid}),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(400);expect(m.connection).not.toHaveBeenCalled();
});
it('rejects unrelated staff before touching the relationship',async()=>{
 m.access.mockResolvedValue({ok:false,status:403,message:'Forbidden'});
 const res=response();await restoreClientGuardian(req(body),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(403);expect(m.connection).not.toHaveBeenCalled();
});
it.each(['independence','guardian limit'])('retains the existing %s guard when restoring access',async guard=>{
 if(guard==='independence')independent={user_id:88};else otherGuardians=[{guardian_user_id:30},{guardian_user_id:31}];
 const next=vi.fn();await restoreClientGuardian(req(body),response(),next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(link.permissions_json.relationshipRevoked).toBe(true);
 expect(link.access_enabled).toBe(0);expect(events).toEqual([]);expect(db.rollback).toHaveBeenCalled();
});
it('a repeated restoration cannot overwrite the now-current relationship',async()=>{
 await restoreClientGuardian(req(body),response(),vi.fn());
 const res=response(),next=vi.fn();await restoreClientGuardian(req({...body,accessMode:'none'}),res,next);
 expect(next).toHaveBeenCalledWith(expect.objectContaining({status:409}));expect(link.access_enabled).toBe(1);expect(events).toHaveLength(1);
});
it('a normal link operation still cannot silently restore a revoked relationship',async()=>{
 ClientGuardian._hasRelationshipTypeColumn=true;
 db.execute.mockImplementation(async sql=>sql.includes('SELECT access_enabled')?[[structuredClone(link)]]:[[]]);
 await expect(ClientGuardian.upsertLink({clientId:4,guardianUserId:20,accessEnabled:true})).rejects.toMatchObject({status:409});
 expect(events).toEqual([]);
});

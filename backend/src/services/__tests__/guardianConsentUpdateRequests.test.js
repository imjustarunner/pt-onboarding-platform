import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import { prepareGuardianConsentUpdates } from '../guardianConsentUpdateRequests.service.js';
it('creates a separate disclosure packet for each guardian, copying only consent documents and reusing requests on retry',async()=>{
 const requests=[{id:100,status:'draft',guardian_user_id:1}];const copied=[];let nextId=101;
 const connection={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async(sql,args)=>{
  if(sql.startsWith('SELECT *'))return [requests.filter(r=>r.guardian_user_id===args[1])];
  if(sql.startsWith('INSERT INTO client_update_requests')){const id=nextId++;requests.push({id,status:'draft',guardian_user_id:args[3]});return [{insertId:id}];}
  if(sql.startsWith('INSERT INTO client_update_items'))copied.push(args);
  return [[]];
 })};
 const db={execute:vi.fn(async()=>[[{id:50}]]),getConnection:async()=>connection};
 const args={request:{id:100,agency_id:20,client_id:10,guardian_user_id:1},items:[{item_type:'document',reference_key:'50',title:'Disclosure'},{item_type:'document',reference_key:'51',title:'Unrelated form'},{item_type:'assessment',reference_key:'psc17'}],primaryGuardianUserId:1,db,
 loadGuardians:async()=>[{guardian_user_id:1,access_enabled:1,email:'one@example.test'},{guardian_user_id:2,access_enabled:1,email:'two@example.test'},{guardian_user_id:3,access_enabled:0}]};
 const first=await prepareGuardianConsentUpdates(args);const second=await prepareGuardianConsentUpdates(args);
 expect(first.map(row=>row.requestId)).toEqual([100,101]);expect(second).toEqual(first);
 expect(copied).toEqual([[101,'document','50','Disclosure']]);expect(connection.commit).toHaveBeenCalledTimes(2);
});
it('does not fan out ordinary intake assessments or authorize a restricted primary guardian',async()=>{
 const db={execute:vi.fn(async()=>[[{id:50}]]),getConnection:vi.fn()};
 expect(await prepareGuardianConsentUpdates({request:{},items:[{item_type:'assessment'}],db})).toBeNull();
 await expect(prepareGuardianConsentUpdates({request:{agency_id:20,client_id:10},items:[{item_type:'document',reference_key:'50'}],primaryGuardianUserId:1,db,loadGuardians:async()=>[{guardian_user_id:1,access_enabled:0}]})).rejects.toMatchObject({status:409});
 expect(db.getConnection).not.toHaveBeenCalled();
});

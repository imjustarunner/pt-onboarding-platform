import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import {createClientServiceReturnRequests} from '../clientServiceReturnRequest.service.js';
let m,service,request,row;
const input={userId:9,clientId:8,agencyId:2,serviceId:3,requestId:'11111111-1111-4111-8111-111111111111',note:'I would like to reconnect with this provider.'};
beforeEach(()=>{
 request=null;row={id:3,client_id:8,agency_id:2,provider_user_id:7,service_kind:'counseling',is_active:0,service_status:'terminated',closure_reason:'discontinued_contact'};
 m={execute:vi.fn(async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM client_service_enrollments'))return [[row]];
  if(sql.startsWith('SELECT c.status'))return [[{status:'CURRENT',client_status_key:'current'}]];
  if(sql.startsWith('SELECT * FROM client_service_return_requests WHERE id='))return [[...(request&&request.id===args[0]?[request]:[])]];
  if(sql.startsWith('SELECT * FROM client_service_return_requests WHERE service_enrollment_id='))return [[...(request&&request.requester_user_id===args[1]&&(!sql.includes("status='pending'")||request.status==='pending')?[request]:[])]];
  if(sql.startsWith('INSERT INTO client_service_return_requests'))request={id:args[0],client_id:args[1],agency_id:args[2],service_enrollment_id:args[3],provider_user_id:args[4],requester_user_id:args[5],note_encrypted:args[6],status:'pending',created_at:'2026-11-13 12:00:00'};
  if(sql.startsWith('UPDATE client_service_return_requests'))Object.assign(request,{status:args[0],response_encrypted:args[1]});
  return [{affectedRows:1}];
 }),authorize:vi.fn(async()=>({client_id:8,agency_id:2})),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
 service=createClientServiceReturnRequests({db:{execute:m.execute,getConnection:async()=>m},authorize:m.authorize,encrypt:JSON.stringify,decrypt:JSON.parse});
});
it('saves one private consideration request and notifies the assigned provider without booking or reactivating care',async()=>{
 await service.submit(input);await service.submit(input);await service.submit({...input,requestId:'22222222-2222-4222-8222-222222222222'});
 expect(request.status).toBe('pending');expect(row.is_active).toBe(0);
 expect(m.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO notifications'))).toHaveLength(1);
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE client_service_enrollments')||sql.startsWith('INSERT INTO appointments'))).toBe(false);
 expect((await service.read(input)).request.note).toBe(input.note);
});
it('never exposes another guardian’s note and rechecks current relationship access',async()=>{
 await service.submit(input);expect(await service.read({...input,userId:10})).toEqual({request:null});
 m.authorize.mockRejectedValueOnce(Object.assign(new Error('Link revoked'),{status:403}));await expect(service.read(input)).rejects.toMatchObject({status:403});
});
it('reviews or declines separately from the explicit service-status change',async()=>{
 await service.submit(input);await service.review({clientId:8,agencyId:2,serviceId:3,userId:7,requestId:input.requestId,decision:'reviewed',message:'Please contact us about next steps.'});
 expect((await service.read(input)).request).toMatchObject({status:'reviewed',response:'Please contact us about next steps.'});expect(row.is_active).toBe(0);
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE client_service_enrollments'))).toBe(false);
 await expect(service.review({clientId:8,agencyId:2,serviceId:3,userId:7,requestId:input.requestId,decision:'declined'})).rejects.toMatchObject({status:409});
});
it('rejects active care requests and changed retries instead of silently creating another request',async()=>{
 row.is_active=1;row.service_status='active';await expect(service.submit(input)).rejects.toMatchObject({status:409});row.is_active=0;row.service_status='discontinued';
 await service.submit(input);await expect(service.submit({...input,note:'Changed request'})).rejects.toMatchObject({status:409});
});

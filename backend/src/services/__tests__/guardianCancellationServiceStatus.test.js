import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{},onTableWrite:vi.fn()}));
import {updateClientServiceStatus} from '../clientServiceEnrollment.service.js';
let m,rows,future,pending,terminal;
const input={clientId:8,agencyId:2,serviceId:3,userId:9,input:{status:'active',expectedStatus:'discontinued',reason:'Client requested resuming care.',confirmed:true}};
beforeEach(()=>{
 rows=[{id:3,client_id:8,agency_id:2,provider_user_id:7,service_kind:'counseling',is_active:0,service_status:'discontinued'},{id:4,client_id:8,agency_id:2,provider_user_id:99,service_kind:'tutoring',is_active:1,service_status:'active'}];future=[];pending=[];terminal=false;
 m={execute:vi.fn(async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM client_service_enrollments WHERE id='))return [[rows[0]]];
  if(sql.includes("provider_user_id NOT IN")||sql.includes("provider_user_id=0"))return [[]];
  if(sql.startsWith('SELECT * FROM client_service_enrollments WHERE client_id='))return [[rows[0]]];
  if(sql.startsWith('SELECT id FROM guardian_service_cancellations'))return [pending];
  if(sql.startsWith('SELECT c.status'))return [[{status:terminal?'ARCHIVED':'CURRENT',client_status_key:terminal?'terminated':'active'}]];
  if(sql.startsWith('SELECT a.id'))return [future];
  if(sql.startsWith('SELECT e.*'))return [rows];
  if(sql.startsWith('UPDATE client_service_enrollments'))Object.assign(rows[0],{service_status:args[0],is_active:args[1],closure_reason:args[3],client_end_reason:args[4]});
  return [{affectedRows:1}];
 }),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()};
});
const save=(extra={})=>updateClientServiceStatus({...input,...extra}, {getConnection:async()=>m,execute:m.execute},{lock:async(ids,work)=>work()});
it('explicitly reactivates only this provider/service and audits the staff reason without recreating appointments',async()=>{
 const result=await save();expect(result.services[0].service_status).toBe('active');expect(result.services[1].is_active).toBe(1);
 expect(m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE client_service_enrollments'))[1]).toEqual(['active',1,9,null,null,8,2,7,'counseling']);
 expect(m.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO client_status_history'))[1]).toContain(input.input.reason);
 expect(m.execute.mock.calls.some(([sql])=>sql.includes('INSERT INTO appointments'))).toBe(false);expect(m.commit).toHaveBeenCalledTimes(1);
});
it('requires confirmation, a reason, and the current status before any mutation',async()=>{
 for(const patch of [{confirmed:false},{reason:''},{expectedStatus:'active'}])await expect(save({input:{...input.input,...patch}})).rejects.toHaveProperty('status');
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
it('requires future appointments to be canceled or transferred before staff close the service',async()=>{
 future=[{id:1,businessType:'mental_health'}];await expect(save({input:{...input.input,status:'terminated'}})).rejects.toMatchObject({status:409});expect(m.rollback).toHaveBeenCalled();
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);
});
it('does not reactivate while cancellation is pending or the overall client status remains terminated',async()=>{
 pending=[{id:'request'}];await expect(save()).rejects.toMatchObject({status:409});pending=[];terminal=true;await expect(save()).rejects.toMatchObject({status:409});
});

it('shows a contact-related termination to the client as discontinued with a safe explanation',async()=>{
 const result=await save({input:{...input.input,status:'terminated',closureReason:'discontinued_contact',reason:'Private engagement attempts recorded by provider.'}});
 expect(result.services[0]).toMatchObject({service_status:'terminated',portal_status:'discontinued',portal_status_label:'Discontinued services'});
 expect(result.services[0].client_end_reason).toContain('unable to re-establish contact');expect(result.services[0].client_end_reason).not.toContain('Private engagement');
});

it('closes a duplicate blank Counseling program row with the last counselor and audits both source records',async()=>{
 rows[0].is_active=1;rows[0].service_status='active';const placeholder={...rows[0],id:5,provider_user_id:0};
 const original=m.execute.getMockImplementation();m.execute.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM client_service_enrollments')&&sql.includes('provider_user_id=0'))return [[placeholder]];
  if(sql.startsWith('UPDATE client_service_enrollments')&&sql.includes('WHERE id=?'))return [{affectedRows:1}];
  return original(sql,args);
 });
 await save({input:{...input.input,status:'completed',expectedStatus:'active'}});
 const cleanup=m.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE client_service_enrollments')&&sql.includes('WHERE id=?'));
 expect(cleanup[1]).toEqual(['completed',9,'care_completed','This course of services has been completed.',5,8,2]);
 expect(m.execute.mock.calls.filter(([sql])=>sql.startsWith('INSERT INTO client_status_history')).map(([,args])=>args[2])).toEqual(['service_status:3','service_status:5']);
 expect(m.commit).toHaveBeenCalledOnce();expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('DELETE'))).toBe(false);
});
it('keeps remaining Counseling appointments protected when closing a duplicate blank program row',async()=>{
 rows[0].is_active=1;rows[0].service_status='active';const placeholder={...rows[0],id:5,provider_user_id:0};
 const original=m.execute.getMockImplementation();m.execute.mockImplementation(async(sql,args)=>{
  if(sql.startsWith('SELECT * FROM client_service_enrollments')&&sql.includes('provider_user_id=0'))return [[placeholder]];
  if(sql.startsWith('SELECT a.id')&&!sql.includes('a.provider_user_id=?'))return [[{id:40,businessType:'mental_health',providerUserId:99}]];
  return original(sql,args);
 });
 await expect(save({input:{...input.input,status:'completed',expectedStatus:'active'}})).rejects.toMatchObject({status:409});
 expect(m.execute.mock.calls.some(([sql])=>sql.startsWith('UPDATE'))).toBe(false);expect(m.rollback).toHaveBeenCalledOnce();
});

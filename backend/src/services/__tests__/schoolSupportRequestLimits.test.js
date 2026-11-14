import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {createSchoolSupportRequest} from '../schoolSupportRequest.service.js';
const input={agencyId:2,userId:10,actorId:10,sourceAppointmentId:23,items:[{date:'2026-11-13',hours:.5}]};
function database(existing=null){return{execute:vi.fn(async sql=>{
 if(sql.includes('FROM payroll_pto_accounts'))return [[{school_support_balance_hours:.75}]];
 if(sql.startsWith('SELECT total_hours'))return [[]];
 if(sql.includes('WHERE source_appointment_id='))return [[existing].filter(Boolean)];
 if(sql.startsWith('INSERT INTO payroll_pto_requests'))return [{insertId:89}];
 return [{}];
})};}
describe('linked cancellation support-hour limits',()=>{
 it('reserves the chosen fractional amount under the shared account lock',async()=>{
  const db=database();expect(await createSchoolSupportRequest({...input,db})).toEqual({requestId:89,alreadyRequested:false});
  expect(db.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(db.execute.mock.calls.find(([sql])=>sql.startsWith('INSERT INTO payroll_pto_requests'))[1]).toEqual([2,10,10,null,.5,23]);
 });
 it.each([[{date:'2026-11-13',hours:1.01}],[{date:'2026-11-13',hours:.5},{date:'2026-11-14',hours:.5}]])('rejects excessive or split-event dates before acquiring a balance',async(...items)=>{
  const db=database();await expect(createSchoolSupportRequest({...input,items,db})).rejects.toThrow('one dated entry');expect(db.execute).not.toHaveBeenCalled();
 });
 it('returns the original request on an identical retry without inserting again',async()=>{
  const db=database({id:89,agency_id:2,user_id:10,total_hours:.5});expect(await createSchoolSupportRequest({...input,db})).toEqual({requestId:89,alreadyRequested:true});expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 });
 it.each([{agency_id:6,user_id:10,total_hours:.5},{agency_id:2,user_id:11,total_hours:.5},{agency_id:2,user_id:10,total_hours:1}])('rejects a different owner or signed amount on retry: %j',async existing=>{
  const db=database({id:89,...existing});await expect(createSchoolSupportRequest({...input,db})).rejects.toThrow();expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('INSERT'))).toBe(false);
 });
 it('cannot reserve more than the available balance even below the per-appointment cap',async()=>{
  const db=database();await expect(createSchoolSupportRequest({...input,items:[{date:'2026-11-13',hours:.8}],db})).rejects.toThrow('Insufficient');
 });
});

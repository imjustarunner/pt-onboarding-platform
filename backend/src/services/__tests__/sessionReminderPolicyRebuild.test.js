import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {rebuildSessionReminderPolicies} from '../sessionReminderPolicyRebuild.service.js';
let db,conn,schedule,state,acquired;
beforeEach(()=>{state='pending';acquired=1;schedule=vi.fn(async()=>[]);conn={release:vi.fn(),execute:vi.fn(async sql=>sql.includes('GET_LOCK')?[[{acquired}]]:sql.startsWith('SELECT status')?[[{status:state}]]:sql.startsWith('SELECT id FROM appointment_reminders')?[[{id:4}]]:[{affectedRows:1}])};db={query:vi.fn(async()=>[[{appointment_id:12}]]),getConnection:vi.fn(async()=>conn)};});
it('rebuilds only the persisted schedule, preserves manual pushes, and records a completed upgrade',async()=>{
 expect(await rebuildSessionReminderPolicies({db,schedule,agencyId:377,appointmentId:12})).toEqual({rebuilt:1});
 expect(schedule).toHaveBeenCalledWith(12,{replace:true});expect(conn.execute.mock.calls.some(([sql])=>sql.includes("COALESCE(rule_key,'')<>'manual_extra'"))).toBe(true);expect(conn.execute.mock.calls.some(([sql])=>sql.includes("status='done'"))).toBe(true);expect(conn.release).toHaveBeenCalled();
});
it('rechecks completed work and skips another worker’s active lock',async()=>{
 state='done';await rebuildSessionReminderPolicies({db,schedule});expect(schedule).not.toHaveBeenCalled();
 state='pending';acquired=0;await rebuildSessionReminderPolicies({db,schedule});expect(schedule).not.toHaveBeenCalled();
});
it('records a failed rebuild for bounded retry without marking its schedule current',async()=>{
 schedule.mockRejectedValue(Object.assign(new Error('failed'),{code:'WRITE_FAILED'}));expect(await rebuildSessionReminderPolicies({db,schedule})).toEqual({rebuilt:0});
 expect(conn.execute.mock.calls.some(([sql,args])=>sql.includes('attempts=attempts+1')&&args[0]==='WRITE_FAILED')).toBe(true);expect(conn.execute.mock.calls.some(([sql])=>sql.includes("status='done'"))).toBe(false);expect(conn.release).toHaveBeenCalled();
});

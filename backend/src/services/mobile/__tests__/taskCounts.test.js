import {expect,it,vi} from 'vitest';
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import {createTaskSuiteCounts} from '../taskCounts.service.js';
const request={quickView:{userId:9}};
function fixture(){return {findUser:async()=>({id:9,is_active:1}),agencies:async()=>({agencies:[{id:10},{id:20}]}),countTasks:vi.fn(async(id,options)=>options.view==='assigned'?257:120),db:{execute:vi.fn(async sql=>[[{total:sql.includes('FROM task_lists')?4:2}]])}};}
it('counts assigned and created open tasks before pagination and counts accessible lists/projects',async()=>{
 const f=fixture();expect(await createTaskSuiteCounts(f)(request)).toEqual({assigned:257,mine:120,lists:4,projects:2});
 expect(f.countTasks).toHaveBeenCalledWith(9,{view:'mine',countOpen:true,authorizedAgencyIds:[10,20]});
 for(const [sql,args] of f.db.execute.mock.calls){expect(sql).toContain('created_by_user_id=? OR EXISTS');expect(sql).toContain('agency_id IN (?,?)');expect(args).toEqual([9,9,10,20]);}
 expect(f.db.execute.mock.calls[1][0]).toContain("COALESCE(tp.status,'active')<>'archived'");
});
it('does not turn failures into empty totals and preserves unaffected counts',async()=>{
 const f=fixture();f.countTasks.mockRejectedValue(new Error('offline'));expect(await createTaskSuiteCounts(f)(request)).toEqual({assigned:null,mine:null,lists:4,projects:2});
});
it('keeps QA counts in their permitted agencies and rejects a revoked account',async()=>{
 const f=fixture();await createTaskSuiteCounts(f)({quickView:{userId:9,qaAgencyIds:[20]}});expect(f.countTasks).toHaveBeenCalledWith(9,{view:'assigned',countOpen:true,authorizedAgencyIds:[20]});
 await expect(createTaskSuiteCounts({...f,findUser:async()=>null})(request)).rejects.toMatchObject({status:403});
});

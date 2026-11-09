import {expect,it,vi} from 'vitest';
vi.mock('../../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import pool from '../../../config/database.js';
import Task from '../../../models/Task.model.js';
import {createWorkspaceCounts} from '../workspaceCounts.service.js';
const request={quickView:{userId:5,mobileDeviceSessionId:1}};
const dependencies=()=>({findUser:async()=>({id:5,is_active:1}),agencies:async()=>({agencies:[{id:10},{id:20}]}),work:vi.fn(async()=>({items:['not_started','started','signed','awaiting_cosign'].map((status,id)=>({id,agencyId:10,status})),failures:[]})),countTasks:vi.fn(async()=>257)});
it('counts all actionable documentation and tasks across fresh authorized agencies without list pagination',async()=>{
 const deps=dependencies();expect(await createWorkspaceCounts(deps)(request)).toEqual({mywork:3,tasks:257});
 expect(deps.countTasks).toHaveBeenCalledWith(5,{view:'assigned',countOpen:true,authorizedAgencyIds:[10,20]});
});
it('uses unknown instead of a false zero on a partial queue or failed task count',async()=>{
 const deps=dependencies();deps.work.mockResolvedValue({items:[],failures:[{agencyId:20}]});deps.countTasks.mockRejectedValue(new Error('offline'));
 expect(await createWorkspaceCounts(deps)(request)).toEqual({mywork:null,tasks:null});
});
it('does not include another QA agency and rejects a revoked account',async()=>{
 const deps=dependencies();expect((await createWorkspaceCounts(deps)({...request,quickView:{...request.quickView,qaAgencyIds:[20]}})).mywork).toBe(0);
 await expect(createWorkspaceCounts({...deps,findUser:async()=>({id:5,is_active:0})})(request)).rejects.toMatchObject({status:403});
});
it('retains task assignment/private visibility predicates and counts beyond the first page',async()=>{
 pool.execute.mockResolvedValue([[{total:257}]]);
 expect(await Task.findByUser(5,{view:'assigned',countOpen:true,limit:50,authorizedAgencyIds:[10,20]})).toBe(257);
 const [sql,params]=pool.execute.mock.calls.at(-1);expect(sql).toContain('COUNT(DISTINCT t.id)');expect(sql).toContain("NOT IN ('completed','done','cancelled','overridden')");expect(sql).toContain('t.assigned_to_user_id = ?');expect(sql).toContain('t.assigned_to_agency_id IN (?,?)');expect(sql).not.toMatch(/LIMIT|SELECT t\.\*/);expect((sql.match(/\?/g)||[]).length).toBe(params.length);
});

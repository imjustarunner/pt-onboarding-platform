import {expect,it,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {guardianAccountStatuses} from '../guardianAccountStatus.service.js';
it('keeps pending linked availability separate from signed enrollment',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[{guardian_user_id:1663,invitation_id:28,enrollment_status:'pending',invitation_expires_at:'2099-01-01'}]])};
 const [guardian]=await guardianAccountStatuses({clientId:2436,guardians:[{guardian_user_id:1663,access_enabled:1,permissions_json:{noView:true}}],db});
 expect(guardian).toMatchObject({access_enabled:1,enrollment_status:'pending',invitation_id:28,permissions_json:{noView:true}});
 const [sql,params]=db.execute.mock.calls[0];expect(params).toEqual([2436]);expect(sql).toContain('ic.client_id = cg.client_id AND ci.agency_id = c.agency_id');expect(sql).not.toContain('token');
});
it('reports expiry without borrowing another guardian status',async()=>{
 const db={execute:vi.fn().mockResolvedValue([[{guardian_user_id:1,invitation_id:9,enrollment_status:'pending',invitation_expires_at:'2020-01-01'}]])};
 const rows=await guardianAccountStatuses({clientId:2437,guardians:[{guardian_user_id:1,access_enabled:1},{guardian_user_id:2,access_enabled:0}],db});
 expect(rows.map(row=>row.enrollment_status)).toEqual(['expired',null]);expect(rows[1].access_enabled).toBe(0);
});

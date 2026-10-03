import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{getConnection:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../models/PractitionerSessionPackage.model.js',()=>({default:{findById:vi.fn()}}));
import pool from '../../config/database.js';
import Package from '../../models/PractitionerSessionPackage.model.js';
import {applyMissedSessionPolicy} from '../practitionerPackage.service.js';
it('custom consulting terms never automatically forfeit paid sessions or create fees',async()=>{
 const connection={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn().mockResolvedValue([[{id:123,package_id:12}]])};
 pool.getConnection.mockResolvedValue(connection);
 Package.findById.mockResolvedValue({missed_session_policy:{type:'custom',note:'Review signed engagement terms'}});
 const result=await applyMissedSessionPolicy({agencyId:442,clientId:1234,entitlementId:123});
 expect(result).toEqual({applied:false,action:'MANUAL_REVIEW',feeCents:0,note:'Review signed engagement terms'});
 expect(connection.execute).toHaveBeenCalledTimes(1);
 expect(connection.commit).toHaveBeenCalledOnce();
 expect(connection.release).toHaveBeenCalledOnce();
});

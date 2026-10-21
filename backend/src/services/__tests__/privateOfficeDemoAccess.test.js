import {beforeEach,describe,it,expect,vi} from 'vitest';
const execute=vi.hoisted(()=>vi.fn());vi.mock('../../config/database.js',()=>({default:{execute}}));
import {privateOfficeDemoAccess} from '../privateOfficeDemoAccess.service.js';
describe('explicit fictional office access',()=>{
 beforeEach(()=>{execute.mockReset();execute.mockResolvedValue([[]]);});
 it('denies an ordinary demo account with no office grant',async()=>{expect(await privateOfficeDemoAccess({id:8,userId:9,agencyId:6})).toBe(false);});
 it('requires an active, unexpired grant bound to the exact office, owner and tenant',async()=>{execute.mockResolvedValue([[{1:1}]]);expect(await privateOfficeDemoAccess({id:8,userId:9,agencyId:6})).toBe(true);const [sql,params]=execute.mock.calls[0];expect(params).toEqual([8,9,6]);for(const clause of ['g.expires_at>UTC_TIMESTAMP()','u.is_demo=1','ua.is_active=1','c.is_demo,0)=0','client_service_enrollments','appointment_participants'])expect(sql).toContain(clause);});
 it('does not create demo offices or grants implicitly',async()=>{expect(await privateOfficeDemoAccess(null)).toBe(false);expect(execute).not.toHaveBeenCalled();});
});

import {expect,it,vi} from 'vitest';
const execute=vi.hoisted(()=>vi.fn());
vi.mock('../../config/database.js',()=>({default:{execute},onTableWrite:vi.fn()}));
import {clientHasProvider} from '../clientLifecycleStatus.service.js';
it('uses office counseling assignments without requiring a school provider/day record',async()=>{
 execute.mockResolvedValueOnce([[{provider_user_id:7,is_active:1,terminated_at:null}]]);
 expect(await clientHasProvider(12,{agency_id:2,client_type:'clinical'})).toBe(true);expect(execute).toHaveBeenCalledWith(expect.stringContaining('client_service_enrollments'),[12,2]);
 execute.mockResolvedValueOnce([[{provider_user_id:0,is_active:null}]]);expect(await clientHasProvider(12,{agency_id:2,client_type:'clinical',provider_id:99})).toBe(false);
 execute.mockResolvedValueOnce([[{provider_user_id:7,is_active:0}]]);expect(await clientHasProvider(12,{agency_id:2,client_type:'clinical'})).toBe(false);
});

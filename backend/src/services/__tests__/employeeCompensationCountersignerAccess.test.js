import {it,expect,vi} from 'vitest';
vi.mock('../agencyAccessProfiles.service.js',()=>({readAgencyAccess:vi.fn()}));
import {readAgencyAccess} from '../agencyAccessProfiles.service.js';
import {employeeCompensationCountersignerAccess as allowed} from '../employeeCompensationCountersignerAccess.js';
it('accepts a currently authorized non-admin hiring employee only in the selected organization',async()=>{readAgencyAccess.mockResolvedValue({role:'staff',membership:true,permissions:{has_hiring_access:true}});expect(await allowed({id:40,role:'staff'},453,{})).toBe(true);expect(readAgencyAccess).toHaveBeenLastCalledWith(40,453,{});});
it('does not turn childcare work review, a global role, or a revoked membership into hiring countersign authority',async()=>{for(const access of [null,{role:'provider',membership:true,permissions:{has_hiring_access:false}},{role:'staff',membership:true,permissions:{}},{role:'provider',membership:true,permissions:{approve_work:true}}]){readAgencyAccess.mockResolvedValue(access);expect(await allowed({id:40,role:'staff'},453,{})).toBe(false);}});

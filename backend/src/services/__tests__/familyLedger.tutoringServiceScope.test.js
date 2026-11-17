import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../clientServiceEnrollment.service.js',()=>({guardianServiceContext:vi.fn()}));
import {guardianServiceContext} from '../clientServiceEnrollment.service.js';
import {billingServiceFilter} from '../familyLedger/views.js';
const input={agencyId:453,userId:1759,clientId:2545,serviceId:1038};
beforeEach(()=>vi.resetAllMocks());
it('ties the synthetic balance to the selected tutoring team',async()=>{
 guardianServiceContext.mockResolvedValue({service:{service_kind:'tutoring',provider_user_id:1496}});
 const filter=await billingServiceFilter(input);expect(filter.sql).toContain('scoped_ap.provider_user_id=?');expect(filter.args).toEqual(['tutoring','learning',1496]);
});
it('withholds the assigned service example from Parker’s unassigned service',async()=>{
 guardianServiceContext.mockResolvedValue({service:{service_kind:'tutoring',provider_user_id:null}});
 const filter=await billingServiceFilter({...input,serviceId:1042});expect(filter.sql).toContain("AND r.source_type<>'qa_appointment'");expect(filter.args).toEqual(['tutoring','learning']);
});
it('checks authorization before resolving a service filter',async()=>{
 guardianServiceContext.mockRejectedValue(Object.assign(new Error('Denied'),{status:403}));await expect(billingServiceFilter(input)).rejects.toMatchObject({status:403});
});

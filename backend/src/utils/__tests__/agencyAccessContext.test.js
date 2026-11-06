import { expect,it,vi } from 'vitest';
const read=vi.hoisted(()=>vi.fn(async(_userId,agencyId)=>({role:agencyId===2?'admin':'provider',permissions:{has_hiring_access:agencyId===2}})));
vi.mock('../../services/agencyAccessProfiles.service.js',()=>({readAgencyAccess:read}));
import { runWithAgencyAccess,userInCurrentAgency,currentAccessAgencyId } from '../agencyAccessContext.js';
it('isolates concurrent requests and keeps the original global record unchanged',async()=>{
 const original={id:10,role:'admin',has_hiring_access:1};
 const [one,two]=await Promise.all([runWithAgencyAccess(2,()=>userInCurrentAgency(original)),runWithAgencyAccess(6,()=>userInCurrentAgency(original))]);
 expect(one).toMatchObject({role:'admin',has_hiring_access:true});expect(two).toMatchObject({role:'provider',has_hiring_access:false});
 expect(original).toEqual({id:10,role:'admin',has_hiring_access:1});expect(currentAccessAgencyId()).toBeNull();
});
it('keeps non-request jobs on the raw record until they select an agency',async()=>{
 const original={id:10,role:'provider'};expect(await userInCurrentAgency(original)).toBe(original);
});

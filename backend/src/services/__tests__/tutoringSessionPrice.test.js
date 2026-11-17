import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/TenantService.model.js',()=>({default:{findById:vi.fn()}}));
vi.mock('../selfPayRates.service.js',()=>({assertSelfPayRateAccess:vi.fn()}));
import TenantService from '../../models/TenantService.model.js';
import {assertSelfPayRateAccess} from '../selfPayRates.service.js';
import {canSetTutoringSessionPrice,tutoringSessionPriceBilling} from '../tutoringSessionPrice.service.js';
const input={actor:{id:1807,role:'admin'},agencyId:453,providerId:1496,tenantServiceId:320,price:{amountCents:100,reason:'Synthetic one-dollar exercise'}};
beforeEach(()=>{vi.resetAllMocks();assertSelfPayRateAccess.mockResolvedValue();TenantService.findById.mockResolvedValue({id:320,isActive:true,businessType:'tutoring',serviceCode:'TUTORING'});});
it('uses the existing pricing authority without changing payroll or billing permissions',async()=>{
 expect(await tutoringSessionPriceBilling(input)).toEqual({amountCents:100,notes:expect.stringContaining('account 1807')});
 expect(assertSelfPayRateAccess).toHaveBeenCalledWith(input.actor,453,1496);expect(TenantService.findById).toHaveBeenCalledWith(320,453);
});
it('does not perform pricing reads when no custom price is requested',async()=>{expect(await tutoringSessionPriceBilling({...input,price:undefined})).toBeNull();expect(assertSelfPayRateAccess).not.toHaveBeenCalled();});
it.each([-1,1.1,'100',NaN,Infinity,2147483648,null])('rejects invalid cents %s',async amountCents=>{await expect(tutoringSessionPriceBilling({...input,price:{...input.price,amountCents}})).rejects.toMatchObject({status:400});});
it('permits an explicit zero price but never an empty reason',async()=>{
 expect((await tutoringSessionPriceBilling({...input,price:{...input.price,amountCents:0}})).amountCents).toBe(0);
 await expect(tutoringSessionPriceBilling({...input,price:{amountCents:100,reason:' '}})).rejects.toMatchObject({status:400});
});
it('rejects package and price together',async()=>{await expect(tutoringSessionPriceBilling({...input,packageEntitlementId:77})).rejects.toMatchObject({status:400});});
it.each([{isActive:false},{businessType:'mental_health'},{serviceCode:'90837'}])('does not turn a clinical or inactive service into tutoring: %j',async patch=>{
 TenantService.findById.mockResolvedValue({isActive:true,businessType:'tutoring',serviceCode:'TUTORING',...patch});await expect(tutoringSessionPriceBilling(input)).rejects.toMatchObject({status:400});
});
it('denies a provider, a guardian or another agency when existing pricing authorization denies access',async()=>{
 assertSelfPayRateAccess.mockRejectedValue(Object.assign(new Error('Denied'),{status:403}));expect(await canSetTutoringSessionPrice(input.actor,453,1496)).toBe(false);
 await expect(tutoringSessionPriceBilling(input)).rejects.toMatchObject({status:403});expect(TenantService.findById).not.toHaveBeenCalled();
});
it('does not hide a database outage as a permission denial',async()=>{assertSelfPayRateAccess.mockRejectedValue(new Error('Unavailable'));await expect(canSetTutoringSessionPrice(input.actor,453,1496)).rejects.toThrow('Unavailable');});

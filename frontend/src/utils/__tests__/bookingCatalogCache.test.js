import { expect, it, vi } from 'vitest';
import { createBookingCatalogCache } from '../bookingCatalogCache.js';
it('shares exact contexts while keeping client, agency, provider, and business type catalogs separate',async()=>{
 const api={get:vi.fn(async(_path,{params})=>({data:{serviceCodes:[params.clientIds]}}))};const load=createBookingCatalogCache(api);
 const params={agencyId:2,providerId:8,clientIds:'7',businessType:'mental_health'};
 const [a,b]=await Promise.all([load('/booking',params),load('/booking',{...params})]);expect(a).toEqual(b);expect(api.get).toHaveBeenCalledTimes(1);
 for(const change of [{clientIds:'9'},{agencyId:3},{providerId:10},{businessType:'tutoring'}])await load('/booking',{...params,...change});
 expect(api.get).toHaveBeenCalledTimes(5);
});

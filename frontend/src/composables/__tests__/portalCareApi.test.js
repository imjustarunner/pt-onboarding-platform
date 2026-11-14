import {expect,it,vi} from 'vitest';
import {defineComponent,ref} from 'vue';import{mount}from'@vue/test-utils';
import{usePortalCareApi}from'../usePortalCareApi';import api from'../../services/api';
vi.mock('../../services/api',()=>({default:{get:vi.fn(async()=>({data:{}})),post:vi.fn()}}));
it('retains the chosen family agency and service when a panel passes absent or stale props',async()=>{
 const care=ref({clientId:2271,agencyId:453,serviceId:1043});let scoped;
 const w=mount(defineComponent({setup(){scoped=usePortalCareApi();return()=>null}}),{global:{provide:{portalCareContext:care}}});
 await scoped.get('/guardian-portal/clients/2271/appointments',{params:{agencyId:undefined,serviceId:undefined,weekStart:'2030-01-01'}});
 expect(api.get.mock.calls.at(-1)[1].params).toEqual({agencyId:453,serviceId:1043,weekStart:'2030-01-01'});
 await scoped.get('/guardian-portal/clients/2271/appointments',{params:{agencyId:450,serviceId:1028}});
 expect(api.get.mock.calls.at(-1)[1].params).toEqual({agencyId:453,serviceId:1043});
 care.value={clientId:2271,agencyId:453,serviceId:1044};await scoped.get('/guardian-portal/clients/2271/appointments');
 expect(api.get.mock.calls.at(-1)[1].params.serviceId).toBe(1044);w.unmount();
});
it('does not attach another profile’s context to a request for a different child',async()=>{
 let scoped;const w=mount(defineComponent({setup(){scoped=usePortalCareApi();return()=>null}}),{global:{provide:{portalCareContext:ref({clientId:2271,agencyId:453,serviceId:1043})}}});
 await scoped.get('/guardian-portal/clients/9999/appointments',{params:{agencyId:450}});expect(api.get.mock.calls.at(-1)[1].params).toEqual({agencyId:450});w.unmount();
});

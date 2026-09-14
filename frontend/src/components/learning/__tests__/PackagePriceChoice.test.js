import {it,expect,vi} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';import Choice from '../PackagePriceChoice.vue';import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
it('requires provider selection and emits a server quote, then clears it when the package changes',async()=>{
 api.get.mockImplementation(async (_url,{params})=>({data:{services:[{id:3,name:'Virtual tutoring'}],providers:[{id:7,name:'Tutor'}],quote:params.providerId?{amountCents:35100,hourlyRateCents:5850}:null}}));
 const pkg={id:1,sessionCount:6,domainConfig:{pricing:{mode:'provider-discount',discountPercent:10}}};const w=mount(Choice,{props:{agencyId:6,clientId:4,pkg}});await flushPromises();
 expect(w.emitted('change').at(-1)).toEqual([null]);await w.findAll('select')[1].setValue(7);await flushPromises();expect(w.text()).toContain('$351 total');expect(w.emitted('change').at(-1)[0]).toMatchObject({providerId:7,tenantServiceId:3,quote:{amountCents:35100}});
 await w.setProps({pkg:{...pkg,id:2}});await flushPromises();expect(w.emitted('change').at(-1)).toEqual([null]);expect(w.text()).not.toContain('$351');w.unmount();
});

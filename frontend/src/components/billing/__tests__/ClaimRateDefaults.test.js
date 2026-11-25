import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Defaults from '../ClaimRateDefaults.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
let wrapper;
const schedule={revision:3,categories:[{key:'category_2',label:'Prelicensed'}],rows:[{serviceCode:'90791',rateCents:13500,sourceLabel:'Practice'},{serviceCode:'H0002',rateCents:null,sourceLabel:'Not set'}]};
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:schedule});api.post.mockResolvedValue({data:{...schedule,revision:4}});});
afterEach(()=>wrapper?.unmount());
it('loads scoped client defaults and saves the reason and current revision without correcting a claim',async()=>{
 wrapper=mount(Defaults,{props:{agencyId:2,claimId:7,context:{clientId:3,providerUserId:8,payerId:'PAYER'},serviceCodes:['90791']}});
 await flushPromises();await wrapper.get('select').setValue('client');await flushPromises();
 expect(api.get).toHaveBeenLastCalledWith('/medical-billing/fee-schedule/canonical',expect.objectContaining({params:expect.objectContaining({agencyId:2,scope:'client',clientId:3})}));
 await wrapper.get('input[placeholder]').setValue('Owner reviewed the current billed charge');
 await wrapper.get('.rate-row input').setValue('140.00');await wrapper.get('.rate-row button').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/medical-billing/fee-schedule/canonical',expect.objectContaining({scope:'client',clientId:3,revision:3,serviceCode:'90791',rateCents:14000,rateUnit:'unit'}),expect.anything());
 expect(wrapper.emitted('saved')[0][0]).toEqual({serviceCode:'90791',scope:'client'});
 expect(api.post).toHaveBeenCalledTimes(1);
});
it('keeps unknown rates blank and rejects saving them as an invented zero',async()=>{
 wrapper=mount(Defaults,{props:{agencyId:2,context:{},serviceCodes:['H0002']}});await flushPromises();
 expect(wrapper.get('.rate-row input').element.value).toBe('');await wrapper.get('input[placeholder]').setValue('Reviewed contract for this service');await wrapper.get('.rate-row button').trigger('click');await flushPromises();
 expect(api.post).not.toHaveBeenCalled();expect(wrapper.get('[role=alert]').text()).toContain('dollar amount');
});

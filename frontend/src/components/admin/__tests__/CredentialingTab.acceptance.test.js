import {expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
import Tab from '../CredentialingTab.vue';
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgency:{id:2},userAgencies:[{id:2,name:'Example agency'}]})}));
vi.mock('../../../services/api',()=>({default:{get:vi.fn(async url=>({data:String(url).endsWith('/insurances')?{insurances:[{id:1,name:'Medicaid'},{id:2,name:'Cigna'}]}:{credentialing:[{id:10,insurance_credentialing_definition_id:1,effective_date:'2020-01-01',acceptance:{eligible:true,reason:'Current recorded network participation.'}},{id:11,insurance_credentialing_definition_id:2,effective_date:null,acceptance:{eligible:false,reason:'An effective date has not been recorded.'}}]}}))}}));
vi.mock('../InsuranceDefinitionsPanel.vue',()=>({default:{template:'<div />'}}));
vi.mock('../InsuranceInteractionLog.vue',()=>({default:{template:'<div />'}}));
it('distinguishes saved payer checkmarks from current acceptance used by directory and Exchange counts',async()=>{const wrapper=mount(Tab,{props:{userId:785}});await flushPromises();expect(wrapper.text()).toContain('1 current own payer records · 1 saved records need review');expect(wrapper.text()).toContain('An effective date has not been recorded.');expect(wrapper.findAll('input[type=checkbox]').filter(i=>i.element.checked)).toHaveLength(2);expect(wrapper.findAll('.status-pill--active')).toHaveLength(1);expect(wrapper.text()).toContain('not confirmation of current acceptance');wrapper.unmount();});

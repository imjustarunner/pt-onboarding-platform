import {beforeEach,expect,it,vi} from 'vitest';import {mount,flushPromises} from '@vue/test-utils';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';import GuardianClientDetails from '../GuardianClientDetails.vue';
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:{fields:{full_name:'Legal full name',preferred_name:'Name they go by'},values:{full_name:'Susanne Example',preferred_name:'Susanne'},revision:'version1',requests:[]}});api.post.mockResolvedValue({data:{status:'pending'}});});
it('displays the recorded details and saves a distinct preferred name for review',async()=>{
 const w=mount(GuardianClientDetails,{props:{clientId:10}});await flushPromises();
 const inputs=w.findAll('input');expect(inputs[0].element.value).toBe('Susanne Example');await inputs[1].setValue('Susie');await w.find('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/clients/10/details',{values:{preferred_name:'Susie'},revision:'version1'},{skipGlobalLoading:true});expect(w.text()).toContain('saved for our support team to review');
});
it('allows a preferred-name update when the recorded birth date is missing, without submitting unchanged fields',async()=>{
 api.get.mockResolvedValue({data:{fields:{full_name:'Legal full name',preferred_name:'Name they go by',date_of_birth:'Date of birth'},values:{full_name:'Susanne Example',preferred_name:'Susanne',date_of_birth:''},revision:'version1',requests:[]}});
 const w=mount(GuardianClientDetails,{props:{clientId:10}});await flushPromises();
 expect(w.find('button[type=submit]').attributes('disabled')).toBeDefined();
 await w.findAll('input')[1].setValue('Susie');await w.find('form').trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/guardian-portal/clients/10/details',{values:{preferred_name:'Susie'},revision:'version1'},{skipGlobalLoading:true});
});
it('clears the old child details when switching clients',async()=>{
 const w=mount(GuardianClientDetails,{props:{clientId:10}});await flushPromises();api.get.mockImplementation(()=>new Promise(()=>{}));await w.setProps({clientId:11});expect(w.findAll('input')).toHaveLength(0);expect(w.text()).not.toContain('Susanne');
});
it('prevents duplicate updates while the first is pending',async()=>{
 api.get.mockResolvedValue({data:{fields:{full_name:'Legal full name'},values:{full_name:'Example'},revision:'v1',requests:[{id:1,status:'pending',createdAt:'2026-10-17',proposed:{full_name:'Updated'}}]}});
 const w=mount(GuardianClientDetails,{props:{clientId:10}});await flushPromises();expect(w.find('button[type=submit]').attributes('disabled')).toBeDefined();expect(w.text()).toContain('waiting for support review');
});

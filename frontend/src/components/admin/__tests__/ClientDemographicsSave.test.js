import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
import {createPinia} from 'pinia';
import ClientDetailPanel from '../ClientDetailPanel.vue';
const {get,put}=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get,put,post:vi.fn().mockResolvedValue({data:{}}),defaults:{baseURL:'/api'}}}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{organizationSlug:'auricwell-qa-demo'},query:{},path:'/auricwell-qa-demo/admin/clients'}),useRouter:()=>({push:vi.fn(),replace:vi.fn()})}));
let wrapper;
beforeEach(()=>{
 localStorage.clear();localStorage.setItem('user',JSON.stringify({id:1434,role:'support'}));
 get.mockReset().mockResolvedValue({data:[]});put.mockReset().mockResolvedValue({data:{}});
 window.alert=vi.fn();Element.prototype.scrollIntoView=vi.fn();
});
afterEach(()=>wrapper?.unmount());
async function render(){
 wrapper=shallowMount(ClientDetailPanel,{props:{client:{id:2277,agency_id:450,client_type:'clinical',status:'PACKET',client_status_id:null,full_name:'Jules QA',grade:'Test answer'},agencyId:450},global:{plugins:[createPinia()]}});await flushPromises();
 wrapper.vm.myAgencies=[{id:450}];await wrapper.vm.startEditOverview();await flushPromises();
}
it('saves demographics with no configured lifecycle statuses without demanding termination',async()=>{
 await render();wrapper.vm.overviewForm.grade='5';await wrapper.vm.saveOverview();
 expect(window.alert).not.toHaveBeenCalled();
 expect(put).toHaveBeenCalledWith('/clients/2277',expect.objectContaining({grade:'5th'}));
 expect(put.mock.calls[0][1]).not.toHaveProperty('termination_reason');
 expect(put.mock.calls[0][1]).not.toHaveProperty('client_status_id');
});
it('still requires a reason for an explicitly selected configured termination',async()=>{
 await render();wrapper.vm.overviewClientStatuses=[{id:7,status_key:'terminated'}];wrapper.vm.overviewForm.client_status_id='7';
 await wrapper.vm.saveOverview();expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('termination reason'));
 expect(put).not.toHaveBeenCalled();
});

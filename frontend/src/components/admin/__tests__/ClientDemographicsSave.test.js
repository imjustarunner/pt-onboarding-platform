import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
import {createPinia} from 'pinia';
import ClientDetailPanel from '../ClientDetailPanel.vue';
const {get,put}=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get,put,post:vi.fn().mockResolvedValue({data:{}}),defaults:{baseURL:'/api'}}}));
vi.mock('vue-router',()=>({onBeforeRouteLeave:vi.fn(),useRoute:()=>({params:{organizationSlug:'auricwell-qa-demo'},query:{},path:'/auricwell-qa-demo/admin/clients'}),useRouter:()=>({push:vi.fn(),replace:vi.fn()})}));
let wrapper;
beforeEach(()=>{
 localStorage.clear();localStorage.setItem('user',JSON.stringify({id:1434,role:'support'}));
 get.mockReset().mockResolvedValue({data:[]});put.mockReset().mockResolvedValue({data:{}});
 window.alert=vi.fn();Element.prototype.scrollIntoView=vi.fn();
});
afterEach(()=>wrapper?.unmount());
async function render(){
 wrapper=shallowMount(ClientDetailPanel,{props:{client:{id:2277,agency_id:450,client_type:'clinical',status:'PACKET',client_status_id:null,full_name:'Jules QA',grade:'Test answer'},agencyId:450},global:{plugins:[createPinia()],stubs:{ClientChartShell:{template:'<div><slot name="header" /><slot /></div>'}}}});await flushPromises();
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
it('opens the status editor from Received and saves the selected status without erasing imported sex or a root organization',async()=>{
 get.mockImplementation(async url=>({data:url==='/client-settings/client-statuses'?[{id:7,label:'Received',status_key:'received'},{id:11,label:'Current',status_key:'current'}]:[]}));
 await render();await wrapper.setProps({client:{...wrapper.props('client'),gender:'Male',organization_id:450,agency_name:'Example agency',client_status_id:7,client_status_key:'received',client_status_label:'Received'}});await flushPromises();
 wrapper.vm.cancelEditOverview();await wrapper.vm.onHubChange('overview');await flushPromises();
 const badge=wrapper.get('button[aria-label="Change client status"]');expect(badge.text()).toContain('Received');await badge.trigger('click');await flushPromises();
 expect(wrapper.vm.headerStatusOpen).toBe(true);expect(wrapper.vm.chartHub).toBe('overview');
 const editor=wrapper.findComponent({name:'ClientStatusEditor'});expect(editor.props('client')).toMatchObject({gender:'Male',organization_id:450,client_status_id:7});

});
it('shows None for no organization and preserves unsaved profile changes when the status badge is clicked',async()=>{
 await render();wrapper.vm.overviewForm.gender='female';await wrapper.get('button[aria-label="Change client status"]').trigger('click');await flushPromises();
 expect(wrapper.get('select[aria-label="Client organization"]').element.selectedOptions[0].textContent).toBe('None');expect(wrapper.get('select[aria-label="Client sex"]').element.value).toBe('female');
});

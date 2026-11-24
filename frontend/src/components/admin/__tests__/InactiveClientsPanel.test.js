import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('../../../composables/useClientDisplayMode',()=>({useClientDisplayMode:()=>({getClientLabel:client=>client.full_name})}));
import Panel from '../InactiveClientsPanel.vue';
let wrapper,clients;
beforeEach(()=>{
 vi.clearAllMocks();clients=[{id:51,agency_id:2,full_name:'Example Client',client_status_label:'Inactive',previous_providers:[{id:7,name:'Previous Provider'}]}];
 api.get.mockImplementation(async path=>({data:path.endsWith('/providers')?[{id:7,name:'Previous Provider'}]:{items:clients,total:clients.length}}));
 api.post.mockImplementation(async()=>{clients=[];return {data:{reactivated:true}};});
});
afterEach(()=>wrapper?.unmount());
it('shows previous providers, uses the inactive directory, and reopens the same enrollment for review',async()=>{
 wrapper=mount(Panel,{props:{agencyIds:[2]}});await flushPromises();
 expect(wrapper.text()).toContain('Previous providers: Previous Provider');expect(wrapper.text()).not.toContain('Inactive · Inactive');
 expect(api.get).toHaveBeenCalledWith('/clients/inactive',expect.objectContaining({params:expect.objectContaining({agency_id:2,includeArchived:true,demo:'exclude'})}));
 await wrapper.findAll('button').find(button=>button.text()==='Reopen intake for review').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/clients/51/reopen-enrollment',{}, {headers:{'X-Agency-Id':'2'}});expect(wrapper.text()).toContain('back in New Enrollments');expect(wrapper.emitted('reopened')[0][0].id).toBe(51);
});
it('filters on a historical provider with a server query',async()=>{
 wrapper=mount(Panel,{props:{agencyIds:[2]}});await flushPromises();await wrapper.get('[aria-label="Previous provider"]').setValue('7');await flushPromises();
 expect(api.get).toHaveBeenLastCalledWith('/clients/inactive',expect.objectContaining({params:expect.objectContaining({previous_provider_id:'7',page:1})}));
});
it('requires an explicit staff reason before reactivation and retains the original client',async()=>{
 wrapper=mount(Panel,{props:{agencyIds:[2]}});await flushPromises();await wrapper.findAll('button').find(b=>b.text()==='Reactivate client').trigger('click');
 const form=wrapper.get('[role="dialog"]');expect(form.get('button[type="submit"]').attributes('disabled')).toBeDefined();expect(api.post).not.toHaveBeenCalled();
 await form.get('textarea').setValue('Family requested a new course of services.');await form.trigger('submit');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/clients/51/reactivate',expect.objectContaining({reason:'Family requested a new course of services.',requestId:expect.any(String)}),{headers:{'X-Agency-Id':'2'}});
 expect(wrapper.text()).toContain('Example Client is active.');expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
});
it('closes an unfinished reactivation when the agency context changes',async()=>{
 wrapper=mount(Panel,{props:{agencyIds:[2]}});await flushPromises();await wrapper.findAll('button').find(b=>b.text()==='Reactivate client').trigger('click');
 await wrapper.setProps({agencyIds:[4]});await flushPromises();expect(wrapper.find('[role="dialog"]').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();
});

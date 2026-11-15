import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
import {createPinia} from 'pinia';
import ClientDetailPanel from '../ClientDetailPanel.vue';
const {get,put}=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get,put,post:vi.fn().mockResolvedValue({data:{}}),defaults:{baseURL:'/api'}}}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{},query:{},path:'/admin/clients'}),useRouter:()=>({push:vi.fn(),replace:vi.fn(),hasRoute:()=>false})}));
let wrapper;
beforeEach(()=>{localStorage.clear();localStorage.setItem('user',JSON.stringify({id:4,role:'support'}));get.mockReset().mockResolvedValue({data:[]});put.mockReset().mockResolvedValue({data:{}});window.alert=vi.fn();Element.prototype.scrollIntoView=vi.fn();});
afterEach(()=>wrapper?.unmount());
async function render(){wrapper=shallowMount(ClientDetailPanel,{props:{client:{id:7,agency_id:2,client_type:'clinical',school_year:'2026-2027',skills:true,status:'PACKET'},agencyId:2},global:{plugins:[createPinia()]}});await flushPromises();wrapper.vm.myAgencies=[{id:2}];await flushPromises();}
it('includes shared physical offices in both agency and account defaults',async()=>{
 await render();const offices=[{id:9,name:'Shared Windchime',agency_id:5,agencyIds:[2,5]},{id:10,name:'Unrelated',agency_id:6,agencyIds:[6]}];
 expect(wrapper.vm.officesForAgency(offices,2).map(office=>office.id)).toEqual([9]);
 get.mockImplementation(async url=>({data:url==='/offices'?offices:[]}));await wrapper.vm.loadTenantCatalog(2);await wrapper.vm.loadClientBookingDefaultsOptions();
 expect(wrapper.vm.officeOptionsForTenant(2).map(office=>office.id)).toEqual([9]);expect(wrapper.vm.clientOfficeOptions.map(office=>office.id)).toEqual([9]);
});
it('preserves education fields when saving a clinical chart',async()=>{
 await render();await wrapper.vm.startEditOverview();await wrapper.vm.saveOverview();expect(put).toHaveBeenCalledWith('/clients/7',expect.objectContaining({school_year:'2026-2027',skills:true}));
});
it('shows Assignments as the first overview action and uses agency wording',async()=>{
 await render();expect(wrapper.vm.profileQuickActions[0].id).toBe('assignments');expect(wrapper.vm.tabs.find(tab=>tab.id==='account').description).toContain('Assignments');
 wrapper.vm.onProfileQuickAction(wrapper.vm.profileQuickActions[0]);await flushPromises();expect(wrapper.vm.showPanel('assignments')).toBe(true);
});
it('opens the visible profile editor from the Assignments page',async()=>{
 await render();wrapper.vm.goChartSub('assignments');await flushPromises();await wrapper.vm.onProfileQuickAction({id:'edit'});await flushPromises();expect(wrapper.vm.chartHub).toBe('account');expect(wrapper.vm.effectiveHubSub).toBe('profile');expect(wrapper.vm.editingOverview).toBe(true);
});
it('intersects school roster candidates with the client agency provider catalog',async()=>{
 await render();get.mockImplementation(async url=>({data:url==='/provider-scheduling/assignments'?[{provider_user_id:20,provider_first_name:'Eligible'},{provider_user_id:99,provider_first_name:'Other agency'}]:url==='/provider-scheduling/affiliated-providers'?[{id:45,first_name:'Administrator'}]:url==='/office-clients/providers'?{providers:[{id:20,name:'Eligible'}]}:[]}));
 wrapper.vm.selectedAssignmentOrgId='8';await flushPromises();await wrapper.vm.fetchProviderOptions();expect(wrapper.vm.providerOptions.map(provider=>provider.id)).toEqual([20]);
});

it('shows a clinical program once without a competing Clinical chart badge',async()=>{
 wrapper=shallowMount(ClientDetailPanel,{props:{client:{id:7,agency_id:2,client_type:'clinical',organization_id:8,organization_name:'Counseling and Therapy',organization_type:'clinical'},agencyId:2},global:{plugins:[createPinia()],stubs:{ClientChartShell:{template:'<div><slot name="header" /></div>'}}}});await flushPromises();
 expect(wrapper.find('.cdp-pill--type').exists()).toBe(false);expect(wrapper.findAll('.cdp-pill').filter(pill=>pill.text().includes('Counseling and Therapy'))).toHaveLength(1);expect(wrapper.text()).not.toContain('Clinical program');
});
it('retains every assigned counselor in the overview care team',async()=>{
 await render();get.mockImplementation(async url=>({data:url==='/clients/7/service-enrollments'?{services:[{id:11,is_active:1,service_kind:'counseling',provider_user_id:20,providers:[{service_id:11,provider_user_id:20,provider_name:'First Counselor'},{service_id:12,provider_user_id:21,provider_name:'Second Counselor'}]}]}:[]}));await wrapper.vm.refreshOverviewProviders();expect(wrapper.vm.overviewProviders.map(provider=>provider.provider_user_id).sort()).toEqual([20,21]);
});

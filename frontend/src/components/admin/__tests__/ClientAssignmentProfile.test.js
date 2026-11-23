import ClientOverviewHub from '../clientChart/ClientOverviewHub.vue';
vi.mock('pdfjs-dist',()=>({GlobalWorkerOptions:{},getDocument:vi.fn()}));
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {shallowMount,flushPromises} from '@vue/test-utils';
import {createPinia} from 'pinia';
import ClientDetailPanel from '../ClientDetailPanel.vue';
const {get,put}=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get,put,post:vi.fn().mockResolvedValue({data:{}}),defaults:{baseURL:'/api'}}}));
vi.mock('vue-router',()=>({onBeforeRouteLeave:vi.fn(),useRoute:()=>({params:{},query:{},path:'/admin/clients'}),useRouter:()=>({push:vi.fn(),replace:vi.fn(),hasRoute:()=>false})}));
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
it('preserves existing education fields when there are no profile changes to save',async()=>{
 await render();await wrapper.vm.startEditOverview();await wrapper.vm.saveOverview();expect(put).not.toHaveBeenCalled();
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

it('does not present an ordinary counseling agency as a program enrollment',async()=>{
 wrapper=shallowMount(ClientDetailPanel,{props:{client:{id:7,agency_id:2,client_type:'clinical',organization_id:8,organization_name:'Counseling and Therapy',organization_type:'clinical'},agencyId:2},global:{plugins:[createPinia()],stubs:{ClientChartShell:{template:'<div><slot name="header" /></div>'}}}});await flushPromises();
 expect(wrapper.vm.clientTypeLabel).toBe('Clinical');expect(wrapper.findAll('.cdp-pill').filter(pill=>pill.text().includes('Counseling and Therapy'))).toHaveLength(0);expect(wrapper.text()).not.toContain('Clinical program');expect(wrapper.vm.overviewProgramLabel).toBe('');
});
it('retains every assigned counselor in the overview care team',async()=>{
 await render();get.mockImplementation(async url=>({data:url==='/clients/7/service-enrollments'?{services:[{id:11,is_active:1,service_kind:'counseling',provider_user_id:20,providers:[{service_id:11,provider_user_id:20,provider_name:'First Counselor'},{service_id:12,provider_user_id:21,provider_name:'Second Counselor'}]}]}:[]}));await wrapper.vm.refreshOverviewProviders();expect(wrapper.vm.overviewProviders.map(provider=>provider.provider_user_id).sort()).toEqual([20,21]);
});

it('keeps a genuine optional program enrollment in the chart header',async()=>{
 wrapper=shallowMount(ClientDetailPanel,{props:{client:{id:7,agency_id:2,client_type:'clinical',organization_id:8,organization_name:'Tutoring + Therapy',organization_type:'program'},agencyId:2},global:{plugins:[createPinia()],stubs:{ClientChartShell:{template:'<div><slot name="header" /></div>'}}}});await flushPromises();
 expect(wrapper.findAll('.cdp-pill').some(pill=>pill.text()==='Program · Tutoring + Therapy')).toBe(true);expect(wrapper.vm.overviewProgramLabel).toBe('Tutoring + Therapy');
});

it('treats a counseling program as an office organization and opens assignments from the profile clinician',async()=>{
 wrapper=shallowMount(ClientDetailPanel,{props:{client:{id:7,agency_id:2,client_type:'clinical',organization_id:8,organization_type:'clinical',organization_name:'Counseling and Psychotherapy',grade:'1',school_year:'2026-2027'},agencyId:2},global:{plugins:[createPinia()],stubs:{ClientChartShell:{template:'<div><slot name="header" /><slot /></div>'}}}});
 await flushPromises();wrapper.vm.myAgencies=[{id:2}];wrapper.vm.goChartSub('account');await flushPromises();
 const strip=wrapper.get('.cdp-school-profile-strip');expect(strip.text()).toContain('Organization');expect(strip.text()).not.toContain('Assigned day');expect(strip.text()).not.toContain('School year');
 await strip.findAll('button').find(button=>button.text()==='Not assigned').trigger('click');await flushPromises();
 expect(wrapper.get('[aria-label="Assign client provider"]').exists()).toBe(true);
 expect(wrapper.findComponent({name:'ClientServiceEnrollments'}).props('startAssigning')).toBe(true);
});
it.each([true,false])('enables direct overview assignment only for authorized editors (%s)',async canEdit=>{
 wrapper=shallowMount(ClientOverviewHub,{props:{clientId:7,canEdit,careTeamLabel:'Not assigned',glanceItems:[{label:'Primary clinician',value:'Not assigned',assignable:canEdit}]}});await flushPromises();
 const links=wrapper.findAll('button').filter(button=>button.text()==='Not assigned');
 expect(links).toHaveLength(canEdit?1:0);
 if(canEdit){await links[0].trigger('click');expect(wrapper.emitted('assign-provider')).toHaveLength(1);}
});

async function renderAssignments() {
 wrapper=shallowMount(ClientDetailPanel,{props:{client:{id:2111,agency_id:2,client_type:'clinical',organization_id:8,organization_type:'clinical',organization_name:'Counseling and Therapy'},agencyId:2},global:{plugins:[createPinia()],stubs:{ClientChartShell:{template:'<div><slot name="header" /><slot /></div>'}}}});
 await flushPromises();wrapper.vm.myAgencies=[{id:2},{id:3}];wrapper.vm.goChartSub('assignments');await flushPromises();
 wrapper.vm.clientAgencyAffiliations=[{agency_id:2,agency_name:'Inner Strength'}];
 wrapper.vm.affiliations=[{organization_id:8,organization_type:'clinical',organization_name:'Counseling and Therapy'}];
 wrapper.vm.affiliatedOrgsByAgencyId={'2':[{id:8,organization_type:'clinical',name:'Counseling and Therapy'}]};
 await flushPromises();
}
it('places services under the agency before defaults and omits nonexistent school, program, and learning controls',async()=>{
 await renderAssignments();const card=wrapper.get('.casg-tenant-card');
 expect(card.text()).toContain('Inner Strength');expect(card.text()).not.toContain('Schools');expect(card.text()).not.toContain('Programs');expect(card.text()).not.toContain('Learning');
 expect(card.findComponent({name:'ClientServiceEnrollments'}).props('agencyId')).toBe(2);
 expect(card.html().indexOf('client-service-enrollments-stub')).toBeLessThan(card.html().indexOf('Default office'));
 expect(wrapper.text()).not.toContain('School & program roster');expect(wrapper.vm.programAffiliationCount).toBe(0);
});
it('counts service providers and suggests their office without a school or program roster assignment',async()=>{
 await renderAssignments();wrapper.vm.onAgencyServicesLoaded(2,{services:[{id:11,is_active:1,service_kind:'counseling',provider_user_id:20,provider_name:'Sam Provider'},{id:12,is_active:1,service_kind:'tutoring',provider_user_id:20,provider_name:'Sam Provider'}]});await flushPromises();
 expect(wrapper.vm.serviceProviderCount).toBe(1);expect(wrapper.vm.primaryProviderLabel).toBe('Provider, Sam');expect(wrapper.vm.providerAssignments).toEqual([]);
 wrapper.vm.tenantOfficeOptionsByAgency={'2':[{id:9,agency_id:2}]};get.mockResolvedValue({data:{assigned:[{id:9,is_primary:true}]}});await wrapper.vm.suggestDefaultsFromPrimaryProviderForTenant(2);
 expect(get).toHaveBeenCalledWith('/users/20/office-assignments',expect.any(Object));expect(wrapper.vm.tenantBookingDraft(2).officeId).toBe('9');
});
it('shows another authorized agency’s real school links only under that agency',async()=>{
 await renderAssignments();wrapper.vm.clientAgencyAffiliations=[{agency_id:2,agency_name:'Inner Strength'},{agency_id:3,agency_name:'School agency'}];
 wrapper.vm.affiliatedOrgsByAgencyId={'2':[{id:8,organization_type:'clinical'}],'3':[{id:9,organization_type:'school',name:'Example school'}]};await flushPromises();
 const cards=wrapper.findAll('.casg-tenant-card');expect(cards).toHaveLength(2);expect(cards[0].text()).not.toContain('Schools');expect(cards[1].text()).toContain('Schools');
 expect(cards[1].findComponent({name:'ClientServiceEnrollments'}).props('agencyId')).toBe(3);
 expect(wrapper.vm.primaryServiceProviderForTenant(3)).toBeNull();
});
it('does not revive a stale roster provider after the office service reports no providers',async()=>{
 await renderAssignments();await wrapper.setProps({client:{id:2111,agency_id:2,client_type:'clinical',provider_id:99,provider_name:'Old Provider'}});await flushPromises();
 wrapper.vm.onAgencyServicesLoaded(2,{services:[]});await flushPromises();expect(wrapper.vm.primaryProviderLabel).toBe('Not assigned');expect(wrapper.vm.effectiveOverviewProviders).toEqual([]);
});

it('opens the temporary import tab after agency access loads and removes it only after explicit completion',async()=>{
 let complete=false;get.mockImplementation(async url=>({data:url.endsWith('/chart-setup')?{requiresRecordImport:true,setupComplete:false,recordsImportStatus:complete?'complete':'pending',demographicsOnFile:true,intakeOnFile:true,planOnFile:true}:[]}));
 await render();expect(wrapper.vm.tabs.map(tab=>tab.id).slice(0,2)).toEqual(['bring-up-to-date','overview']);expect(wrapper.vm.activeTab).toBe('bring-up-to-date');
 complete=true;await wrapper.vm.onRecordsImportDone();await flushPromises();expect(wrapper.vm.tabs[0].id).toBe('overview');expect(wrapper.vm.activeTab).toBe('overview');
});

it('selects the pending import tab immediately while permissions and private setup details are still loading',async()=>{
 let resolveSetup;const setup=new Promise(resolve=>{resolveSetup=resolve;});
 get.mockImplementation(url=>url.endsWith('/chart-setup')?setup:Promise.resolve({data:[]}));
 wrapper=shallowMount(ClientDetailPanel,{props:{client:{id:7,agency_id:2,client_type:'clinical',onboarding_docs_json:{recordsImport:{status:'pending'}}},agencyId:2},global:{plugins:[createPinia()],stubs:{ClientChartShell:{template:'<div><slot /></div>'}}}});
 await flushPromises();expect(wrapper.vm.tabs[0].id).toBe('bring-up-to-date');expect(wrapper.vm.activeTab).toBe('bring-up-to-date');
 expect(wrapper.text()).toContain('Loading this client’s saved import');expect(wrapper.findComponent({name:'ClientEhrBringUpToDatePanel'}).exists()).toBe(false);
 wrapper.vm.myAgencies=[{id:2}];await flushPromises();resolveSetup({data:{requiresRecordImport:true,recordsImportStatus:'pending',setupComplete:false}});await flushPromises();
 expect(wrapper.findComponent({name:'ClientEhrBringUpToDatePanel'}).exists()).toBe(true);
});

it('leaves completed import review immediately and offers the saved assignments without waiting for profile refresh',async()=>{
 get.mockImplementation(async url=>({data:url.endsWith('/chart-setup')?{requiresRecordImport:true,recordsImportStatus:'pending',setupComplete:false}:[]}));
 await render();let resolveRefresh;const refresh=new Promise(resolve=>{resolveRefresh=resolve;});
 get.mockImplementation(url=>url.endsWith('/chart-setup')?refresh:Promise.resolve({data:[]}));
 const done=wrapper.vm.onRecordsImportDone({assignmentDraftPending:true});await flushPromises();
 expect(wrapper.vm.activeTab).toBe('overview');expect(wrapper.vm.tabs[0].id).toBe('overview');expect(wrapper.vm.pendingAssignmentDraft).toBe(true);
 expect(wrapper.emitted('updated')).toContainEqual([{keepOpen:true}]);
 await wrapper.vm.openAssignmentDraft();await flushPromises();expect(wrapper.vm.showPanel('assignments')).toBe(true);expect(wrapper.vm.reviewAssignmentDraft).toBe(true);
 resolveRefresh({data:{requiresRecordImport:true,recordsImportStatus:'complete',setupComplete:false}});await done;
});

it('reopens selected areas of a completed native chart in the temporary first tab',async()=>{
 wrapper=shallowMount(ClientDetailPanel,{props:{client:{id:7,agency_id:2,client_type:'clinical',status:'CURRENT'},agencyId:2},global:{plugins:[createPinia()],stubs:{ClientChartShell:{template:'<div><slot name="header" /><slot /></div>'}}}});await flushPromises();wrapper.vm.myAgencies=[{id:2}];wrapper.vm.recordsImportSetup={requiresRecordImport:false,setupComplete:true,recordsImportStatus:'complete'};await flushPromises();expect(wrapper.vm.showRecordsImportTab).toBe(false);
 expect(wrapper.vm.canLaunchRecordUpdate).toBe(true);await wrapper.vm.onRecordsUpdateStarted({selectedSections:['contacts','insurance']});await flushPromises();
 expect(wrapper.vm.showRecordsImportTab).toBe(true);expect(wrapper.vm.tabs[0].id).toBe('bring-up-to-date');expect(wrapper.vm.chartHub).toBe('bring-up-to-date');
 expect(wrapper.findComponent({name:'ClientEhrBringUpToDatePanel'}).props('onlySections')).toEqual(['contacts','insurance']);
});

it('reloads the chart classification for a linked agency without showing the owning clinical type',async()=>{
 await render();
 get.mockImplementation(async(url,config)=>({data:url.endsWith('/chart-types')?{types:config.params.agencyId===3?['learning']:['clinical'],historicalTypes:[],schools:[],evidence:{}}:[]}));
 wrapper.vm.selectedAgencyId='3';await flushPromises();
 expect(get).toHaveBeenCalledWith('/clients/7/chart-types',expect.objectContaining({params:{agencyId:3},headers:{'X-Agency-Id':'3'}}));
 expect(wrapper.vm.activeTypes).toEqual(['learning']);
 expect(wrapper.vm.primaryRoleLabel).toBe('Primary learning provider');
});

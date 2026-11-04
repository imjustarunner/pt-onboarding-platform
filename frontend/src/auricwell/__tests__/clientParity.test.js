import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
const mocks=vi.hoisted(()=>({get:vi.fn(),push:vi.fn(),replace:vi.fn(),route:null}));
vi.mock('../../services/api',()=>({default:{get:mocks.get}}));
vi.mock('vue-router',()=>({useRoute:()=>mocks.route,useRouter:()=>({push:mocks.push,replace:mocks.replace})}));
vi.mock('../Records.vue',()=>({default:{template:'<div>Practice clients</div>'}}));
vi.mock('../../components/admin/IdentityReviewDrawer.vue',()=>({default:{template:'<div>Duplicate review</div>'}}));
import Clients from '../Clients.vue';
import {usesSharedScheduleApi,fullSuiteDestination} from '../sharedWorkspace';
let wrapper;
const rows=[{id:1,full_name:'First Person',initials:'FP',agency_id:2,agency_name:'Agency A',agency_slug:'agency-a',status_label:'Current',affiliations:[{id:5,name:'School A'}]},{id:2,full_name:'Second Person',initials:'SP',agency_id:3,agency_name:'Agency B',agency_slug:'agency-b',status_label:'Intake',provider_name:'Assigned Provider',affiliations:[]}];
const data={clients:rows,total:63,agencies:[{id:2,name:'Agency A',client_count:40},{id:3,name:'Agency B',client_count:23}]};
beforeEach(()=>{vi.clearAllMocks();mocks.route=reactive({params:{section:'clients'},query:{}});mocks.get.mockResolvedValue({data});mocks.push.mockImplementation(async to=>{if(to.query)mocks.route.query=to.query;});});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
const mountPage=async()=>{wrapper=mount(Clients,{props:{agency:{id:2,name:'Agency A'},actor:{id:7,role:'super_admin'},slug:'agency-a'},global:{stubs:{RouterLink:{props:['to'],template:'<a :data-to="JSON.stringify(to)"><slot/></a>'}}}});await flushPromises();};
it('loads all assigned agencies, shows their affiliations and preserves totals over the first page',async()=>{await mountPage();expect(mocks.get.mock.calls[0][1].params.filterAgencyId).toBe('all');expect(wrapper.text()).toContain('63 assigned clients');expect(wrapper.text()).toContain('Agency B');expect(wrapper.text()).toContain('School A');expect(wrapper.text()).toContain('Page 1 of 2');expect(wrapper.findAll('tbody tr')).toHaveLength(2);});
it('filters and sorts on the server, resets pages, and clears a pinned preview on navigation',async()=>{await mountPage();await wrapper.get('[aria-label="Pin preview for Second Person"]').trigger('click');expect(wrapper.get('[role=complementary]').text()).toContain('Assigned Provider');await wrapper.findAll('select')[0].setValue('3');await flushPromises();expect(mocks.get.mock.calls.at(-1)[1].params).toMatchObject({filterAgencyId:'3',page:1});expect(wrapper.find('[role=complementary]').exists()).toBe(false);await wrapper.findAll('select')[1].setValue('agency');await flushPromises();expect(mocks.get.mock.calls.at(-1)[1].params.sort).toBe('agency');});
it('uses the shared hover preview and opens the chart in its owning agency',async()=>{await mountPage();vi.useFakeTimers();await wrapper.findAll('tbody tr')[1].trigger('mouseenter');vi.advanceTimersByTime(420);await wrapper.vm.$nextTick();expect(wrapper.get('[role=complementary]').text()).toContain('Second Person');await wrapper.get('.cm-drawer-open-btn').trigger('click');expect(mocks.push).toHaveBeenLastCalledWith({path:'/agency-b/clients',query:{clientId:'2'}});});
it('does not let an older directory response replace a new agency selection',async()=>{let finish;mocks.get.mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));await mountPage();mocks.route.query={filterAgencyId:'3'};await flushPromises();finish({data:{...data,clients:[{id:99,full_name:'Old result'}]}});await flushPromises();expect(wrapper.text()).not.toContain('Old result');});
it('uses standard authenticated schedule APIs only in the shared scheduler, retaining other practice boundaries',()=>{for(const section of ['appointments','my-schedule']){const route={params:{section}};expect(usesSharedScheduleApi(route,'/users/7/schedule-summary')).toBe(true);expect(usesSharedScheduleApi(route,'/auricwell-preview/notifications')).toBe(false);expect(usesSharedScheduleApi(route,'/portal-admin/clients/1/accounts')).toBe(false);}for(const section of ['overview','clients','billing','documentation'])expect(usesSharedScheduleApi({params:{section}},'/users/7/schedule-summary')).toBe(false);});

it('hands full-suite scheduler links to the main entry while preserving AuricWell chart and calendar links',()=>{
 const from={params:{section:'appointments'}};
 expect(fullSuiteDestination({params:{organizationSlug:'agency-a',section:'clinical-forms'},fullPath:'/agency-a/clinical-forms?clientId=3'},from)).toBe('/agency-a/clinical-forms?clientId=3');
 expect(fullSuiteDestination({name:'full-suite',fullPath:'/agency-a/admin/clients/3'},from)).toBe('/agency-a/admin/clients/3');
 for(const section of ['clients','appointments','my-schedule','portal'])expect(fullSuiteDestination({params:{organizationSlug:'agency-b',section},fullPath:`/agency-b/${section}`},from)).toBeNull();
});

it('loads the shared care snapshot on preview and discards the response after it closes',async()=>{
 await mountPage();let finish;mocks.get.mockImplementationOnce(()=>new Promise(resolve=>finish=resolve));
 await wrapper.get('[aria-label="Pin preview for Second Person"]').trigger('click');await flushPromises();
 expect(mocks.get).toHaveBeenLastCalledWith('/auricwell-preview/my-clients/2/preview');expect(wrapper.text()).toContain('Loading care summary');
 await wrapper.get('[aria-label="Close"]').trigger('click');finish({data:{plan:{title:'Closed chart',goals:[]}}});await flushPromises();expect(wrapper.text()).not.toContain('Closed chart');
});

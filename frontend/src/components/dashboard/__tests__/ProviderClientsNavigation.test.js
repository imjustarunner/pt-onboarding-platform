import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {reactive,defineComponent,onMounted} from 'vue';
import {shallowMount,flushPromises} from '@vue/test-utils';
import {createRouter,createMemoryHistory} from 'vue-router';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),agency:null,empty:false,failCaseload:false,schools:false}));
vi.mock('../../../services/api',()=>({default:m}));vi.mock('../../../store/agency',()=>({useAgencyStore:()=>m.agency}));vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:9,role:'provider',has_provider_access:true}})}));
vi.mock('../../admin/ClientDetailPanel.vue',()=>({default:{template:'<div />'}}));vi.mock('../../admin/clientChart/ClientEhrBringUpToDatePanel.vue',()=>({default:{template:'<div />'}}));
import View from '../ProviderClientsTab.vue';
const Waitlist=defineComponent({name:'ProviderEnrollmentWaitlist',props:['agencyIds','initiallyExpanded'],emits:['loaded'],setup(_, {emit}){onMounted(()=>emit('loaded',{count:0,complete:true}));},template:'<section data-waitlist>Waitlist requests</section>'});
let wrapper;
const agencies=[{id:2,name:'Agency A',organization_type:'clinical'},{id:6,name:'Agency B',organization_type:'learning'}];
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();m.empty=false;m.failCaseload=false;m.schools=false;m.agency=reactive({currentAgency:agencies[0],userAgencies:[agencies[0]]});m.post.mockResolvedValue({data:{summaries:[]}});
 m.get.mockImplementation(async(url,config={})=>{
  if(url==='/users/me/agencies')return {data:agencies};
  if (url === '/clients') {
    if (m.failCaseload) throw Error('Could not load caseload');
    return { data: m.empty ? [] : agencies.map((agency, index) => ({
      id: agency.id * 10, agency_id: agency.id, agency_name: agency.name,
      initials: index === 0 ? 'AAA' : 'BBB', status: 'ACTIVE', client_type: 'clinical'
    })) };
  }
  if(url.endsWith('/assigned-schools'))return {data:m.schools?[{schoolOrganizationId:Number(config.params.agencyId)*10,name:'School '+config.params.agencyId}]:[]};
  if(url.includes('/my-roster'))return {data:[{id:Number(config.headers['X-Agency-Id'])*100,agency_id:Number(config.headers['X-Agency-Id']),initials:'SCHOOL',status:'CURRENT'}]};
  if(url==='/client-exchange/counts')return {data:m.empty?{matches:0,requestable:0}:Number(config.params.agencyId)===2?{matches:2,requestable:4}:{matches:1,requestable:2}};
  if(url==='/kiosk/client-checkins/counts')return {data:{unassigned:m.empty?0:5}};
  return {data:[]};
 });
});
afterEach(()=>wrapper?.unmount());
async function render(){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/dashboard',component:{template:'<div />'}}]});await router.push('/dashboard?tab=clients&clients=all');await router.isReady();wrapper=shallowMount(View,{global:{plugins:[router],stubs:{ProviderEnrollmentWaitlist:Waitlist}}});await flushPromises();return router;}
const tab=label=>wrapper.findAll('[role=tab]').find(t=>t.text().includes(label));
it('renders the caseload from one request before memberships and badges finish', async () => {
  const original = m.get.getMockImplementation();
  let resolveMemberships;
  const memberships = new Promise(resolve => { resolveMemberships = resolve; });
  m.get.mockImplementation((url, ...args) => url === '/users/me/agencies' ? memberships : original(url, ...args));
  await render();
  expect(m.get.mock.calls.filter(([url]) => url === '/clients')).toEqual([
    ['/clients', { params: { caseload: 'mine', includeServiceContext: 1 }, skipGlobalLoading: true }]
  ]);
  expect(wrapper.text()).toContain('AAA');
  expect(wrapper.text()).toContain('BBB');
  expect(m.get.mock.calls.some(([url]) => url === '/client-exchange/counts')).toBe(false);
  resolveMemberships({ data: agencies });
  await flushPromises();
});
it('places Exchange matches left and requestable listings right and counts only unassigned check-ins',async()=>{
 await render();expect(tab('Client Exchange').get('.pct-cat-badge--left').text()).toBe('3');expect(tab('Client Exchange').get('.pct-cat-badge:not(.pct-cat-badge--left)').text()).toBe('6');expect(tab('Recurring check-ins').get('.pct-cat-badge').text()).toBe('5');expect(tab('New Clients').find('.pct-cat-badge').exists()).toBe(false);expect(tab('My waitlist').find('.pct-cat-badge').exists()).toBe(false);
 wrapper.findComponent(Waitlist).vm.$emit('loaded',{count:4,complete:true});await flushPromises();expect(tab('My waitlist').get('.pct-cat-badge').text()).toBe('4');
 await tab('My waitlist').trigger('click');await flushPromises();expect(wrapper.findComponent(Waitlist).isVisible()).toBe(true);expect(wrapper.find('.pct-page-header').exists()).toBe(false);
});
it('hides every numeric badge when all queues and client lists are empty',async()=>{
 m.empty=true;await render();expect(wrapper.findAll('.pct-cat-badge')).toHaveLength(0);expect(tab('All Clients').exists()).toBe(true);
});
it('shows a request error when the caseload could not load', async () => {
  m.failCaseload = true;
  await render();
  expect(wrapper.text()).toContain('Could not load caseload');
  expect(wrapper.text()).not.toContain('No clients assigned');
});

it('keeps school actions in the school’s agency when the dashboard brand belongs to another agency',async()=>{
 m.schools=true;const router=await render();await router.push('/dashboard?tab=clients&clients=school&schoolId=60');await flushPromises();
 const grid=wrapper.findComponent({name:'ClientListGrid'});expect(grid.props('organizationId')).toBe(60);expect(grid.props('parentAgencyId')).toBe(6);
 expect(m.get.mock.calls.filter(([url])=>url==='/school-portal/60/my-roster').every(([,config])=>config.headers['X-Agency-Id']==='6')).toBe(true);
 await wrapper.get('select.pct-control').setValue('all');await flushPromises();expect(grid.props('parentAgencyId')).toBeNull();
});

it('filters the caseload by agency and exposes appointment sorting with distinct chart and quick-view actions',async()=>{
 m.post.mockImplementation(async(url,body)=>url==='/clients/caseload-session-dates'?{data:{items:body.clientIds.map(clientId=>({clientId,nextAt:body.agencyId===2?'2026-11-25T12:00:00Z':'2026-11-24T12:00:00Z',lastAt:null,lastCompletedAt:null}))}}:{data:{summaries:[]}});
 await render();
 const headings=wrapper.findAll('th').map(th=>th.text());
 expect(headings).toContain('Agency ↕');expect(headings.some(text=>text.includes('Next appointment'))).toBe(true);
 expect(wrapper.text()).not.toContain('Clinical ·');
 await wrapper.get('.pct-agency-filter select').setValue('6');await flushPromises();
 const rows=wrapper.findAll('tbody tr');
 expect(rows).toHaveLength(1);expect(rows[0].text()).toContain('BBB');expect(rows[0].text()).not.toContain('AAA');
 await rows[0].find('.pct-client-link').trigger('click');await flushPromises();
 expect(wrapper.findComponent({name:'ClientQuickView'}).exists()).toBe(true);
 expect(rows[0].text()).toContain('Open chart');
});

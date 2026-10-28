import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import api from '../../../services/api.js';
import ProviderClientsTab from '../ProviderClientsTab.vue';
vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn(), post: vi.fn().mockResolvedValue({data:{summaries:[]}}) } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: {id:2}, userAgencies: [] }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: {id:1,role:'admin'} }) }));
vi.mock('../../school/ClientListGrid.vue', () => ({ default: { name: 'ClientListGrid', props: ['organizationId', 'rosterProviderUserId'], template: '<div />' } }));
vi.mock('../../provider/ProviderEnrollmentWaitlist.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../kiosk/ClientCheckinSubmissions.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../clientExchange/PostClientToExchangeButton.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../kiosk/ClientFeedbackSummary.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../kiosk/CaseloadFeedbackSummary.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../admin/ClientDetailPanel.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../referralDirectory/ReferralDirectoryPanel.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../clientExchange/ClientExchangePanel.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../admin/EhrPatientListImportModal.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../clientExchange/NewReferralModal.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../admin/clientChart/ClientEhrBringUpToDatePanel.vue', () => ({ default: { template: '<div />' } }));
let wrapper;
const schools = [{schoolOrganizationId:10,name:'North School'},{schoolOrganizationId:20,name:'South School'}];
const rosters = {10:[{id:100,status:'active',initials:'AB'},{id:101,status:'terminated',initials:'CD'}],20:[{id:100,status:'active',initials:'AB'},{id:102,status:'active',initials:'EF'}]};
beforeEach(() => {
  api.get.mockImplementation(async url => {
    if(url.endsWith('assigned-schools'))return {data:schools};
    const school=url.match(/school-portal\/(\d+)\/my-roster/);
    if(school)return {data:rosters[school[1]]};
    return {data:[]};
  });
});
afterEach(() => {wrapper?.unmount();vi.clearAllMocks();});
async function render(query = 'tab=clients'){
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/admin/users/:userId',component:{template:'<div />'}}]});
  await router.push(`/admin/users/12?${query}`);await router.isReady();
  wrapper=shallowMount(ProviderClientsTab,{props:{subjectUserId:12,subjectAgencyId:2,profileEmbed:true},global:{plugins:[router]}});
  await flushPromises();return router;
}
it('shows counts for each school and drills into the selected provider roster',async()=>{
  const router=await render();
  const cards=wrapper.findAll('.pct-school-card');
  expect(cards.map(card=>card.text())).toEqual(['North School1 client','South School2 clients']);
  const schoolTab=wrapper.findAll('[role=tab]').find(tab=>tab.text().includes('By School'));
  expect(schoolTab.text()).toContain('2'); // Shared client counted once across both schools.
  await cards[1].trigger('click');await flushPromises();
  expect(router.currentRoute.value.query).toMatchObject({tab:'clients',clients:'school'});
  expect(wrapper.findComponent({name:'ClientListGrid'}).props()).toMatchObject({organizationId:20,rosterProviderUserId:12});
  expect(api.get.mock.calls.filter(([url])=>url.includes('my-roster')).every(([,options])=>options.params.providerUserId===12)).toBe(true);
});
it('hides the school view when the provider has no school assignments or school clients',async()=>{
  api.get.mockResolvedValue({data:[]});await render();
  expect(wrapper.find('.pct-school-overview').exists()).toBe(false);
  expect(wrapper.findAll('[role=tab]').some(tab=>tab.text().includes('By School'))).toBe(false);
});
it('does not report a failed roster request as zero clients',async()=>{
  const original=api.get.getMockImplementation();
  api.get.mockImplementation((url,...args)=>url.includes('/20/my-roster')?Promise.reject(new Error('offline')):original(url,...args));
  await render();expect(wrapper.findAll('.pct-school-card')[1].text()).toContain('Roster unavailable');
});

it('opens an assignment link at its school and restores filters on route navigation', async () => {
  const router = await render('tab=clients&clients=school&schoolId=20');
  expect(wrapper.findComponent({name:'ClientListGrid'}).props('organizationId')).toBe(20);
  expect(wrapper.findAll('.pct-school-card')[1].attributes('aria-pressed')).toBe('true');
  await router.push('/admin/users/12?tab=clients&clients=school&schoolId=10'); await flushPromises();
  expect(wrapper.findComponent({name:'ClientListGrid'}).props('organizationId')).toBe(10);
  await wrapper.get('select.pct-control').setValue('all'); await flushPromises();
  expect(router.currentRoute.value.query.schoolId).toBeUndefined();
  expect(wrapper.findComponent({name:'ClientListGrid'}).props('organizationId')).toBeNull();
});
it('does not use an assignment link to request a school outside the provider’s assigned list', async () => {
  await render('tab=clients&clients=school&schoolId=9999');
  expect(wrapper.findComponent({name:'ClientListGrid'}).exists()).toBe(false);
  expect(wrapper.get('[role=alert]').text()).toContain('not available for this provider');
  expect(api.get.mock.calls.some(([url])=>url.includes('/9999/'))).toBe(false);
});

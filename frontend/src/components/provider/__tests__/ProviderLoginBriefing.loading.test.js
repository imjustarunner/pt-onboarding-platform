import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import Briefing from '../ProviderLoginBriefingModal.vue';
import { useAuthStore } from '../../../store/auth';
import { useAgencyStore } from '../../../store/agency';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
let wrapper;
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks(); });
afterEach(() => wrapper?.unmount());
async function mount(user = {}) {
  const pinia = createPinia(); setActivePinia(pinia);
  useAuthStore().user = { id: 7, role: 'provider', firstName: 'Test', ...user };
  const agency = { id: 2, slug: 'itsco', name: 'ITSCO', organization_type: 'agency' };
  const store = useAgencyStore(); store.userAgencies = [agency]; store.agencies = [agency]; store.currentAgency = agency;
  vi.spyOn(store, 'setCurrentAgency').mockImplementation(() => {});
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/dashboard', component: { template: '<div />' } }] });
  await router.push('/dashboard');
  wrapper = shallowMount(Briefing, { props: { loginTrigger: 1 }, global: { plugins: [pinia, router], stubs: { teleport: true } } });
  await flushPromises();
}

it('shows the schedule and Enter Dashboard while unrelated updates are still waiting', async () => {
  api.get.mockImplementation(url => url.endsWith('/schedule-summary')
    ? Promise.resolve({ data: { scheduleEvents: [] } }) : new Promise(() => {}));
  await mount();
  expect(api.get.mock.calls.some(([url]) => url === '/users/7/schedule-summary')).toBe(true);
  expect(wrapper.get('.briefing-layout').element.closest('template')).toBeNull();
  expect(wrapper.text()).toContain('Nothing scheduled on your calendar today.');
  expect(wrapper.text()).toContain('Checking your updates.');
  expect(wrapper.text()).not.toContain('You’re all caught up');
  expect(wrapper.find('.enter-dashboard').attributes('disabled')).toBeUndefined();
  await wrapper.find('.briefing-close').trigger('click');
  expect(wrapper.find('.briefing-overlay').exists()).toBe(false);
});

it('never describes a failed schedule as empty or shows an all-clear after a failed check', async () => {
  api.get.mockRejectedValue(new Error('offline'));
  await mount();
  expect(wrapper.find('dashboard-card-status-stub').attributes('error')).toContain('schedule could not be loaded');
  expect(wrapper.text()).toContain('Some updates could not be checked');
  expect(wrapper.text()).not.toContain('Nothing scheduled');
  expect(wrapper.text()).not.toContain('You’re all caught up');
  expect(wrapper.text()).not.toContain('0On your calendar today');
});

it.each([
  [{ available: false, reason: 'outside_fall_window' }, false],
  [{ available: true, showPulse: false, isArchivedView: true }, false],
  [{ available: true, showPulse: true, dismissed: true }, false],
  [{ available: true, showPulse: true }, true]
])('matches the Fall Update reminder status %j', async (status, visible) => {
  api.get.mockImplementation(async url => ({
    data: url.endsWith('/provider-year-update/me/status') ? status : {}
  }));
  await mount();
  expect(wrapper.text().includes('Complete your Provider Fall Update')).toBe(visible);
});

it('shows the main work areas and live counts', async () => {
  api.get.mockImplementation(async url => ({data:
    url.endsWith('/schedule-summary') ? {scheduleEvents:[]} :
    url === '/clinical-notes/work-queue' ? {items:[{id:1,agencyId:2,clientName:'Example Client',status:'not_started'}]} :
    url === '/me/notes-to-sign/count' ? {count:2} :
    url === '/tasks' ? [{id:1,title:'Review my work',status:'pending'}] :
    url === '/messages/dashboard-summary' ? {cards:{unread:3},priority:[]} :
    url === '/notifications/counts' ? {2:4} : []
  }));
  await mount();
  for(const text of ['Assigned tasks','Notes to complete','Example Client','Missed messages','Notifications']) expect(wrapper.text()).toContain(text);
  expect(wrapper.get('.briefing-layout').element.closest('template')).toBeNull();
});

it('omits the supervisor signing queue for ordinary providers and shows honest unread message text', async () => {
  api.get.mockResolvedValue({data:{cards:{unread:4},priority:[]}});
  await mount();
  expect(wrapper.text()).not.toContain('Notes to sign');
  expect(api.get.mock.calls.some(([url]) => url === '/me/notes-to-sign/count')).toBe(false);
  expect(wrapper.text()).toContain('4 unread messages. Open messages to review them.');
});
it('shows the signing queue for providers with supervisor privileges', async () => {
  api.get.mockResolvedValue({data:{count:2}});
  await mount({has_supervisor_privileges:true});
  expect(wrapper.text()).toContain('Notes to sign');
  expect(api.get.mock.calls.some(([url]) => url === '/me/notes-to-sign/count')).toBe(true);
});

it('does not show an all-clear when notification previews are unavailable but the count is positive',async()=>{
 api.get.mockImplementation(async url=>({data:url==='/notifications/counts'?{2:4}:[]}));await mount();
 expect(wrapper.text()).toContain('4 new. View all notifications to review.');
});

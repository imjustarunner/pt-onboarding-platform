import { shallowMount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

const m = vi.hoisted(() => ({ get: vi.fn(), replace: vi.fn(), push: vi.fn(), route: null }));
vi.mock('../../../services/api', () => ({ default: { get: m.get, post: vi.fn() } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 10, role: 'super_admin' } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 }, agencies: [] }) }));
vi.mock('vue-router', () => ({ useRoute: () => m.route, useRouter: () => ({ push: m.push, replace: m.replace }) }));
import SupervisionModal from '../SupervisionModal.vue';

const assignment = { supervisee_id: 20, agency_id: 2, supervisee_first_name: 'DEMO', supervisee_last_name: 'Provider' };
const session = { id: 1, startAt: '2026-10-20T16:00:00Z', status: 'FINALIZED', totalSeconds: 0 };
let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  m.route = reactive({ query: {}, params: { organizationSlug: 'demo' } });
  m.replace.mockImplementation(async ({ query }) => { m.route.query = query; });
  m.get.mockImplementation(async url => ({ data:
    url.includes('supervisor-assignments') ? [assignment] :
    url.endsWith('/sessions') ? { sessions: [session], hasMore: false } :
    url.endsWith('/hours-summary') ? { ok: true, totalHours: 2 } :
    url.endsWith('/schedule-summary') ? { supervisionSessions: [] } :
    url.includes('/clients/for-user') ? [{ id: 55, initials: 'DQ', organization_name: 'Demo school', status: 'ACTIVE' }] :
    url.endsWith('/affiliated-portals') ? { portals: [] } :
    url.endsWith('/pending-clients') ? { results: [] } :
    url.endsWith('/unified-checklist') ? { trainingItems: [{ id: 3, title: 'Demo training' }] } :
    url.endsWith('/workspace') ? { items: [{ id: 6, document_title: 'Demo policy' }], total: 1 } : {}
  }));
});
afterEach(() => wrapper?.unmount());
async function open() {
  wrapper = shallowMount(SupervisionModal, { global: { stubs: { RouterLink: true, SuperviseeSessionHistory: true, SuperviseeWorkPanel: true } } });
  await flushPromises();
  await wrapper.find('.supervision-card').trigger('click');
  await flushPromises();
  return wrapper.vm.$.setupState;
}

it('uses real section buttons, leaves settings and training lazy, and keeps reads quiet', async () => {
  const state = await open();
  expect(wrapper.find('.supervision-jump-links').exists()).toBe(false);
  expect(wrapper.find('.workspace-nav-button.active').text()).toContain('Overview');
  expect(m.get.mock.calls.every(([, config]) => config.skipGlobalLoading === true)).toBe(true);
  expect(m.get.mock.calls.some(([url]) => /unified-checklist|user-documents|documentation-policy|\/artifacts$/.test(url))).toBe(false);
  const card = wrapper.findAll('.overview-fact').find(node => node.text().includes('Needs attendance review'));
  expect(card.find('strong').text()).toBe('1');
  state.selectSection('training'); await flushPromises();
  expect(wrapper.find('supervisee-session-history-stub').exists()).toBe(true);
  state.selectSection('overview'); await flushPromises();
  state.selectSection('training'); await flushPromises();
  expect(m.get.mock.calls.filter(([url]) => url.endsWith('/unified-checklist'))).toHaveLength(1);
  expect(m.route.query).toMatchObject({ supervisionProvider: '20', supervisionAgency: '2', supervisionSection: 'training' });
  expect(state.chatsLink).toContain('tab=chats');
  expect(state.chatsLink).toContain('openChatWith=20');
});

it('restores only an authorized listed supervisee and their selected section', async () => {
  m.route.query = { supervisionProvider: '20', supervisionAgency: '2', supervisionSection: 'clients' };
  wrapper = shallowMount(SupervisionModal, { global: { stubs: { SuperviseeSessionHistory: true, SuperviseeWorkPanel: true, teleport: true, RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } });
  await flushPromises();
  expect(wrapper.find('.workspace-nav-button.active').text()).toContain('Caseload');
  await wrapper.find('.client-quick-button').trigger('click'); await flushPromises();
  expect(wrapper.find('.supervision-client-quick-view').text()).toContain('Open full client record');
  expect(wrapper.find('.client-full-link').attributes('href')).toBe('/demo/admin/clients/55');
  wrapper.unmount();
  m.route.query = { supervisionProvider: '999', supervisionAgency: '2', supervisionSection: 'clients' };
  wrapper = shallowMount(SupervisionModal, { global: { stubs: { SuperviseeSessionHistory: true, SuperviseeWorkPanel: true, teleport: true, RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } }); await flushPromises();
  expect(wrapper.find('.supervision-workspace').exists()).toBe(false);
  expect(m.get.mock.calls.some(([url]) => url.includes('/999/'))).toBe(false);
});

it('discards an old supervisee response after the user changes selections', async () => {
  let resolveOld;
  const initial = m.get.getMockImplementation();
  m.get.mockImplementation((url, config) => url === '/clients/for-user/20' ? new Promise(resolve => { resolveOld = resolve; }) : initial(url, config));
  const state = await open();
  state.selectedSupervisee = { ...assignment, supervisee_id: 21 };
  await flushPromises();
  resolveOld({ data: [{ id: 999, initials: 'OLD' }] }); await flushPromises();
  expect(state.clientsList.some(client => client.id === 999)).toBe(false);
});

it('keeps failed counts unknown instead of presenting zero clients or sessions', async () => {
  const initial = m.get.getMockImplementation();
  m.get.mockImplementation((url, config) => url.includes('/clients/for-user/') || url.endsWith('/sessions') ? Promise.reject(new Error('Unavailable')) : initial(url, config));
  const state = await open();
  expect(state.sectionCount('clients')).toBeNull();
  expect(state.sectionCount('sessions')).toBeNull();
  expect(wrapper.find('.overview-fact strong').text()).toBe('—');
});

it('coalesces simultaneous correction refreshes into one set of reads', async () => {
  const state = await open();
  const initial = m.get.getMockImplementation();
  let finish;
  m.get.mockClear();
  m.get.mockImplementation((url, config) => url.endsWith('/sessions') ? new Promise(resolve => { finish = resolve; }) : initial(url, config));
  const first = state.refreshSupervisionLog();
  const second = state.refreshSupervisionLog();
  expect(m.get.mock.calls.filter(([url]) => url.endsWith('/sessions'))).toHaveLength(1);
  finish({ data: { sessions: [session], hasMore: false } });
  await Promise.all([first, second]);
  expect(m.get.mock.calls.filter(([url]) => url.endsWith('/dashboard-summary'))).toHaveLength(1);
});

it('retains loaded history pages on refresh and uses complete-history attendance facts', async () => {
  const state = await open();
  state.sessionHistory = Array.from({ length: 60 }, (_, id) => ({ ...session, id: id + 1 }));
  const initial = m.get.getMockImplementation();
  m.get.mockClear();
  m.get.mockImplementation((url, config) => url.endsWith('/sessions') ? Promise.resolve({ data: {
    sessions: Array.from({ length: config.params.page === 1 ? 50 : 10 }, (_, index) => ({ ...session, id: (config.params.page - 1) * 50 + index + 1 })),
    hasMore: config.params.page === 1,
    attendanceSummary: { total: 80, attended: 60, missed: 10, excused: 3, cancelled: 4, unknown: 3 }
  } }) : initial(url, config));
  await state.refreshSupervisionLog(); await flushPromises();
  expect(state.sessionHistory).toHaveLength(60);
  expect(state.sectionCount('sessions')).toBe(80);
  expect(wrapper.find('.fact-red strong').text()).toBe('10');
  expect(m.get.mock.calls.filter(([url]) => url.endsWith('/sessions'))).toHaveLength(2);
});

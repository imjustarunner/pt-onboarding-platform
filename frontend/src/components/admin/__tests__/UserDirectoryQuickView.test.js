import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import UserDirectoryQuickView from '../UserDirectoryQuickView.vue';
import UserOverviewTab from '../UserOverviewTab.vue';

const mocks = vi.hoisted(() => ({ get: vi.fn(), actor: { role: 'super_admin' } }));
vi.mock('../../../services/api', () => ({ default: { get: mocks.get } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: mocks.actor }) }));
let wrapper;
const overview = {
  user: { id: 1, first_name: 'Ana', last_name: 'Finch', title: 'Counselor', employee_id: 'EMP-0046', email: 'ana@example.test' },
  accountInfo: { serviceFocus: 'School counseling', phoneNumber: '555-0100', homeCity: 'Denver', homeState: 'CO' },
  lifecycle: { summary: { status: 'active', firstClientDate: '2024-02-29' }, dates: {} },
  tasks: { recentDocs: [], upcomingOverdue: [] },
  supervisors: [{ supervisor_first_name: 'Alex', supervisor_last_name: 'Lee', is_primary: true }],
  acceptedInsurances: [{ id: 1, name: 'Aetna' }], notes: [], recentActivity: [],
};
const mountPanel = (extra = {}) => mount(UserDirectoryQuickView, {
  props: { user: { id: 1, first_name: 'Ana', last_name: 'Finch', role: 'provider', provider_credential: 'LPCC' }, agencyId: 7, agencyLabel: 'Test Agency', profilePath: '/admin/users/1', canArchive: true, ...extra },
  global: { plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })] },
});
beforeEach(() => {
  mocks.get.mockReset();
  mocks.get.mockImplementation(async (path) => {
    if (path.includes('profile-overview')) return { data: overview };
    if (path === '/tasks/all') return { data: [{ id: 1, status: 'pending', title: 'Review form' }, { id: 2, status: 'in_progress', title: 'Training' }] };
    if (path.includes('affiliations')) return { data: { affiliations: [{ id: 5, name: 'Cheyenne HS', organization_type: 'school' }] } };
    if (path.includes('classification')) return { data: { results: [{ agencyId: 7, payCategory: 2, payCategoryLabel: 'Prelicensed', licenseStatus: 'prelicensed' }] } };
    return { data: [] };
  });
});
afterEach(() => wrapper?.unmount());
it('shows real Overview information and compact cards without the full sidebar', async () => {
  wrapper = mountPanel();
  await flushPromises();
  expect(mocks.get).toHaveBeenCalledWith('/users/1/profile-overview', expect.objectContaining({ params: { agencyId: 7 }, skipGlobalLoading: true }));
  for (const value of ['EMP-0046', 'LPCC', 'School counseling', 'Alex Lee', 'Denver, CO', 'Cheyenne HS', 'Aetna', 'Prelicensed', 'Lifecycle Snapshot']) expect(wrapper.text()).toContain(value);
  expect(wrapper.find('.ov-sidebar').exists()).toBe(false);
  expect(wrapper.findAll('.ov-metric-num')[1].text()).toBe('2');
  expect(wrapper.get('details.ov-personal-job').attributes('open')).toBeUndefined();
});
it('exposes Archive through the three-dot menu only when authorized', async () => {
  wrapper = mountPanel();
  await flushPromises();
  await wrapper.get('[aria-label="User actions"]').trigger('click');
  await wrapper.get('[role="menuitem"]').trigger('click');
  expect(wrapper.emitted('archive')).toHaveLength(1);
  await wrapper.setProps({ canArchive: false });
  expect(wrapper.find('[aria-label="User actions"]').exists()).toBe(false);
});
it('shows a recoverable error instead of stale profile data', async () => {
  mocks.get.mockRejectedValueOnce({ response: { data: { error: { message: 'Access denied' } } } });
  wrapper = mountPanel();
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('Access denied');
  expect(wrapper.find('.ov-root').exists()).toBe(false);
  await wrapper.get('[role="alert"] button').trigger('click');
  await flushPromises();
  expect(wrapper.text()).toContain('EMP-0046');
});
it('ignores an old response when the selected user changes', async () => {
  let resolveOld;
  mocks.get.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  wrapper = mountPanel();
  await wrapper.setProps({ user: { id: 2, first_name: 'Robin', last_name: 'Smith' } });
  await flushPromises();
  resolveOld({ data: { ...overview, user: { ...overview.user, employee_id: 'STALE' } } });
  await flushPromises();
  expect(wrapper.text()).not.toContain('STALE');
  expect(wrapper.get('h2').text()).toBe('Robin Smith');
});

it('retains the full Overview layout outside the quick view', async () => {
  wrapper = mount(UserOverviewTab, {
    props: { userId: 1, user: overview.user, agencyId: 7, preloadedOverview: overview, canViewLifecycleTab: true },
    global: { plugins: [createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })] },
  });
  await flushPromises();
  expect(wrapper.find('.ov-sidebar').exists()).toBe(true);
  expect(wrapper.find('.ov-root--compact').exists()).toBe(false);
  expect(wrapper.find('div.ov-personal-job').exists()).toBe(true);
  expect(wrapper.find('div.ov-lc-bottom').exists()).toBe(true);
  expect(wrapper.text()).toContain('Lifecycle Management');
});

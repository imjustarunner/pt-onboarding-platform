import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SupervisorAssignmentHistory from '../SupervisorAssignmentHistory.vue';
import SupervisorAssignmentManager from '../SupervisorAssignmentManager.vue';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../services/api', () => ({ default: { get: mocks.get } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { role: 'admin' } }) }));
let wrapper;
const historical = { id: 1, supervisor_id: 10, supervisor_name: 'Sam Supervisor', supervisor_type: 'clinical', agency_name: 'ITSCO', is_primary: 1, assigned_at: '2025-01-02T12:00:00Z', ended_at: '2026-09-29T12:00:00Z', end_reason: 'account_inactive' };
beforeEach(() => { mocks.get.mockReset(); mocks.get.mockResolvedValue({ data: [historical] }); });
afterEach(() => wrapper?.unmount());

it('displays preserved identity, agency, dates and role without current-assignment actions', async () => {
  wrapper = mount(SupervisorAssignmentHistory, { props: { userId: 20, agencyId: 2 } });
  await flushPromises();
  expect(mocks.get).toHaveBeenCalledWith('/supervisor-assignments/supervisee/20/history', { params: { agencyId: 2 } });
  for (const text of ['Past supervisors', 'Sam Supervisor', 'Clinical', 'ITSCO', 'Primary supervisor', '2025', '2026', 'Account marked inactive']) expect(wrapper.text()).toContain(text);
  expect(wrapper.findAll('button')).toHaveLength(0);
});
it('does not mistake a failed history request for no past supervisors and supports retry', async () => {
  mocks.get.mockRejectedValueOnce(new Error('offline'));
  wrapper = mount(SupervisorAssignmentHistory, { props: { userId: 20 } });
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toContain('Unable to load');
  expect(wrapper.text()).not.toContain('No past supervisor');
  await wrapper.get('button').trigger('click');
  await flushPromises();
  expect(wrapper.text()).toContain('Sam Supervisor');
});
it('ignores an older response when switching users', async () => {
  let resolveOld;
  mocks.get.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  wrapper = mount(SupervisorAssignmentHistory, { props: { userId: 20 } });
  mocks.get.mockResolvedValue({ data: [] });
  await wrapper.setProps({ userId: 30 });
  await flushPromises();
  resolveOld({ data: [historical] });
  await flushPromises();
  expect(wrapper.text()).toContain('No past supervisor');
  expect(wrapper.text()).not.toContain('Sam Supervisor');
});
it('retains history for an inactive profile with no memberships and hides new assignments', async () => {
  mocks.get.mockImplementation(async path => {
    if (path === '/users/20') return { data: { id: 20, first_name: 'Lee', last_name: 'Former', status: 'INACTIVE_EMPLOYEE', is_active: 0 } };
    return { data: path.endsWith('/history') ? [historical] : [] };
  });
  wrapper = mount(SupervisorAssignmentManager, { props: { superviseeId: 20 } });
  await flushPromises();
  expect(wrapper.text()).toContain('This user is inactive');
  expect(wrapper.text()).toContain('No supervisor assignments found');
  expect(wrapper.text()).toContain('Sam Supervisor');
  expect(wrapper.text()).not.toContain('Create New Assignment');
});

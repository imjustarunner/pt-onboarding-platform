import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Overview from '../SchoolClientOverviewPanel.vue';
const m = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 1465, role: 'school_staff' } }) }));
vi.mock('../../../services/api', () => ({ default: { get: m.get } }));
vi.mock('../../clients/ParentContactAttempts.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../ClientTicketThreadPanel.vue', () => ({ default: { template: '<div />' } }));
vi.mock('../../admin/PhiDocumentsPanel.vue', () => ({ default: { template: '<div />' } }));
beforeEach(() => { localStorage.clear(); m.get.mockResolvedValue({ data: {} }); });
it.each(['America/Denver', 'Pacific/Honolulu', 'Asia/Tokyo'])('shows the stored ROI calendar day and year in %s', async timezone => {
  localStorage.setItem('user', JSON.stringify({ timezone }));
  const wrapper = mount(Overview, { props: { schoolOrganizationId: 451, client: { id: 2483, roi_expires_at: '2029-11-10T00:00:00.000Z', school_staff_effective_access_state: 'roi' } } });
  await flushPromises();
  expect(wrapper.text()).toContain('Nov 10, 2029');
  expect(wrapper.text()).not.toContain('Nov 9, 2029');
  wrapper.unmount();
});

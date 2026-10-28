import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const m = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: { scope: 'school' }, params: { organizationSlug: 'itsco' } }), useRouter: () => ({ replace: async () => {} }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { role: 'support' } }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 }, agencies: [{ id: 2, name: 'ITSCO' }], userAgencies: [{ id: 2, name: 'ITSCO' }] }) }));
vi.mock('../../../services/unfinishedDigitalFormsApi', () => ({ fetchUnfinishedDigitalFormsSnapshot: m.fetch }));
import View from '../UnfinishedDigitalFormsView.vue';
beforeEach(() => {
  m.fetch.mockResolvedValue({ totals: { unfinished: 1, needsAttention: 1 }, schools: [], rows: [{ id: 22, displayName: 'Alex Example', email: 'parent@example.test', childNames: ['Avery Example'], scope: 'school', currentStage: 'reminders_stopped', resumeAvailable: true, lastSavedAt: '2026-10-28T14:44:00Z', lastNotifiedAt: '2026-10-28T14:16:00Z', timeline: [{ id: 'email_1', label: 'Support recovery email', status: 'sent', at: '2026-10-28T14:16:00Z' }] }] });
});
it('lets support find the child and see the stopped reminders and recovery notification', async () => {
  const wrapper = mount(View, { global: { stubs: { RouterLink: true } } }); await flushPromises();
  expect(m.fetch).toHaveBeenCalledWith(2, { scope: 'school', schoolOrganizationId: null });
  await wrapper.get('input[type="search"]').setValue('avery');
  expect(wrapper.findAll('tbody .row-click')).toHaveLength(1);
  expect(wrapper.text()).toContain('Automatic reminders stopped');
  await wrapper.get('tbody .row-click').trigger('click');
  const drawer = wrapper.get('[role="dialog"]');
  expect(drawer.text()).toContain('Support recovery email');
  expect(drawer.text()).toContain('Resume link: Available');
  expect(drawer.text()).toContain('Automatic reminders are off');
  wrapper.unmount();
});
it('reports an unavailable service as an error instead of an empty completed list', async () => {
  m.fetch.mockRejectedValue(new Error('Reporting unavailable'));
  const wrapper = mount(View, { global: { stubs: { RouterLink: true } } }); await flushPromises();
  expect(wrapper.get('.error-banner').text()).toBe('Reporting unavailable'); wrapper.unmount();
});

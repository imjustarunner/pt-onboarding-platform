import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Panel from '../GuardianAppointmentsPanel.vue';
vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
import api from '../../../services/api.js';
const prefs = () => ({ channels: { email: true, sms: true }, optionalRemindersEnabled: true, providerPushedUpdatesEnabled: true });
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async url => ({ data: url.endsWith('/appointments') ? { appointments: [{ id: 12, startAt: '2026-10-07 16:00:00', status: 'scheduled', requests: [], serviceSetting: { isSchool: true, locationLabel: 'School A' } }] } : prefs() }));
  api.put.mockImplementation(async (_, input) => ({ data: input }));
});
it('shows the actual school and absence instructions without requiring confirmation', async () => {
  const w = mount(Panel, { props: { clientId: 4 } }); await flushPromises();
  expect(w.text()).toContain('Service location: School A');
  expect(w.text()).toContain('No confirmation is needed');
  expect(w.text()).not.toContain('Y to confirm');
});
it('lets a guardian turn off texts while retaining email', async () => {
  const w = mount(Panel, { props: { clientId: 4 } }); await flushPromises();
  await w.findAll('input[type=checkbox]')[1].setValue(false);
  await w.findAll('button').find(b => b.text() === 'Save my preferences').trigger('click'); await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/guardian-portal/clients/4/reminder-preferences', expect.objectContaining({ channels: { email: true, sms: false } }));
  expect(w.text()).toContain('still requires recorded consent');
});
it('does not expose or change a family’s preferences in staff preview', async () => {
  const w = mount(Panel, { props: { clientId: 4, preview: true } }); await flushPromises();
  expect(api.get).not.toHaveBeenCalled(); expect(w.find('details').exists()).toBe(false);
});

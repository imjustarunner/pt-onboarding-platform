import { beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Setup from '../PortalNotificationSetup.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
const response = (complete = false, sms = false) => ({ data: { complete, smsStatus: 'needs_consent', phoneLastFour: '0101', preferences: { isDefault: !complete, channels: { email: true, sms }, optionalRemindersEnabled: true, confirmationRequestsEnabled: true, providerPushedUpdatesEnabled: true, schedulingChangesEnabled: true } } });
beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue(response()); api.put.mockResolvedValue({ data: {} }); });
it('makes notification review a primary task and completes when texts are declined', async () => {
  const w = mount(Setup, { props: { clientId: 1 } }); await flushPromises();
  expect(w.text()).toContain('Priority task'); expect(w.find('form').exists()).toBe(true);
  api.get.mockResolvedValue(response(true));
  await w.find('form').trigger('submit'); await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/guardian-portal/clients/1/reminder-preferences', expect.objectContaining({ channels: { email: true, sms: false } }));
  expect(w.text()).toContain('Notification setup is complete.'); expect(w.find('form').exists()).toBe(false); w.unmount();
});
it('provides a consent form without treating an SMS preference as enrollment', async () => {
  api.get.mockResolvedValue(response(false, true)); api.post.mockResolvedValue({ data: { path: '/sms-consent/sign#example' } });
  const w = mount(Setup, { props: { clientId: 1 } }); await flushPromises();
  await w.findAll('button').find(b => b.text().includes('complete text consent')).trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/guardian-portal/clients/1/notification-setup/sms-consent');
  expect(w.find('a').attributes('href')).toBe('/sms-consent/sign#example'); expect(w.text()).toContain('Priority task'); w.unmount();
});
it('does not fetch or modify private settings in preview', async () => {
  const w = mount(Setup, { props: { clientId: 1, preview: true } }); await flushPromises();
  expect(api.get).not.toHaveBeenCalled(); expect(w.find('section').exists()).toBe(false); w.unmount();
});
it('ignores responses for a previously selected client', async () => {
  let old; api.get.mockImplementationOnce(() => new Promise(resolve => { old = resolve; })).mockResolvedValue(response(true));
  const w = mount(Setup, { props: { clientId: 1 } }); await w.setProps({ clientId: 2 }); await flushPromises();
  old(response()); await flushPromises(); expect(w.text()).toContain('Completed'); expect(w.text()).not.toContain('Priority task'); w.unmount();
});

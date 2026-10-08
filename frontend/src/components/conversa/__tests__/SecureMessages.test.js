import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SecureMessageBanner from '../SecureMessageBanner.vue';
import NotificationHistory from '../ClientNotificationHistory.vue';
import SecureRecords from '../ClientSecureMessageRecords.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));
let wrapper;
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: { events: [], notifications: [], records: [] } }); });
afterEach(() => wrapper?.unmount());
it('states the shared audience and directs private discussions to a session', () => {
  wrapper = mount(SecureMessageBanner, { props: { shared: true } });
  expect(wrapper.text()).toContain('Shared care conversation');
  expect(wrapper.text()).toContain('all guardians who have access');
  expect(wrapper.text()).toContain('arrange a session');
  expect(wrapper.text()).toContain('Email and text notifications contain no message content');
  expect(wrapper.text()).not.toContain('Private conversation');
});
it('loads secure activity only when requested and ignores an old thread response', async () => {
  let finish; api.get.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  wrapper = mount(SecureMessageBanner, { props: { threadId: 4 } });
  expect(api.get).not.toHaveBeenCalled();
  await wrapper.find('button').trigger('click'); await wrapper.setProps({ threadId: 5 });
  finish({ data: { events: [{ id: 1, event_type: 'message_opened', actor_name: 'Previous child' }] } }); await flushPromises();
  expect(wrapper.text()).not.toContain('Previous child');
});
it('shows delivery metadata from different organizations in one history', async () => {
  api.get.mockResolvedValue({ data: { notifications: [{ id: 1, type: 'session_reminder', channel: 'email', status: 'sent', organization: 'Tutoring', recipient: 'helper@example.org', occurredAt: '2026-10-07' }, { id: 2, type: 'secure_message_notification', channel: 'email', status: 'sent', organization: 'AuricWell', recipient: 'guardian@example.org', occurredAt: '2026-10-07' }] } });
  wrapper = mount(NotificationHistory, { props: { clientId: 4, guardian: true } }); await flushPromises();
  expect(wrapper.text()).toContain('Tutoring'); expect(wrapper.text()).toContain('AuricWell');
  expect(api.get).toHaveBeenCalledWith('/guardian-portal/clients/4/notification-history', expect.anything());
});
it('does not display another child’s late notification response', async () => {
  const finish = new Map(); api.get.mockImplementation(url => new Promise(resolve => finish.set(url, resolve)));
  wrapper = mount(NotificationHistory, { props: { clientId: 4, guardian: true } });
  await wrapper.setProps({ clientId: 5 });
  finish.get('/guardian-portal/clients/5/notification-history')({ data: { notifications: [] } });
  finish.get('/guardian-portal/clients/4/notification-history')({ data: { notifications: [{ id: 1, recipient: 'wrong-child@example.org' }] } });
  await flushPromises(); expect(wrapper.text()).not.toContain('wrong-child');
});
it('opens a chart message explicitly and shows its recorded audience and audit', async () => {
  api.get.mockImplementation(async url => ({ data: url.endsWith('/secure-messages') ? { records: [{ id: 1, message_id: 7, sender_name: 'Guardian One', created_at: '2026-10-07' }] } : { message: { id: 7, senderName: 'Guardian One', createdAt: '2026-10-07', body: 'Care update', recipients: [{ name: 'Guardian Two' }, { name: 'Dr. Smith' }], attachments: [] }, events: [{ id: 1, event_type: 'medical_record_opened', actor_name: 'Dr. Smith', created_at: '2026-10-07' }] } }));
  wrapper = mount(SecureRecords, { props: { clientId: 4 } }); await flushPromises();
  expect(wrapper.text()).not.toContain('Care update');
  await wrapper.find('li button').trigger('click'); await flushPromises();
  expect(wrapper.text()).toContain('Care update'); expect(wrapper.text()).toContain('Guardian Two, Dr. Smith');
  expect(wrapper.text()).toContain('medical record opened');
});

import { afterEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import HubSmsComposer from '../HubSmsComposer.vue';
import api from '../../../services/api';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
let wrapper;
afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it('clears the recipient when the sender changes and sends only the newly confirmed recipient', async () => {
  vi.useFakeTimers();
  api.get.mockImplementation(async (url, config) => url.endsWith('sms-lines')
    ? { data: { lines: [
      { agencyId: 2, agencyName: 'ITSCO', numberId: 6, phoneNumber: '+17195550100' },
      { agencyId: 6, agencyName: 'Next Level Up', numberId: 8, phoneNumber: '+17195550101' }
    ] } }
    : { data: { recipients: [config.params.numberId === 6
      ? { clientId: 10, guardianUserId: 90, name: 'Morgan Parent', clientName: 'Child A', relationship: 'Guardian', phoneEnding: '1100' }
      : { clientId: 20, guardianUserId: 91, name: 'Riley Parent', clientName: 'Child B', relationship: 'Guardian', phoneEnding: '1200' }] } });
  api.post.mockResolvedValue({ data: {} });
  wrapper = mount(HubSmsComposer, { props: { agencyId: 2 } });
  await flushPromises();
  await wrapper.get('input[type="search"]').setValue('Parent');
  await vi.advanceTimersByTimeAsync(301);
  await wrapper.get('.sms-recipients button').trigger('click');
  await wrapper.get('textarea').setValue('Hello');
  wrapper.get('textarea').element.setSelectionRange(5, 5);
  await wrapper.get('.message-link-button').trigger('click');
  await wrapper.get('.message-link-panel input').setValue('example.org/appointments?day=Tuesday');
  await wrapper.get('.message-link-actions button').trigger('click');
  expect(wrapper.get('textarea').element.value).toBe('Hello https://example.org/appointments?day=Tuesday');
  await wrapper.get('select').setValue('8');
  expect(wrapper.get('button[type="submit"]').element.disabled).toBe(true);
  expect(wrapper.text()).not.toContain('Morgan Parent');
  await vi.advanceTimersByTimeAsync(301);
  await wrapper.get('.sms-recipients button').trigger('click');
  await wrapper.get('form').trigger('submit');
  expect(api.post).toHaveBeenCalledExactlyOnceWith('/messages/send', {
    clientId: 20, guardianUserId: 91, numberId: 8, body: 'Hello https://example.org/appointments?day=Tuesday', startNewConversation: true
  }, { skipGlobalLoading: true });
});

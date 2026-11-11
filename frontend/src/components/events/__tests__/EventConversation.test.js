import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import EventConversation from '../EventConversation.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
enableAutoUnmount(afterEach);
const sharedAudience = defineComponent({ setup(_, { expose }) { expose({ canSend: true, shared: false, prepareSend: async () => true }); return () => null; } });
const render = () => mount(EventConversation, { props: { endpoint: '/company-events/staff/8/token/conversation', title: 'Team workshop', meId: 7 }, global: { stubs: { UserAvatar: true, SecureFamilyAudience: sharedAudience } } });
beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.post.mockImplementation(async url => ({ data: url.endsWith('/conversation') ? { threadId: 42, agencyId: 2, name: 'Team workshop' } : { id: 61, body: 'Looking forward to it', sender_user_id: 7, created_at: '2026-11-11T18:00:00Z' } }));
});
it('opens the event-named group on the event page and sends through that same thread', async () => {
  const w = render();
  await w.get('button').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/company-events/staff/8/token/conversation', {}, { skipGlobalLoading: true });
  expect(api.get).toHaveBeenCalledWith('/chat/threads/42/messages', { params: { limit: 100 } });
  expect(w.get('a').attributes('href')).toBe('/messages?view=workspace&tab=dms&threadId=42&agencyId=2');
  expect(w.text()).toContain('Team workshop');
  await w.get('textarea').setValue('Looking forward to it');
  await w.get('.composer-send').trigger('click'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/chat/threads/42/messages', { body: 'Looking forward to it' });
  expect(w.text()).toContain('Looking forward to it');
  await w.get('.ee-section-header button').trigger('click');
  await w.get('.ee-section-header button').trigger('click'); await flushPromises();
  expect(api.post.mock.calls.filter(([url]) => url.endsWith('/conversation'))).toHaveLength(1);
});
it('shows a useful error in place and allows retry without navigating to an empty inbox', async () => {
  api.post.mockRejectedValueOnce({ response: { data: { error: { message: 'Could not connect. Try again.' } } } });
  const w = render(); await w.get('button').trigger('click'); await flushPromises();
  expect(w.get('[role=alert]').text()).toContain('Could not connect');
  expect(w.find('textarea').exists()).toBe(false);
  await w.get('[role=alert] button').trigger('click'); await flushPromises();
  expect(w.get('textarea').exists()).toBe(true);
});
it('ignores a late open response after leaving the event', async () => {
  let resolve; api.post.mockReturnValue(new Promise(done => { resolve = done; }));
  const w = render(); await w.get('button').trigger('click'); w.unmount();
  resolve({ data: { threadId: 42, agencyId: 2 } }); await flushPromises();
  expect(api.get).not.toHaveBeenCalled();
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import Shell from '../UnifiedInboxShell.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { post: vi.fn(), get: vi.fn(), patch: vi.fn() } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 } }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 5 } }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: {}, query: {} }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
let wrapper;
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: {} });
});
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
const render = async () => { wrapper = shallowMount(Shell, { props: { agencyId: 2 } }); await flushPromises(); };
describe('conversation switching', () => {
  it('keeps the clicked conversation open if an earlier request completes later', async () => {
    await render();
    const pending = new Map();
    api.get.mockImplementation((url) => new Promise((resolve) => pending.set(url, resolve)));
    const list = wrapper.findComponent({ name: 'UnifiedConversationList' });
    list.vm.$emit('select', 1);
    list.vm.$emit('select', 2);
    pending.get('/communications/conversations/2')({ data: { conversation: { id: 2 }, messages: [] } });
    await flushPromises();
    pending.get('/communications/conversations/1')({ data: { conversation: { id: 1 }, messages: [] } });
    await flushPromises();
    expect(wrapper.findComponent({ name: 'UnifiedConversationThread' }).props('detail').conversation.id).toBe(2);
  });
  it('saves a delayed draft to the thread it came from after selection changes', async () => {
    await render();
    vi.useFakeTimers();
    const thread = wrapper.findComponent({ name: 'UnifiedConversationThread' });
    thread.vm.$emit('draft', 'For conversation one', 1);
    wrapper.findComponent({ name: 'UnifiedConversationList' }).vm.$emit('select', 2);
    await vi.advanceTimersByTimeAsync(801);
    expect(api.patch).toHaveBeenCalledWith('/communications/conversations/1', { draftBody: 'For conversation one' }, expect.any(Object));
  });
});

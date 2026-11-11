import { reactive } from 'vue';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
const mocks = vi.hoisted(() => ({ query: {}, agency: { id: 2, name: 'ITSCO' } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ get query() { return mocks.query; }, params: {}, path: '/messages' }), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: mocks.agency, userAgencies: [mocks.agency] }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 7, role: 'provider' } }) }));
vi.mock('../../../store/branding', () => ({ useBrandingStore: () => ({}) }));
vi.mock('../../../store/organization', () => ({ useOrganizationStore: () => ({}) }));
import View from '../PlatformChatsView.vue';
enableAutoUnmount(afterEach);
beforeEach(() => { mocks.query = reactive({}); });
const render = () => mount(View, { global: { stubs: { MessagesWorkspace: true, MessagesHubShell: true, RouterLink: true } } });
it.each(['42', 'chat-42'])('selects Team chat for a legacy event thread link %s', async threadId => {
  mocks.query.threadId = threadId;
  const w = render(); await flushPromises();
  expect(w.findComponent({ name: 'MessagesWorkspace' }).exists()).toBe(true);
  expect(w.findComponent({ name: 'MessagesHubShell' }).exists()).toBe(false);
  mocks.query.view = 'workspace'; mocks.query.tab = 'dms'; delete mocks.query.threadId; await flushPromises();
  expect(w.findComponent({ name: 'MessagesWorkspace' }).exists()).toBe(true);
});
it('keeps ordinary inbox links in the inbox and handles a thread link added without a remount', async () => {
  const w = render(); await flushPromises();
  expect(w.findComponent({ name: 'MessagesHubShell' }).exists()).toBe(true);
  mocks.query.threadId = '42'; await flushPromises();
  expect(w.findComponent({ name: 'MessagesWorkspace' }).exists()).toBe(true);
});
it.each(['-1', '0', 'not-a-thread'])('does not treat malformed thread IDs as a conversation: %s', async threadId => {
  mocks.query.threadId = threadId;
  const w = render(); await flushPromises(); expect(w.findComponent({ name: 'MessagesHubShell' }).exists()).toBe(true);
});

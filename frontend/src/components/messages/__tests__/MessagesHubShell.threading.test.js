import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Hub from '../MessagesHubShell.vue';
import api from '../../../services/api';
import { openEmailComposer } from '../../../utils/emailComposerWindow';
vi.mock('../../../utils/emailComposerWindow',()=>({openEmailComposer:vi.fn()}));
vi.mock('../../../services/api', () => ({ default: { post: vi.fn(), get: vi.fn(), patch: vi.fn() } }));
vi.mock('../../../store/agency', () => ({ useAgencyStore: () => ({ currentAgency: { id: 2 }, userAgencies: [{ id: 2 }] }) }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 5, role: 'provider' } }) }));
const routing = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/messages', params: {}, query: {} }), useRouter: () => routing }));
vi.mock('../../../store/communicationsCounts', () => ({ useCommunicationsCountsStore: () => ({ unreadMessagesCount: 0 }) }));
const person = { personKey: 'email:alice@example.org@2', email: 'alice@example.org', displayName: 'Alice', agencyId: 2, kinds: ['external'], methods: [{ id: 'email', available: true }], preferredMethod: 'email' };
const msg = (cid, subject = 'Same subject') => ({ id: `email-msg-${cid}`, bodyPreview: 'Hello', channel: 'email', direction: 'inbound', from: { email: 'alice@example.org' }, createdAt: '2026-09-01', meta: { conversationId: cid, messageId: cid, subject, inboxEmail: 'messages@itsco.health' } });
let wrapper;
let state;
beforeEach(async () => {
  vi.clearAllMocks();
  routing.push.mockResolvedValue(undefined);
  api.get.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: { threadRef: { conversationId: 20 } } });
  wrapper = shallowMount(Hub, { global: { stubs: { RouterLink: true } } });
  state = wrapper.vm.$.setupState;
  await flushPromises();
  state.selected = person;
  state.sendMethod = 'email';
  state.timeline = [msg(10), msg(20)];
  await nextTick();
});
afterEach(() => wrapper?.unmount());
describe('Messages hub thread interactions', () => {
  it('opens New email in a detached composer without a previous conversation ID', () => {
    state.selectedConversation = { id:10 }; state.activeEmailThreadKey='email:10';
    state.startNewSubjectCompose();
    expect(openEmailComposer).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({mode:'new',conversationId:undefined}));
    expect(api.post).not.toHaveBeenCalledWith('/messages/hub/send',expect.anything(),expect.anything());
  });
  it('opens the exact clicked email directly without resolving an unrelated person', async () => {
    api.get.mockResolvedValue({data:{conversation:{id:20,channel:'email',subject:'Twenty'},messages:[{id:200,body_text:'Readable'}]}});
    await state.openEmailSubjectThread(state.emailSubjectThreads.find(t=>t.conversationId===20));
    expect(state.conversationPreview.conversation.id).toBe(20);
    expect(state.selected).toBeNull();
    expect(api.get.mock.calls.some(([url])=>url==='/communications/conversations/20')).toBe(true);
    expect(api.get.mock.calls.some(([url])=>url==='/messages/hub/people')).toBe(false);
    expect(api.patch).not.toHaveBeenCalled();
  });
  it('opens Reply all with the selected conversation and keeps the reading pane free of a draft', async () => {
    state.selected=null;state.selectedConversation={id:20,channel:'email'};
    state.conversationPreview={conversation:{id:20,subject:'Twenty'},messages:[{id:200,body_text:'Readable'}]};
    await nextTick(); state.composeEmail('reply_all');
    expect(openEmailComposer).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({mode:'reply_all',conversationId:20}));
    expect(wrapper.find('.msg-hub-composer').exists()).toBe(false);
    expect(api.patch).not.toHaveBeenCalled();
  });
  it('ignores a timeline response belonging to the previously selected person', async () => {
    const pending = new Map();
    api.get.mockImplementation((url) => new Promise((resolve) => pending.set(url, resolve)));
    const first = state.loadTimeline(person.personKey);
    const other = { ...person, personKey: 'email:bob@example.org@2', displayName: 'Bob' };
    state.selected = other;
    const second = state.loadTimeline(other.personKey);
    pending.get(`/messages/hub/people/${encodeURIComponent(other.personKey)}/timeline`)({ data: { person: other, items: [msg(30)] } });
    await second;
    pending.get(`/messages/hub/people/${encodeURIComponent(person.personKey)}/timeline`)({ data: { person, items: [msg(10)] } });
    await first;
    expect(state.selected.displayName).toBe('Bob');
    expect(state.timeline[0].meta.conversationId).toBe(30);
  });
});

it('loads only the current user’s explicit drafts', async () => {
  state.navId='drafts';
  api.get.mockResolvedValue({data:{drafts:[{id:'one',subject:'My draft',preview:'My words',recipient:'alice@example.org'}]}});
  await state.loadConversations();
  expect(api.get).toHaveBeenCalledWith('/communications/drafts',expect.objectContaining({params:{agencyId:2}}));
  expect(state.conversations[0]).toMatchObject({draftId:'one',last_message_preview:'My words'});
});

describe('channel and group entry points', () => {
  it('makes channel browsing available from the main Messages hub', async () => {
    await wrapper.findAll('button').find(b => b.text() === '# Channels').trigger('click');
    expect(routing.push).toHaveBeenCalledWith({ path: '/messages', query: { view: 'workspace', tab: 'channels' } });
  });
  it('opens the group picker directly', async () => {
    await wrapper.findAll('button').find(b => b.text() === 'Group chat').trigger('click');
    expect(wrapper.findComponent({ name: 'StartConversationModal' }).props('initialChip')).toBe('groups');
  });
  it('keeps unread channel messages unread until the destination loads', async () => {
    const channel = { id: 'chat-42', hubKind: 'channel', threadId: 42, primary_participant_name: 'Denver', is_unread: true };
    await state.pickConversation(channel);
    expect(routing.push).toHaveBeenCalledWith({ path: '/messages', query: { view: 'workspace', tab: 'channels', threadId: '42', agencyId: '2' } });
    expect(api.post.mock.calls.some(([url]) => url === '/chat/threads/42/read')).toBe(false);
    expect(channel.is_unread).toBe(true);
  });
  it('reports a failed opening without clearing unread', async () => {
    routing.push.mockRejectedValueOnce(new Error('navigation failed'));
    const group = { id: 'chat-43', hubKind: 'group', threadId: 43, primary_participant_name: 'Team', is_unread: true };
    await state.pickConversation(group);
    expect(state.error).toContain('Could not open');
    expect(api.post.mock.calls.some(([url]) => url === '/chat/threads/43/read')).toBe(false);
    expect(group.is_unread).toBe(true);
  });
});

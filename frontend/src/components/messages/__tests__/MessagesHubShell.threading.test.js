import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import { useSessionLockStore } from '../../../store/sessionLock';
vi.mock('../../../store/sessionLock', () => ({ useSessionLockStore: vi.fn() }));
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
let lock;
beforeEach(async () => {
  vi.clearAllMocks();
  lock = reactive({isLocked:false,warningActive:false});
  useSessionLockStore.mockReturnValue(lock);
  routing.push.mockResolvedValue(undefined);
  api.get.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: { threadRef: { conversationId: 20 } } });
  wrapper = shallowMount(Hub, { global: { stubs: { RouterLink: true, Teleport: false } } });
  state = wrapper.vm.$.setupState;
  await flushPromises();
  state.selected = person;
  state.sendMethod = 'email';
  state.timeline = [msg(10), msg(20)];
  await nextTick();
});
afterEach(() => wrapper?.unmount());
describe('Messages hub thread interactions', () => {
  it('labels outgoing email with the recipient in the list and reading pane', async () => {
    state.selected = null;
    const conversation = { id: 55, channel: 'email', latestMessageDirection: 'outbound',
      latestSenderName: 'Michael Mendez', primary_participant_name: 'Haley',
      primary_participant_email: 'haley@example.org', subject: 'Test' };
    state.conversations = [conversation];
    state.selectedConversation = conversation;
    state.conversationPreview = { conversation, messages: [] };
    await nextTick();
    expect(state.conversationThreadTitle(conversation)).toBe('Haley');
    expect(state.conversationThreadTitle({ ...conversation, primary_participant_name: null })).toBe('haley@example.org');
    expect(state.conversationThreadTitle({ ...conversation, latestMessageDirection: null, last_message_direction: 'outbound' })).toBe('Haley');
    expect(state.conversationThreadTitle({ ...conversation, latestMessageDirection: 'inbound' })).toBe('Michael Mendez');
    expect(wrapper.find('.msg-hub-row-top strong').text()).toBe('Haley');
    expect(wrapper.find('.msg-hub-thread-head-main h3').text()).toBe('Haley');
  });
  it('shows the actual messages From and personal work Reply-To without changing mailbox selection', async () => {
    state.emailAliases = [{ id: 7, email: 'thughes@itsco.health', fromEmail: 'messages@itsco.health', replyTo: 'thughes@itsco.health', kind: 'personal' }];
    state.emailComposeMode = 'new';
    state.composeFromAliasId = 7;
    await nextTick();
    expect(state.composeSenderAlias).toMatchObject({ fromEmail: 'messages@itsco.health', replyTo: 'thughes@itsco.health' });
    state.timeline = [{ ...msg(10), meta: { ...msg(10).meta, inboxEmail: 'thughes@itsco.health' } }];
    state.activeEmailThreadKey = 'email:10';
    state.emailComposeMode = 'reply';
    await nextTick();
    expect(state.replyMailboxEmail).toBe('thughes@itsco.health');
    expect(state.composeSenderAlias.fromEmail).toBe('messages@itsco.health');
  });
  it('opens the recipient list first, then a new draft without reusing the open thread', async () => {
    state.selectedConversation = { id:10 }; state.activeEmailThreadKey='email:10';
    state.startNewSubjectCompose();
    expect(state.showNew).toBe(true);
    expect(state.newConversationChannel).toBe('email');
    expect(openEmailComposer).not.toHaveBeenCalled();
    await state.startConversationWithPerson(person);
    expect(openEmailComposer).toHaveBeenCalledWith(expect.anything(), {mode:'new', agencyId:2, to:person.email});
    expect(api.post).not.toHaveBeenCalledWith('/messages/hub/send',expect.anything(),expect.anything());
  });
  it.each([['all','New conversation'],['email','New email'],['internal','New internal message'],['secure','New secure message'],['sms','New SMS'],['calls','Calls / Voicemails'],['group','New group']])('matches the primary action to %s', async (channel, label) => {
    state.inboxChannel = channel;
    await nextTick();
    const button = wrapper.find('.msg-hub-head-actions .btn-primary');
    expect(button.text()).toContain(label);
    expect(button.element.disabled).toBe(['sms','calls'].includes(channel));
    if (!['sms','calls'].includes(channel)) {
      await button.trigger('click');
      expect(state.newConversationChannel).toBe(channel);
      expect(state.showNew).toBe(true);
    }
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

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
it('does not let a background poll supersede a user’s folder request', async () => {
  const pending=deferred(); api.get.mockReturnValueOnce(pending.promise);
  state.navId='inbox'; const loading=state.loadConversations();
  const count=api.get.mock.calls.length; await state.refreshMail({quiet:true});
  expect(api.get.mock.calls.length).toBe(count);
  pending.resolve({data:{items:[{id:12,conversationId:12,channel:'email',preview:'New mail'}]}});
  await loading; expect(state.conversations[0].id).toBe(12); expect(state.loadingList).toBe(false);
});
it('aborts the previous conversation and ignores its late error', async () => {
  const old=deferred(); api.get.mockReturnValueOnce(old.promise);
  const first=state.pickConversation({id:10});
  const oldConfig=api.get.mock.calls.at(-1)[1];
  api.get.mockResolvedValue({data:{conversation:{id:20},messages:[]}});
  await state.pickConversation({id:20});
  expect(oldConfig.signal.aborted).toBe(true);
  old.reject(new Error('late failure')); await first;
  expect(state.conversationPreview.conversation.id).toBe(20); expect(state.error).toBe('');
});
it('recovers from a timed-out conversation without losing the selected email', async () => {
  api.get.mockRejectedValueOnce(Object.assign(new Error('timeout'),{code:'ECONNABORTED'}));
  await state.pickConversation({id:20});
  expect(state.loadingEmail).toBe(false); expect(wrapper.text()).toContain('Try again');
  expect(state.error).toContain('connection took too long');
  api.get.mockResolvedValue({data:{conversation:{id:20},messages:[]}});
  await state.pickConversation(state.selectedConversation);
  expect(state.conversationPreview.conversation.id).toBe(20); expect(state.error).toBe('');
});
it('keeps actionable errors through background polling and pauses polling while locked', async () => {
  state.error='Could not send your email'; await state.refreshMail({quiet:true});
  expect(state.error).toBe('Could not send your email');
  lock.isLocked=true; await nextTick(); api.get.mockClear();
  await state.refreshMail({quiet:true}); expect(api.get).not.toHaveBeenCalled();
  lock.isLocked=false; await nextTick(); await flushPromises(); expect(api.get).toHaveBeenCalled();
});
it('cancels folder loading when switching to a People view', async () => {
  const old=deferred(); api.get.mockReturnValueOnce(old.promise);
  state.navId='unknown'; const first=state.loadConversations();
  const config=api.get.mock.calls.at(-1)[1];
  state.selectNav('people','staff'); expect(config.signal.aborted).toBe(true);
  old.resolve({data:{conversations:[{id:999}]}}); await first;
  expect(state.conversations.some(c=>c.id===999)).toBe(false); expect(state.loadingList).toBe(false);
});

it('does not reload the reading pane on every composer autosave', async () => {
  state.navId='inbox';api.get.mockClear();
  state.onComposerMessage({origin:window.location.origin,data:{type:'email-drafts-changed',change:'draft'}});
  await flushPromises();expect(api.get).not.toHaveBeenCalled();
  state.onComposerMessage({origin:window.location.origin,data:{type:'email-drafts-changed',change:'delivery'}});
  await flushPromises();expect(api.get).toHaveBeenCalled();
});

it('searches older email bodies on the server and retains matches absent from the preview',async()=>{
 state.inboxChannel='email';state.navId='inbox';state.listSearch='older sentence';
 api.get.mockResolvedValue({data:{conversations:[{id:30,channel:'email',subject:'A different title',last_message_preview:'Latest reply'}]}});
 await state.loadConversations();
 expect(api.get).toHaveBeenCalledWith('/communications/conversations',expect.objectContaining({params:expect.objectContaining({q:'older sentence',channel:'email',hubScope:1,filter:'all',limit:80,offset:0})}));
 expect(state.filteredConversations.map(c=>c.id)).toEqual([30]);
});
it('appends additional search results without duplicate threads',async()=>{
 state.inboxChannel='email';state.navId='inbox';state.listSearch='older sentence';state.conversations=[{id:30,channel:'email'}];
 api.get.mockResolvedValue({data:{conversations:[{id:30,channel:'email'},{id:31,channel:'email'}]}});
 await state.loadConversations({append:true});
 expect(state.conversations.map(c=>c.id)).toEqual([30,31]);
 expect(api.get).toHaveBeenCalledWith('/communications/conversations',expect.objectContaining({params:expect.objectContaining({offset:1})}));
});
it('lists failed sends separately, opens the actual conversation, and never exposes discard as a retry',async()=>{
 state.navId='needs_attention';api.get.mockResolvedValue({data:{items:[{messageId:40,conversationId:10,subject:'Failed email',deliveryLabel:'Send failed'}]}});
 await state.loadConversations();expect(state.conversations[0]).toMatchObject({id:'failed-40',conversationId:10,deliveryLabel:'Send failed'});
 expect(state.conversations[0].draftId).toBeUndefined();
});
it('remembers the selected folder and channel using an account-and-agency preference only',()=>{
 state.inboxChannel='email';state.selectNav('inbox','sent');
 expect(JSON.parse(localStorage.getItem('messaging-view:5:2'))).toEqual({folder:'sent',channel:'email'});
 state.restoreMailboxView();expect(state.navId).toBe('sent');expect(state.inboxChannel).toBe('email');
 localStorage.removeItem('messaging-view:5:2');
});
it('keeps Mentions search local instead of turning it into an unfiltered email search',()=>{
 state.navId='mentions';state.inboxChannel='email';expect(state.emailSearchEnabled).toBe(false);
});

it('opens a new email immediately after choosing a person even when history is slow', async () => {
  api.get.mockImplementation(() => new Promise(() => {}));
  await state.startConversationWithPerson(person);
  expect(openEmailComposer).toHaveBeenCalledWith(expect.anything(), { mode:'new', agencyId:2, to:'alice@example.org' });
  expect(state.showNew).toBe(false);
});
it('places a new draft before existing subjects and removes it after sending', async () => {
  state.selected=person;
  state.onWorkspaceChanged({detail:{change:'draft',draft:{id:'new-1',agencyId:2,mode:'new',state:'editing',to:person.email,subject:'New topic'}}});
  await nextTick();
  expect(state.personNewDrafts[0].subject).toBe('New topic');
  expect(wrapper.text()).toContain('Draft · New topic');
  state.onWorkspaceChanged({detail:{change:'delivery',draft:{id:'new-1',agencyId:2,mode:'new',state:'sent'}}});
  expect(state.personNewDrafts).toHaveLength(0);
});
it('shows the school in the person profile and internal message author', async () => {
  state.selected={...person,kinds:['school_staff'],schoolNames:['Cheyenne El'],title:'School counselor'};
  state.sendMethod='internal';state.timeline=[{id:'chat-7',channel:'internal',direction:'inbound',bodyPreview:'Hello',createdAt:'2026-10-01',sender:{displayName:'Ava',schoolNames:['Cheyenne El'],title:'School counselor'},meta:{threadId:1}}];
  await nextTick();expect(wrapper.text()).toContain('Cheyenne El');
  expect(wrapper.find('.msg-hub-sender-school').text()).toBe('Cheyenne El · School counselor');
});

it('keeps the Email channel selected when choosing school staff who normally prefer internal chat', async () => {
  state.inboxChannel='email';
  await state.startConversationWithPerson({...person,kinds:['school_staff'],preferredMethod:'internal'});
  expect(state.sendMethod).toBe('email');
  expect(openEmailComposer).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({mode:'new',to:person.email}));
});

describe('channel and group entry points', () => {
  it('makes channel browsing available from the main Messages hub', async () => {
    await wrapper.findAll('button').find(b => b.text() === '# Channels').trigger('click');
    expect(routing.push).toHaveBeenCalledWith({ path: '/messages', query: { view: 'workspace', tab: 'channels' } });
  });
  it('opens the group picker directly', async () => {
    await wrapper.findAll('button').find(b => b.text() === 'Group chat').trigger('click');
    expect(wrapper.findComponent({ name: 'StartConversationModal' }).props('channel')).toBe('group');
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

describe('reading layout and unread navigation', () => {
  it('collapses folders, list, and details independently', async () => {
    expect(state.detailsCollapsed).toBe(true);
    for (const label of ['Hide folders', 'Hide message list', 'Show details']) {
      await wrapper.findAll('button').find(button => button.text() === label).trigger('click');
    }
    expect(wrapper.find('.msg-hub').classes()).toContain('folders-collapsed');
    expect(wrapper.find('.msg-hub-grid').classes()).toContain('list-collapsed');
    expect(wrapper.find('.msg-hub-grid').classes()).not.toContain('context-collapsed');
    await state.backToList();
    expect(wrapper.find('.msg-hub-grid').classes()).not.toContain('list-collapsed');
  });
  it('opens full screen and returns to the same message and panel layout with Back or Escape', async () => {
    state.selected = null;
    state.selectedConversation = { id: 20, channel: 'email' };
    state.conversationPreview = { conversation: { id: 20 }, messages: [] };
    state.listColCollapsed = true;
    await nextTick();
    const previousOverflow = document.body.style.overflow;
    await wrapper.findAll('button').find(button => button.text() === 'Full screen').trigger('click');
    await nextTick();
    expect(document.querySelector('.reader-fullscreen')).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    document.querySelector('.reader-fullscreen .msg-hub-reading-controls button').click();
    await nextTick();
    expect(state.readerFullscreen).toBe(false);
    expect(state.selectedConversation.id).toBe(20);
    expect(state.listColCollapsed).toBe(true);
    expect(document.body.style.overflow).toBe(previousOverflow);
    state.readerFullscreen = true;
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(state.readerFullscreen).toBe(false);
  });
  it('keeps Previous and Next working when opened unread messages leave the list', async () => {
    state.selected = null;
    state.navId = 'unread';
    const rows = [10, 20, 30].map(id => ({ id, channel: 'email', conversationId: id, is_unread: true }));
    state.conversations = rows;
    api.get.mockImplementation(async url => ({ data: url.startsWith('/communications/conversations/')
      ? { conversation: { id: Number(url.split('/').at(-1)), channel: 'email' }, messages: [] } : {} }));
    await state.pickConversation(rows[0]);
    expect(state.conversations.map(row => row.id)).toEqual([20, 30]);
    expect(state.readingIndex).toBe(0);
    await state.navigateReader(1);
    expect(state.selectedConversation.id).toBe(20);
    expect(state.conversations.map(row => row.id)).toEqual([30]);
    await state.navigateReader(-1);
    expect(state.selectedConversation.id).toBe(10);
    expect(state.readingSequence).toHaveLength(3);
  });
  it('shows unread counts for the selected channel and preserves the global dashboard total', async () => {
    state.inboxChannel = 'email';
    api.get.mockResolvedValue({ data: { summary: { unread: 6, unreadByChannel: { email: 3, internal: 2, secure: 1 } } } });
    await state.loadInboxCounts();
    expect(state.inboxBadgeCount('unread')).toBe(3);
    expect(state.inboxCounts.unread).toBe(6);
    state.inboxChannel = 'secure';
    expect(state.inboxBadgeCount('unread')).toBe(1);
    state.inboxChannel = 'all';
    expect(state.inboxBadgeCount('unread')).toBe(6);
  });
  it('shows every channel’s unread badge independently of the open folder and loaded page', async () => {
    state.inboxChannel = 'email';
    state.conversations = [];
    api.get.mockResolvedValue({ data: { summary: { unread: 14,
      unreadByChannel: { email: 3, internal: 2, secure: 1, sms: 2, channel: 1, group: 2, call: 1, voicemail: 2 }
    } } });
    await state.loadInboxCounts();
    await nextTick();
    for (const [channel, count] of Object.entries({ all: 14, email: 3, internal: 2, secure: 1, sms: 2, calls: 3, channel: 1, group: 2 })) {
      const badge = wrapper.find(`[data-channel="${channel}"] .msg-hub-channel-count`);
      expect(badge.text()).toBe(String(count));
      expect(badge.attributes('aria-label')).toBe(`${count} unread conversations`);
    }
    state.inboxChannel = 'calls';
    expect(state.inboxBadgeCount('unread')).toBe(3);
    api.get.mockResolvedValue({ data: { summary: { unread: 11,
      unreadByChannel: { internal: 2, secure: 1, sms: 2, channel: 1, group: 2, call: 1, voicemail: 2 }
    } } });
    await state.loadInboxCounts();
    await nextTick();
    expect(wrapper.find('[data-channel="email"] .msg-hub-channel-count').exists()).toBe(false);
    expect(wrapper.find('[data-channel="all"] .msg-hub-channel-count').text()).toBe('11');
  });
  it.each(['sms', 'calls'])('loads stored %s conversations even while new sends await activation', async channel => {
    state.selected = null; state.inboxChannel = channel; state.navId = 'unread';
    const storedChannel = channel === 'calls' ? 'voicemail' : 'sms';
    api.get.mockImplementation(async url => ({ data: url === '/messages/hub/unread'
      ? { items: [{ id: 90, conversationId: 90, channel: storedChannel, displayName: 'Saved conversation', is_unread: true }] }
      : {} }));
    await state.loadConversations();
    await nextTick();
    expect(api.get).toHaveBeenCalledWith('/messages/hub/unread', expect.objectContaining({ params: expect.objectContaining({ channel }) }));
    expect(state.filteredConversations).toHaveLength(1);
    expect(wrapper.text()).toContain('Saved conversation');
    expect(wrapper.text()).not.toContain('Coming soon');
    expect(wrapper.find('.msg-hub-head-actions .btn-primary').element.disabled).toBe(true);
  });
  it('offers a route to unread messages in other channels instead of saying caught up', async () => {
    state.selected = null; state.navId = 'unread'; state.inboxChannel = 'email'; state.conversations = [];
    state.inboxCounts = { unread: 3, unreadByChannel: { internal: 3, email: 0 } };
    await nextTick();
    expect(wrapper.text()).toContain('No unread emails in this view.');
    expect(wrapper.text()).toContain('Show unread across all channels (3)');
  });
  it('shows a loading failure rather than an empty-inbox success message', async () => {
    state.selected = null; state.navId = 'unread'; state.conversations = [];
    api.get.mockRejectedValueOnce({ response: { status: 503, data: { error: { message: 'Could not load your email. Please try Refresh.' } } } });
    await state.loadConversations();
    await nextTick();
    expect(wrapper.text()).toContain('Messages could not be loaded. Please try Refresh.');
    expect(wrapper.text()).not.toContain('You’re caught up');
  });
});

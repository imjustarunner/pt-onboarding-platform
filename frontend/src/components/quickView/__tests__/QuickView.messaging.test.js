import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import QuickView from '../../../views/QuickViewAccessView.vue';
import axios from 'axios';
vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ name: 'QuickViewApp', params: {}, query: {}, meta: { quickViewSessionOnly: true } }) }));
let wrapper; let state;
const message = { id: 1, direction: 'inbound', from: { email: 'sender@example.org' }, to: [{ email: 'staff@itsco.health' }], cc: [{ email: 'colleague@example.org' }], body_text: 'Hello', send_status: 'sent' };
beforeEach(async () => {
  vi.resetAllMocks();
  axios.post.mockResolvedValue({ data: { userId: 5, agencyId: 2, expiresAt: '2099-01-01' } });
  axios.get.mockResolvedValue({ data: { conversations: [], mailboxEmail: 'staff@itsco.health' } });
  wrapper = shallowMount(QuickView); state = wrapper.vm.$.setupState;
  await flushPromises();
});
afterEach(() => wrapper?.unmount());
describe('QV integrated conversations', () => {
  it('keeps a late response from replacing the conversation selected afterward', async () => {
    const pending = new Map();
    axios.get.mockImplementation((url) => new Promise((resolve) => pending.set(url, resolve)));
    const first = state.openConversation({ id: 10 });
    const second = state.openConversation({ id: 20 });
    pending.get('/api/quick-view/conversations/20')({ data: { conversation: { id: 20 }, messages: [{ id: 2, body_text: 'Correct thread' }] } });
    await second;
    pending.get('/api/quick-view/conversations/10')({ data: { conversation: { id: 10 }, messages: [{ id: 1, body_text: 'Wrong thread' }] } });
    await first;
    expect(state.activeConv.id).toBe(20);
    expect(state.threadMessages[0].body_text).toBe('Correct thread');
  });
  it('populates Reply all from the opened message without including the work mailbox', async () => {
    axios.get.mockResolvedValue({ data: { conversation: { id: 10, channel: 'email', inbox_from_email: 'staff@itsco.health' }, messages: [message] } });
    await state.openConversation({ id: 10 });
    state.changeReplyMode('reply_all');
    expect(state.replyTo).toBe('sender@example.org');
    expect(state.replyCc).toBe('colleague@example.org');
    state.changeReplyMode('forward');
    expect(state.replyTo).toBe(''); expect(state.replyCc).toBe('');
  });
  it('keeps independent reply drafts while switching threads', async () => {
    axios.get.mockImplementation(async (url) => ({ data: { conversation: { id: Number(url.split('/').at(-1)), channel: 'email' }, messages: [message] } }));
    await state.openConversation({ id: 10 }); state.replyText = 'Draft ten';
    await state.openConversation({ id: 20 }); state.replyText = 'Draft twenty';
    await state.openConversation({ id: 10 }); expect(state.replyText).toBe('Draft ten');
  });
  it('loads actual SMS conversations through the authenticated API', async () => {
    await state.switchMsgSuite('sms');
    expect(axios.get).toHaveBeenLastCalledWith('/api/quick-view/home', expect.objectContaining({ params: { channel: 'sms' }, withCredentials: true }));
    expect(wrapper.text()).not.toContain('Ready for that channel');
  });
  it('sends group recipients, CC/BCC and attachments and opens the resulting thread', async () => {
    axios.post.mockResolvedValue({ data: { conversation: { id: 30, messageId: 40, scheduled: true } } });
    axios.get.mockResolvedValue({ data: { conversation: { id: 30, channel: 'email' }, messages: [] } });
    state.composeToEmail = 'one@example.org, two@example.org'; state.composeCc = 'cc@example.org'; state.composeBcc = 'private@example.org'; state.composeText = 'Group email'; state.composeAttachments = [{ filename: 'notes.txt', contentBase64: 'YQ==' }];
    await state.sendCompose();
    expect(axios.post).toHaveBeenLastCalledWith('/api/quick-view/compose', expect.objectContaining({ to: 'one@example.org, two@example.org', cc: 'cc@example.org', bcc: 'private@example.org', attachments: [{ filename: 'notes.txt', contentBase64: 'YQ==' }] }), expect.any(Object));
    expect(state.activeConv.id).toBe(30); expect(state.undoSend).toMatchObject({ conversationId: 30, messageId: 40 });
  });
  it('shows a schedule load failure instead of claiming the day is empty', async () => {
    axios.get.mockRejectedValue(new Error('Unavailable'));
    await state.loadCalendar();
    expect(state.error).toContain('Could not load your schedule');
    expect(wrapper.text()).not.toContain('Nothing scheduled this day.');
  });
  it('uses the server-authorized meeting URL rather than constructing a QV-host join path', () => {
    expect(state.joinHref({ kind: 'SUPERVISION', joinKey: 4 })).toBeNull();
    expect(state.joinHref({ joinUrl: 'https://app.itsco.health/join/supervision/opaque' })).toBe('https://app.itsco.health/join/supervision/opaque');
  });
});

it('clears cached messages and drafts as soon as the session locks', async () => {
  state.replyText = 'Private draft'; state.chatReply = 'Private chat'; state.conversations = [{ id: 1 }];
  state.clearSession();
  expect(state.replyText).toBe(''); expect(state.chatReply).toBe(''); expect(state.conversations).toEqual([]); expect(state.session).toBeNull();
});
it('keeps a late chat response out of the newly selected chat', async () => {
  const pending = new Map(); axios.get.mockImplementation((url) => new Promise((resolve) => pending.set(url, resolve)));
  const first = state.openChatThread({ id: 1 }); const second = state.openChatThread({ id: 2 });
  pending.get('/api/quick-view/chat/threads/2/messages')({ data: [{ id: 20, body: 'Current' }] }); await second;
  pending.get('/api/quick-view/chat/threads/1/messages')({ data: [{ id: 10, body: 'Old' }] }); await first;
  expect(state.chatMessages.map((m) => m.body)).toEqual(['Current']);
});
it('posts a thread reply to its root and keeps independent drafts', async () => {
  axios.get.mockResolvedValue({ data: [] }); await state.openChatThread({ id: 1 }); state.chatReply = 'Root draft';
  await state.openChatReplies(42); state.chatReply = 'Thread reply'; await state.sendChatMessage();
  expect(axios.post).toHaveBeenCalledWith('/api/quick-view/chat/threads/1/messages', expect.objectContaining({ body: 'Thread reply', parentMessageId: 42 }), expect.any(Object));
  await state.openChatReplies(); expect(state.chatReply).toBe('Root draft');
});
it('restores the cancelled reply, recipients and attachments even in the current conversation', async () => {
  axios.get.mockResolvedValue({ data: { conversation: { id: 10, channel: 'email' }, messages: [message] } });
  await state.openConversation({ id: 10 });
  const draft = { text: 'Cancelled text', to: 'sender@example.org', cc: 'other@example.org', attachments: [{ filename: 'a.txt' }], mode: 'reply_all' };
  state.offerUndo(10, 50, draft); axios.post.mockResolvedValue({ data: { body: draft.text } }); await state.undoEmail();
  expect(state.replyText).toBe(draft.text); expect(state.replyCc).toBe(draft.cc); expect(state.replyAttachments).toEqual(draft.attachments);
});

it('restores forwarded content and original attachments without starting another forward', async () => {
  axios.get.mockResolvedValue({ data: { conversation: { id: 10, channel: 'email' }, messages: [] } });
  state.offerUndo(10, 50, { mode: 'forward', text: 'FYI', to: 'next@example.org', attachments: [] });
  axios.post.mockResolvedValue({ data: { body: 'FYI\nForwarded original content', attachments: [{ filename: 'original.txt', contentBase64: 'YQ==' }] } });
  await state.undoEmail(); expect(state.replyMode).toBe('reply'); expect(state.replyText).toContain('Forwarded original content'); expect(state.replyAttachments[0].filename).toBe('original.txt');
});

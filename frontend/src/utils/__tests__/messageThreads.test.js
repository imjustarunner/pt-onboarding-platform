import { groupSecureTopics } from '../messageThreads';
import { describe, expect, it } from 'vitest';
import { groupEmailThreads, emailComposeTarget, emailReplyRecipients } from '../messageThreads';
const message = (id, conversationId, subject, createdAt = '2026-09-01') => ({ id, channel: 'email', createdAt, meta: { conversationId, subject } });
describe('email conversation selection', () => {
  it('keeps identical subjects in separate conversations', () => {
    expect(groupEmailThreads([message(1, 10, 'Help'), message(2, 20, 'Re: Help')])).toHaveLength(2);
  });
  it('keeps replies in one conversation even when subjects change', () => {
    const threads = groupEmailThreads([message(1, 10, 'Help'), message(2, 10, 'Updated request')]);
    expect(threads).toHaveLength(1);
    expect(threads[0].conversationId).toBe(10);
  });
  it('orders messages chronologically and threads by most recent activity', () => {
    const threads = groupEmailThreads([message(3, 10, 'Help', '2026-09-03'), message(1, 10, 'Help'), message(2, 20, 'Other', '2026-09-02')]);
    expect(threads.map((t) => t.conversationId)).toEqual([10, 20]);
    expect(threads[0].messages.map((m) => m.id)).toEqual([1, 3]);
  });
  it('never reuses a selected conversation for New email', () => {
    expect(emailComposeTarget({ mode: 'new', activeThread: { conversationId: 10 } })).toEqual({ mode: 'new' });
  });
  it('uses the displayed thread for a reply and refuses a missing thread', () => {
    expect(emailComposeTarget({ mode: 'reply', activeThread: { conversationId: 20 } })).toEqual({ mode: 'reply', conversationId: 20 });
    expect(() => emailComposeTarget({ mode: 'reply' })).toThrow('Open a conversation');
  });
});
describe('reply recipients', () => {
  const inbound = [{ direction: 'inbound', from: { email: 'alice@example.org' }, to: [{ email: 'messages@itsco.health' }, { email: 'bob@example.org' }], cc: [{ email: 'BOB@example.org' }, { email: 'carol@example.org' }], bcc: [{ email: 'private@example.org' }] }];
  it('replies to the actual sender rather than the original primary participant', () => {
    expect(emailReplyRecipients(inbound, { fallbackEmail: 'support@itsco.health' })).toEqual({ to: ['alice@example.org'], cc: [] });
  });
  it('includes To and CC once in reply-all, excludes self and never exposes BCC', () => {
    expect(emailReplyRecipients(inbound, { mode: 'reply_all', inboxEmail: 'messages@itsco.health' })).toEqual({ to: ['alice@example.org'], cc: ['bob@example.org', 'carol@example.org'] });
  });
  it('starts forwards with empty recipients', () => {
    expect(emailReplyRecipients(inbound, { mode: 'forward' })).toEqual({ to: [], cc: [] });
  });
  it('continues an outbound group email to its original visible recipients', () => {
    expect(emailReplyRecipients([{ direction: 'outbound', to: [{ email: 'a@example.org' }, { email: 'b@example.org' }], cc: [{ email: 'c@example.org' }] }], { mode: 'reply_all' }))
      .toEqual({ to: ['a@example.org', 'b@example.org'], cc: ['c@example.org'] });
  });
});

describe('secure topic identity', () => {
  it('keeps equal titles separate and joins replies by topic ID', () => {
    const m = (id, topicId) => ({ id, channel: 'secure', createdAt: '2026-09-11', meta: { messageId: id, threadId: 1, topicId, subject: 'Same title' } });
    const topics = groupSecureTopics([m(1, 'a'), m(2, 'b'), m(3, 'a')]);
    expect(topics).toHaveLength(2);
    expect(topics.find((t) => t.topicId === 'a').messages.map((m) => m.id)).toEqual([1, 3]);
  });
  it('groups legacy replies only by root message and thread IDs', () => {
    const m = (id, threadId, root) => ({ id, channel: 'secure', createdAt: '2026-09-11', meta: { messageId: id, threadId, legacyRootMessageId: root, subject: 'Same title' } });
    expect(groupSecureTopics([m(1, 1, 1), m(2, 1, 1), m(3, 2, 1), m(4, 1, 4)]).map((t) => t.messages.length).sort()).toEqual([1, 1, 2]);
  });
});

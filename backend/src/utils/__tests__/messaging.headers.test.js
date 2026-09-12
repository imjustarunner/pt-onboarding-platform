import { describe, expect, it } from 'vitest';
import { emailReplyHeaders, replyMessageIds } from '../emailThreading.js';
import { buildMimeMessage } from '../../services/unifiedEmail/mime.js';
describe('email threading headers', () => {
  it('prioritizes direct parent then nearest ancestor, ignoring provider IDs', () => {
    expect(replyMessageIds('<parent@example.org>', '<root@example.org> <parent@example.org>'))
      .toEqual(['<parent@example.org>', '<root@example.org>']);
    expect(replyMessageIds('18ac019f')).toEqual([]);
  });
  it('threads follow-ups after outbound mail and skips scheduled/failed messages and notes', () => {
    expect(emailReplyHeaders([
      { internet_message_id: '<outbound@example.org>', references_header: '<root@example.org>', direction: 'outbound' },
      { internet_message_id: '<queued@example.org>', send_status: 'scheduled' },
      { internet_message_id: '<note@example.org>', is_internal_note: true }
    ])).toEqual({ inReplyTo: '<outbound@example.org>', referencesHeader: '<root@example.org> <outbound@example.org>' });
  });
  it('does not inherit reply headers on forwards', () => {
    expect(emailReplyHeaders([{ internet_message_id: '<old@example.org>' }], 'forward')).toEqual({ inReplyTo: null, referencesHeader: null });
  });
  it('puts the persisted RFC Message-ID in the actual MIME message', () => {
    const mime = buildMimeMessage({ to: 'a@example.org', from: 'messages@itsco.health', subject: 'Hello', text: 'Hi', messageId: '<stable@itsco.health>' });
    expect(mime).toContain('Message-ID: <stable@itsco.health>\r\n');
  });
});

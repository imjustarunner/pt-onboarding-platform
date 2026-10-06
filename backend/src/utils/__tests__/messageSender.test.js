import { describe, expect, it } from 'vitest';
import { messageSender } from '../messageSender.js';
describe('message sender metadata', () => {
  it('uses the external message author, independent of thread participants', () => {
    expect(messageSender(JSON.stringify({ name: 'External Sender', email: 'external@example.com' })))
      .toEqual({ name: 'External Sender', email: 'external@example.com' });
  });
  it('handles address arrays and email-only senders', () => {
    expect(messageSender([{ email: 'external@example.com' }])).toEqual({ name: 'external@example.com', email: 'external@example.com' });
  });
  it.each([null, '', 'invalid JSON', 'null', '{}'])('allows a safe fallback for missing or malformed metadata %s', raw => {
    expect(messageSender(raw)).toBeNull();
  });
});

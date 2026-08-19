import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHOOL_REPLY_INTENT_KEYS,
  buildReplyLibraryPromptBlock,
  inferIntentFromTicket,
  summarizeLibrarySources,
  tokenizeReplyLibraryQuery
} from '../../utils/schoolSupportReplyLibrary.shared.js';

describe('schoolSupportReplyLibrary.shared', () => {
  it('tokenizes query text for matching', () => {
    const terms = tokenizeReplyLibraryQuery('Please send a status update for the referral packet');
    assert.ok(terms.includes('status'));
    assert.ok(terms.includes('update'));
    assert.ok(terms.includes('referral'));
    assert.ok(terms.includes('packet'));
  });

  it('infers status intent from ticket subject', () => {
    const intent = inferIntentFromTicket({
      subject: 'Status update for Jane Doe',
      question: 'Where are we on paperwork?'
    });
    assert.equal(intent, 'school_status_request');
  });

  it('prefers metadata intent when present', () => {
    const intent = inferIntentFromTicket({
      subject: 'Hello',
      ai_draft_metadata_json: { detectedIntentClasses: ['packet_received'] }
    });
    assert.equal(intent, 'packet_received');
  });

  it('builds a prompt block from library matches', () => {
    const block = buildReplyLibraryPromptBlock([
      {
        id: 1,
        intentKey: 'school_status_request',
        intentLabel: 'Client status update',
        title: 'Status waiting on ROI',
        bodyTemplate: 'Thanks for checking in. We are still waiting on the ROI.'
      }
    ]);
    assert.match(block, /Approved reply library snippets/);
    assert.match(block, /Status waiting on ROI/);
    assert.match(block, /waiting on the ROI/);
  });

  it('summarizes library sources for API responses', () => {
    const sources = summarizeLibrarySources([
      { id: 5, title: 'Packet received', intentKey: 'packet_received' }
    ]);
    assert.deepEqual(sources, [{ id: 5, title: 'Packet received', intentKey: 'packet_received', intentLabel: 'Packet / referral received' }]);
  });

  it('exports expected intent keys', () => {
    assert.ok(SCHOOL_REPLY_INTENT_KEYS.includes('school_status_request'));
    assert.ok(SCHOOL_REPLY_INTENT_KEYS.includes('general'));
  });
});

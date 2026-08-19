import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPromptGuardrailsBlock,
  computeEditSummary
} from '../schoolSupportReplyLearning.shared.js';

describe('schoolSupportReplyLearning.shared', () => {
  it('detects unchanged drafts', () => {
    assert.equal(computeEditSummary('Hello school', 'Hello school'), 'Accepted without changes');
  });

  it('summarizes shortened staff edits', () => {
    const summary = computeEditSummary(
      'Thanks for reaching out. We are still waiting on the ROI and insurance verification before we can schedule.',
      'Thanks — still waiting on ROI.'
    );
    assert.match(summary, /Shortened/i);
  });

  it('builds prompt guardrails from staff notes', () => {
    const block = buildPromptGuardrailsBlock([
      { promptText: 'Do not promise a start date.' },
      { promptText: 'Avoid mentioning internal provider names.' }
    ]);
    assert.match(block, /Staff feedback/);
    assert.match(block, /Do not promise a start date/);
    assert.match(block, /Avoid mentioning internal provider names/);
  });
});

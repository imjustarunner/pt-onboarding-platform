import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pairThreadStaffReplies,
  stripQuotedEmailTail
} from '../gmailMessageParse.shared.js';

describe('gmailMessageParse.shared', () => {
  it('strips quoted reply tails', () => {
    const body = 'Thanks for the update.\n\nOn Tue, Jan 1, 2026 at 9:00 AM Jane <jane@school.edu> wrote:\n> old text';
    assert.equal(stripQuotedEmailTail(body), 'Thanks for the update.');
  });

  it('pairs staff sent replies with prior inbound school message', () => {
    const our = ['schoolreply@itsco.health'];
    const pairs = pairThreadStaffReplies([
      {
        id: 'in1',
        threadId: 't1',
        internalDate: 1000,
        payload: {
          headers: [
            { name: 'From', value: 'Counselor <counselor@school.edu>' },
            { name: 'Subject', value: 'Status for student' },
            { name: 'To', value: 'schoolreply@itsco.health' }
          ],
          mimeType: 'text/plain',
          body: { data: Buffer.from('Any update on paperwork?').toString('base64') }
        }
      },
      {
        id: 'out1',
        threadId: 't1',
        internalDate: 2000,
        payload: {
          headers: [
            { name: 'From', value: 'ITSCO <schoolreply@itsco.health>' },
            { name: 'Subject', value: 'Re: Status for student' },
            { name: 'To', value: 'counselor@school.edu' }
          ],
          mimeType: 'text/plain',
          body: { data: Buffer.from('We are still waiting on provider ROI.').toString('base64') }
        }
      }
    ], our);

    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].gmailMessageId, 'out1');
    assert.match(pairs[0].questionBody, /paperwork/i);
    assert.match(pairs[0].answerBody, /provider ROI/i);
  });
});

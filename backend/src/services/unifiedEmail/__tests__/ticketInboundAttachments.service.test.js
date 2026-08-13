import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectGmailAttachmentParts,
  isPdfAttachment,
  parseLikelyClientName
} from '../ticketInboundAttachments.service.js';

describe('ticket inbound attachments helpers', () => {
  it('detects PDF by mime or filename', () => {
    assert.equal(isPdfAttachment({ filename: 'packet.PDF', mimeType: 'application/octet-stream' }), true);
    assert.equal(isPdfAttachment({ filename: 'note.txt', mimeType: 'text/plain' }), false);
    assert.equal(isPdfAttachment({ filename: 'x', mimeType: 'application/pdf' }), true);
  });

  it('parses Last, First client names from ticket subjects', () => {
    assert.deepEqual(parseLikelyClientName('Sanchez, Aviannah'), {
      lastName: 'Sanchez',
      firstName: 'Aviannah'
    });
  });

  it('collects PDF parts and skips tiny inline images', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/plain', body: { data: 'abc' } },
        {
          filename: 'Aviannah packet.pdf',
          mimeType: 'application/pdf',
          body: { attachmentId: 'att1', size: 120000 }
        },
        {
          filename: '',
          mimeType: 'image/png',
          headers: [{ name: 'Content-Disposition', value: 'inline' }],
          body: { attachmentId: 'sig', size: 2400 }
        }
      ]
    };
    const parts = collectGmailAttachmentParts(payload);
    assert.equal(parts.length, 1);
    assert.equal(parts[0].filename, 'Aviannah packet.pdf');
  });
});

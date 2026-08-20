import test from 'node:test';
import assert from 'node:assert/strict';

test('prehire portal chat source key is stable', async () => {
  const { default: service } = await import('../prehirePortalChatTicket.service.js');
  assert.equal(typeof service.syncPortalChatHistoryToTicket, 'function');
  assert.equal(typeof service.syncTicketReplyToPortalChat, 'function');
});

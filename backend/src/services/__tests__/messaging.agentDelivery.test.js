import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: () => {} }));
vi.mock('../unifiedEmail/gmailClient.js', () => ({ getGmailClient: vi.fn(), getImpersonatedUser: () => 'ai@example.org' }));
vi.mock('../unifiedEmail/gmailLabels.js', () => ({ ensureLabelId: async name => name }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { findByInboundAddress: vi.fn(async () => null), findByFromEmail: vi.fn(async () => null) } }));
vi.mock('../groupMailboxRouting.service.js', () => ({ resolvePersonalMailRecipients: vi.fn() }));
vi.mock('../personalMailbox.service.js', () => ({ ingestPersonalMailboxInbound: vi.fn(), isPersonalMailboxIdentity: vi.fn() }));
import pool from '../../config/database.js';
import { getGmailClient } from '../unifiedEmail/gmailClient.js';
import { resolvePersonalMailRecipients } from '../groupMailboxRouting.service.js';
import { ingestPersonalMailboxInbound } from '../personalMailbox.service.js';
import { runInboundEmailAgentOnce } from '../unifiedEmail/inboundEmailAgent.service.js';
let gmail, headers;
beforeEach(() => {
  vi.clearAllMocks();
  pool.execute.mockImplementation(async sql => [sql.includes('SELECT from_email') ? [{ from_email: 'admin@itsco.health' }] : []]);
  headers = [{ name: 'From', value: 'admin@itsco.health' }, { name: 'To', value: 'staff@itsco.health' }, { name: 'Message-ID', value: '<group-mail@example.org>' }];
  gmail = { users: { messages: { list: vi.fn(async () => ({ data: { messages: [{ id: 'delivery' }] } })), get: vi.fn(async () => ({ data: { payload: { headers, body: { data: Buffer.from('Staff announcement').toString('base64url') } } } })), modify: vi.fn(async () => ({})) } } };
  getGmailClient.mockResolvedValue(gmail);
  resolvePersonalMailRecipients.mockResolvedValue([{ id: 11, agency_id: 2 }, { id: 12, agency_id: 2 }]);
  ingestPersonalMailboxInbound.mockResolvedValue({ ingested: true });
});
it('delivers internal staff Group mail to every addressed personal inbox before loop filtering', async () => {
  await runInboundEmailAgentOnce();
  expect(ingestPersonalMailboxInbound).toHaveBeenCalledTimes(2);
  expect(ingestPersonalMailboxInbound).toHaveBeenCalledWith(expect.objectContaining({ fromEmail: 'admin@itsco.health', identity: { id: 12, agency_id: 2 } }));
  expect(gmail.users.messages.modify).toHaveBeenCalledWith(expect.objectContaining({ requestBody: expect.objectContaining({ addLabelIds: ['AI_PROCESSED'] }) }));
});
it('leaves partial recipient delivery unacknowledged so the missing copy retries', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  ingestPersonalMailboxInbound.mockResolvedValueOnce({ ingested: true }).mockRejectedValueOnce(new Error('Temporary database failure'));
  await runInboundEmailAgentOnce();
  expect(gmail.users.messages.modify).not.toHaveBeenCalled();
});
it('delivers automated notifications without enabling automatic replies', async () => {
  headers.push({ name: 'Auto-Submitted', value: 'auto-generated' });
  await runInboundEmailAgentOnce();
  expect(ingestPersonalMailboxInbound).toHaveBeenCalledTimes(2);
  expect(ingestPersonalMailboxInbound).toHaveBeenCalledWith(expect.objectContaining({ allowAutomation: false }));
});

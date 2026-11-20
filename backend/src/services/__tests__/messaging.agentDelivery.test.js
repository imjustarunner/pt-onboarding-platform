import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../unifiedEmail/gmailInboundRetry.js',()=>({deferredInboundMessages:vi.fn(async()=>new Set()),deferInboundMessage:vi.fn(),clearInboundRetry:vi.fn()}));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: () => {} }));
vi.mock('../unifiedEmail/gmailClient.js', () => ({ getGmailClient: vi.fn(), getImpersonatedUser: () => 'ai@example.org' }));
vi.mock('../unifiedEmail/gmailLabels.js', () => ({ ensureLabelId: async name => name }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { findByInboundAddress: vi.fn(async () => null), findByFromEmail: vi.fn(async () => null) } }));
vi.mock('../schoolGroupEmailInbox.service.js',async importOriginal => ({
  ...await importOriginal(), findDirectSchoolGroup: vi.fn(async () => null), recordDirectSchoolGroupEmail: vi.fn()
}));
vi.mock('../groupMailboxRouting.service.js', () => ({ resolvePersonalMailRecipients: vi.fn() }));
vi.mock('../personalMailbox.service.js', () => ({ ingestPersonalMailboxInbound: vi.fn(), isPersonalMailboxIdentity: vi.fn() }));
import pool from '../../config/database.js';
import { getGmailClient } from '../unifiedEmail/gmailClient.js';
import { resolvePersonalMailRecipients } from '../groupMailboxRouting.service.js';
import { findDirectSchoolGroup, recordDirectSchoolGroupEmail } from '../schoolGroupEmailInbox.service.js';
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
it('files explicitly addressed school mail once in the shared inbox and keeps independent To/Cc delivery', async () => {
  headers[1].value = 'school-group@itsco.health';
  headers.push({ name: 'Delivered-To', value: 'owner@other-tenant.example.org' }, { name: 'Cc', value: 'direct@itsco.health' });
  const school = { agencyId: 2, schoolOrganizationId: 33, mailboxAddress: 'school-group@itsco.health' };
  findDirectSchoolGroup.mockResolvedValueOnce(school);
  resolvePersonalMailRecipients.mockResolvedValueOnce([{ id: 11, agency_id: 2 }]);
  await runInboundEmailAgentOnce();
  expect(recordDirectSchoolGroupEmail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    school, to: ['school-group@itsco.health'], cc: ['direct@itsco.health'], messageId: '<group-mail@example.org>'
  }));
  expect(resolvePersonalMailRecipients).toHaveBeenCalledExactlyOnceWith(['direct@itsco.health'], expect.anything());
  expect(ingestPersonalMailboxInbound).toHaveBeenCalledTimes(1);
  expect(gmail.users.messages.modify).toHaveBeenCalledTimes(1);
});
it('keeps school mail queued when the shared inbox write fails', async () => {
  findDirectSchoolGroup.mockResolvedValueOnce({ agencyId: 2, schoolOrganizationId: 33, mailboxAddress: 'staff@itsco.health' });
  recordDirectSchoolGroupEmail.mockRejectedValueOnce(new Error('Temporary write failure'));
  await runInboundEmailAgentOnce();
  expect(resolvePersonalMailRecipients).not.toHaveBeenCalled();
  expect(gmail.users.messages.modify).not.toHaveBeenCalled();
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

it('continues delivering other providers’ mail when an earlier Gmail message fails',async()=>{
 gmail.users.messages.list.mockResolvedValue({data:{messages:[{id:'broken'},{id:'working'}]}});
 gmail.users.messages.get.mockRejectedValueOnce(Object.assign(new Error('Gmail unavailable'),{code:503}));
 const result=await runInboundEmailAgentOnce();expect(result.needsHuman).toBe(1);expect(ingestPersonalMailboxInbound).toHaveBeenCalledTimes(2);
 expect(gmail.users.messages.modify).not.toHaveBeenCalledWith(expect.objectContaining({id:'broken'}));
 expect(gmail.users.messages.modify).toHaveBeenCalledWith(expect.objectContaining({id:'working'}));
});
it('stops the batch immediately when Gmail throttles instead of fetching the remaining messages',async()=>{
 gmail.users.messages.list.mockResolvedValue({data:{messages:[{id:'first'},{id:'second'}]}});gmail.users.messages.get.mockRejectedValueOnce({code:'GMAIL_MAILBOX_THROTTLED',retryAt:12345});
 await expect(runInboundEmailAgentOnce()).rejects.toMatchObject({code:'GMAIL_MAILBOX_THROTTLED'});expect(gmail.users.messages.get).toHaveBeenCalledOnce();expect(ingestPersonalMailboxInbound).not.toHaveBeenCalled();
});
it('defers a routing failure and pages past deferred messages without fetching their bodies',async()=>{
 const retry=await import('../unifiedEmail/gmailInboundRetry.js');
 resolvePersonalMailRecipients.mockRejectedValueOnce(Object.assign(new Error('Ambiguous mapping'),{code:'AMBIGUOUS_MAILBOX'}));
 await runInboundEmailAgentOnce();expect(retry.deferInboundMessage).toHaveBeenCalledWith('ai@example.org','delivery',expect.objectContaining({code:'AMBIGUOUS_MAILBOX'}));expect(gmail.users.messages.modify).not.toHaveBeenCalled();
 vi.clearAllMocks();retry.deferredInboundMessages.mockResolvedValueOnce(new Set(['deferred'])).mockResolvedValueOnce(new Set());
 gmail.users.messages.list.mockResolvedValueOnce({data:{messages:[{id:'deferred'}],nextPageToken:'page2'}}).mockResolvedValueOnce({data:{messages:[{id:'new'}]}});
 resolvePersonalMailRecipients.mockResolvedValue([{id:11,agency_id:2}]);await runInboundEmailAgentOnce();expect(gmail.users.messages.get).toHaveBeenCalledTimes(1);expect(gmail.users.messages.get).toHaveBeenCalledWith(expect.objectContaining({id:'new'}));expect(retry.clearInboundRetry).toHaveBeenCalledWith('ai@example.org','new');
});

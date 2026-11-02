import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listForClient: vi.fn() } }));
vi.mock('../../models/MessageLog.model.js', () => ({ default: { createOutbound: vi.fn(), createInbound: vi.fn(), markSent: vi.fn(), markFailed: vi.fn() } }));
vi.mock('../vonage.service.js', () => ({ default: { sendSms: vi.fn() } }));
vi.mock('../providerSmsRelaySettings.service.js', () => ({ relayEnrollmentReady: vi.fn() }));
vi.mock('../clinicalSmsSend.service.js', () => ({ sendClinicalSms: vi.fn() }));
vi.mock('../smsCompliance.service.js', () => ({ isSmsSuppressed: vi.fn() }));
import pool from '../../config/database.js';
import Client from '../../models/Client.model.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import MessageLog from '../../models/MessageLog.model.js';
import Vonage from '../vonage.service.js';
import { relayEnrollmentReady } from '../providerSmsRelaySettings.service.js';
import { sendClinicalSms } from '../clinicalSmsSend.service.js';
import { isSmsSuppressed } from '../smsCompliance.service.js';
import { forwardClientSmsToProviders, handleProviderSmsReply } from '../providerSmsRelay.service.js';
const familyPhone = '+16189107000', staffPhone = '+17192172227';
const enrollment = { id: 1, agency_id: 450, number_id: 6, provider_user_id: 1433, phone: staffPhone, enabled: 1 };
const code = 'ROWQAO-2271-1449';
const route = { enrollment_id: 1, client_id: 2271, guardian_user_id: 1449, family_phone: familyPhone, reply_code: code };
const incoming = { route: { agencyId: 450, clientId: 2271, number: { id: 6 } }, from: familyPhone, to: '+17196775413', body: 'QA question', messageId: 'in-1', inboundLogId: 40 };
const reply = { sender: { id: 6, agency_id: 450 }, from: staffPhone, to: incoming.to, body: `${code} QA answer`, messageId: 'reply-1' };
let enrollments, routes, claimed;
beforeEach(() => {
  vi.clearAllMocks(); enrollments = [enrollment]; routes = [route]; claimed = new Set();
  Client.findById.mockResolvedValue({ id: 2271, agency_id: 450, initials: 'ROWQAO' });
  ClientGuardian.listForClient.mockResolvedValue([{ guardian_user_id: 1449, phone: familyPhone, access_enabled: 1, is_active: 1, relationship_type: 'parent' }]);
  relayEnrollmentReady.mockImplementation(async e => !!e.enabled);
  isSmsSuppressed.mockResolvedValue(false);
  MessageLog.createOutbound.mockResolvedValue({ id: 50 });
  Vonage.sendSms.mockResolvedValue({ sid: 'out-1' });
  sendClinicalSms.mockResolvedValue({ messageLog: { id: 60 } });
  pool.execute.mockImplementation(async (sql, args) => {
    if (sql.startsWith('SELECT * FROM provider_sms_relay_enrollments')) return [enrollments];
    if (sql.startsWith('SELECT * FROM provider_sms_relay_routes')) return [routes.filter(r => r.reply_code === args[1])];
    if (/INSERT INTO provider_sms_relay_(dispatches|replies)/.test(sql)) {
      const key = sql.split(' ')[2] + ':' + args.slice(0, 2).join(':');
      if (claimed.has(key)) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      claimed.add(key); return [{ insertId: 99 }];
    }
    return [{ affectedRows: 1 }];
  });
});
it('forwards once to each eligible provider with guardian identity and an explicit reply code', async () => {
  enrollments.push({ ...enrollment, id: 2, provider_user_id: 1438, phone: '+12025550101' });
  await forwardClientSmsToProviders(incoming);
  await forwardClientSmsToProviders(incoming);
  expect(Vonage.sendSms).toHaveBeenCalledTimes(2);
  expect(Vonage.sendSms.mock.calls.map(([r]) => r.to)).toEqual([staffPhone, '+12025550101']);
  expect(Vonage.sendSms.mock.calls[0][0].body).toContain(`Guardian of ROWQAO: QA question\nReply ${code}`);
});
it('does not forward to disabled/unassigned providers, other tenants, revoked guardians, or MMS', async () => {
  relayEnrollmentReady.mockResolvedValue(false);
  await forwardClientSmsToProviders(incoming);
  relayEnrollmentReady.mockResolvedValue(true);
  Client.findById.mockResolvedValueOnce({ id: 2271, agency_id: 377 });
  await forwardClientSmsToProviders(incoming);
  ClientGuardian.listForClient.mockResolvedValueOnce([]);
  await forwardClientSmsToProviders(incoming);
  await forwardClientSmsToProviders({ ...incoming, mediaUrls: ['https://example.com/image'] });
  expect(Vonage.sendSms).not.toHaveBeenCalled();
});
it('routes an explicit code back only to the exact guardian through the normal care-send gate', async () => {
  expect(await handleProviderSmsReply(reply)).toBe(true);
  await handleProviderSmsReply(reply);
  expect(sendClinicalSms).toHaveBeenCalledTimes(1);
  expect(sendClinicalSms).toHaveBeenCalledWith({ userId: 1433, clientId: 2271, numberId: 6, body: 'QA answer', relayRecipient: { phone: familyPhone, guardianUserId: 1449 } });
});
it.each(['QA answer', 'YES', 'OTHER-123-456 QA answer'])('sends provider-only guidance for %s, without guessing a family', async body => {
  await handleProviderSmsReply({ ...reply, body });
  expect(sendClinicalSms).not.toHaveBeenCalled();
  expect(Vonage.sendSms).toHaveBeenCalledWith(expect.objectContaining({ to: staffPhone, body: expect.stringContaining('Message not forwarded') }));
});
it('consumes a disabled or STOPped provider phone without treating it as a family', async () => {
  enrollments = [{ ...enrollment, enabled: 0 }];
  expect(await handleProviderSmsReply(reply)).toBe(true);
  enrollments = [enrollment]; isSmsSuppressed.mockResolvedValue(true);
  expect(await handleProviderSmsReply(reply)).toBe(true);
  expect(sendClinicalSms).not.toHaveBeenCalled(); expect(Vonage.sendSms).not.toHaveBeenCalled();
});
it('rechecks family membership and provider assignment on every reply', async () => {
  ClientGuardian.listForClient.mockResolvedValueOnce([]);
  await handleProviderSmsReply(reply);
  relayEnrollmentReady.mockImplementation(async (e, clientId) => !clientId);
  await handleProviderSmsReply({ ...reply, messageId: 'reply-2' });
  expect(sendClinicalSms).not.toHaveBeenCalled();
});
it('records a failed delivery for review and never retries blindly on carrier redelivery', async () => {
  sendClinicalSms.mockRejectedValueOnce(Object.assign(new Error('STOP'), { code: 'sms_opted_out' }));
  await handleProviderSmsReply(reply); await handleProviderSmsReply(reply);
  expect(sendClinicalSms).toHaveBeenCalledTimes(1);
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining("status='needs_review'"), [99]);
});

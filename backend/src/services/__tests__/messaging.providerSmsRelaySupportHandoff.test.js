import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../providerSmsRelayIdentity.service.js', () => ({ resolveRelayFamily: vi.fn() }));
vi.mock('../providerSmsRelaySettings.service.js', () => ({ relayEnrollmentReady: vi.fn() }));
vi.mock('../smsRequestedSupport.service.js', () => ({ alertRequestedSupport: vi.fn() }));
import pool from '../../config/database.js';
import Client from '../../models/Client.model.js';
import { resolveRelayFamily } from '../providerSmsRelayIdentity.service.js';
import { relayEnrollmentReady } from '../providerSmsRelaySettings.service.js';
import { alertRequestedSupport } from '../smsRequestedSupport.service.js';
import { handleProviderSupportCommand } from '../providerSmsSupportHandoff.service.js';
import { requestSmsSupportHandoff, looksLikeSchedulingRequest } from '../smsSupportHandoff.service.js';

const enrollment = { id: 1, agency_id: 450, number_id: 6, provider_user_id: 501, phone: '+12025550101', enabled: 1 };
const family = { phone: '+12025550102', guardianUserId: 1449 };
const code = 'ROWQAO-2271-1449';
const input = { enrollment, body: `${code} SUPPORT #40`, messageId: 'support-1' };
let db, offers, route, original, ticketCount, checkpoint;

beforeEach(() => {
  vi.resetAllMocks(); ticketCount = 0;
  original = { id: 40, agency_id: 450, number_id: 6, client_id: 2271, direction: 'INBOUND',
    user_id: 1433, assigned_user_id: 1433, from_number: family.phone,
    created_at: '2026-11-02 18:00:00', metadata: {} };
  offers = [{ id: 50, metadata: { originalClientId: 2271, originalInboundLogId: 40, replyCode: code } }];
  route = { client_id: 2271, guardian_user_id: 1449, family_phone: family.phone };
  Client.findById.mockResolvedValue({ id: 2271, agency_id: 450 });
  resolveRelayFamily.mockResolvedValue(family);
  relayEnrollmentReady.mockResolvedValue(true);
  alertRequestedSupport.mockResolvedValue(undefined);
  pool.execute.mockImplementation(async sql => sql.includes('FROM message_logs') ? [offers] : [[route]]);
  // Persist metadata across requests to exercise deduplication between providers
  // and families. Restore state on rollback, as the database transaction does.
  db = {
    beginTransaction: vi.fn(async () => { checkpoint = { original: structuredClone(original), ticketCount }; }),
    commit: vi.fn(), release: vi.fn(),
    rollback: vi.fn(async () => { original = checkpoint.original; ticketCount = checkpoint.ticketCount; }),
    execute: vi.fn(async (sql, args) => {
      if (sql.includes('FOR UPDATE')) {
        const expected = original && [original.id, original.agency_id, original.number_id, original.client_id];
        return [expected && JSON.stringify(args) === JSON.stringify(expected) && original.direction === 'INBOUND' ? [original] : []];
      }
      if (sql.includes('INSERT INTO support_tickets')) { ticketCount++; return [{ insertId: 60 }]; }
      if (sql.includes('supportRequestedByUserId')) original.metadata.supportChoiceTicketId = args[0];
      return [{ affectedRows: 1 }];
    })
  };
  pool.getConnection.mockResolvedValue(db);
});

it('leaves normal replies for the family-code parser', async () => {
  expect(await handleProviderSupportCommand({ ...input, body: `${code} I can help with that` })).toBeNull();
  expect(pool.execute).not.toHaveBeenCalled();
});

it.each([0, 2])('gives guidance instead of guessing when %i offers match', async count => {
  offers = Array.from({ length: count }, () => offers[0]);
  expect(await handleProviderSupportCommand({ ...input, body: 'SUPPORT' })).toMatchObject({ status: 'guidance' });
  expect(pool.getConnection).not.toHaveBeenCalled(); expect(alertRequestedSupport).not.toHaveBeenCalled();
});

it('scopes an explicit command to the provider, agency, number, phone and original message', async () => {
  const result = await handleProviderSupportCommand(input);
  expect(result).toMatchObject({ status: 'support_forwarded', ticketId: 60 });
  expect(result.body).toContain('No appointment has been changed');
  expect(pool.execute.mock.calls[0][1]).toEqual([450, 6, 501, enrollment.phone, code, code, 40, 40, 40]);
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("direction='INBOUND' FOR UPDATE"), [40, 450, 6, 2271]);
  expect(alertRequestedSupport).toHaveBeenCalledWith(40);
  expect(db.commit.mock.invocationCallOrder[0]).toBeLessThan(alertRequestedSupport.mock.invocationCallOrder[0]);
  const thread = db.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO sms_care_threads'));
  expect(thread[1]).toEqual([450, 6, 2271, 1433, 60, original.created_at]);
  expect(thread[0]).not.toContain('owner_user_id=VALUES');
});

it('accepts bare SUPPORT only for a single offered message', async () => {
  expect(await handleProviderSupportCommand({ ...input, body: ' support ' })).toMatchObject({ status: 'support_forwarded' });
  expect(ticketCount).toBe(1);
});

it.each(['agency', 'client', 'guardian', 'assignment'])('denies a handoff after %s access changes', async change => {
  if (change === 'agency') Client.findById.mockResolvedValue({ id: 2271, agency_id: 377 });
  if (change === 'client') route.client_id = 999;
  if (change === 'guardian') resolveRelayFamily.mockResolvedValue(null);
  if (change === 'assignment') relayEnrollmentReady.mockResolvedValue(false);
  expect(await handleProviderSupportCommand(input)).toMatchObject({ status: 'access_changed' });
  expect(pool.getConnection).not.toHaveBeenCalled(); expect(alertRequestedSupport).not.toHaveBeenCalled();
});

it('uses one ticket when two providers and then the family request the same original message', async () => {
  await handleProviderSupportCommand(input);
  offers = [{ ...offers[0], id: 51 }];
  const second = await handleProviderSupportCommand({ ...input, enrollment: { ...enrollment, id: 2, provider_user_id: 1438 }, messageId: 'support-2' });
  expect(second.body).toContain('already been forwarded');
  const familyRequest = await requestSmsSupportHandoff(db, { agencyId: 450, numberId: 6, clientId: 2271,
    inboundLogId: 40, requestedByUserId: null, reason: 'provider_absence' });
  expect(familyRequest).toMatchObject({ ticketId: 60, created: false }); expect(ticketCount).toBe(1);
});

it.each(['agency_id', 'number_id', 'client_id', 'direction'])('rejects an original message outside the expected %s', async field => {
  original[field] = field === 'direction' ? 'OUTBOUND' : 999;
  await expect(handleProviderSupportCommand(input)).rejects.toMatchObject({ code: 'handoff_message_unavailable' });
  expect(ticketCount).toBe(0); expect(db.rollback).toHaveBeenCalled();
  expect(db.commit).not.toHaveBeenCalled(); expect(alertRequestedSupport).not.toHaveBeenCalled();
});

it('rolls back if the original message belongs to a different family phone', async () => {
  original.from_number = '+12025550199';
  await expect(handleProviderSupportCommand(input)).rejects.toThrow('Original message recipient changed');
  expect(ticketCount).toBe(0); expect(db.commit).not.toHaveBeenCalled();
  expect(alertRequestedSupport).not.toHaveBeenCalled(); expect(db.release).toHaveBeenCalled();
});

it('retains a committed handoff when notification delivery fails', async () => {
  alertRequestedSupport.mockRejectedValue(new Error('offline'));
  expect(await handleProviderSupportCommand(input)).toMatchObject({ status: 'support_forwarded', ticketId: 60 });
  expect(ticketCount).toBe(1); expect(db.commit).toHaveBeenCalled(); expect(db.rollback).not.toHaveBeenCalled();
});

it.each(['Please cancel tomorrow', 'Can we reschedule?', 'I cannot attend', 'Move my appointment'])('offers scheduling handoff for %s', body => {
  expect(looksLikeSchedulingRequest(body)).toBe(true);
});

it('does not offer a scheduling handoff for an ordinary care message', () => {
  expect(looksLikeSchedulingRequest('Thank you for your help')).toBe(false);
});

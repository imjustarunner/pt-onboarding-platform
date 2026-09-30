import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../managedWorkspaceGroupAccess.service.js', () => ({ managedGroupEnvelope: vi.fn(async x => x) }));
vi.mock('../hubRecipientDelivery.service.js', () => ({ resolveRecipientDeliveryGate: vi.fn() }));
import pool from '../../config/database.js';
import { managedGroupEnvelope } from '../managedWorkspaceGroupAccess.service.js';
import { resolveRecipientDeliveryGate } from '../hubRecipientDelivery.service.js';
import { planEmailDelivery, recordEmailDeliveryChoice, hasInboundDeliveryChoice } from '../emailDeliveryChoice.service.js';
const request = { agencyId: 2, userId: 5, to: 'staff@example.org', requireChoice: true, now: new Date('2026-09-30T02:00:00Z') };
beforeEach(() => {
  vi.clearAllMocks();
  pool.execute.mockResolvedValue([[{ id: 6 }]]);
  resolveRecipientDeliveryGate.mockResolvedValue({ receiveAt: '2026-09-30T13:00:00Z', timezone: 'America/Denver' });
});
it('asks before queueing after-hours mail without disclosing recipients', async () => {
  await expect(planEmailDelivery(request)).rejects.toMatchObject({ status: 409, code: 'RECIPIENT_AVAILABILITY_CHOICE_REQUIRED', availability: { recipientCount: 1, nextAvailableAt: '2026-09-30T13:00:00.000Z' } });
  expect(pool.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
it('releases send-now without checking availability and retains intended recipient IDs', async () => {
  expect(await planEmailDelivery({ ...request, choice: 'now' })).toEqual({ choice: 'now', recipientIds: [6], scheduledAt: null });
  expect(resolveRecipientDeliveryGate).not.toHaveBeenCalled();
});
it('sends without a prompt when recipients have no availability gate (including SSO)', async () => {
  resolveRecipientDeliveryGate.mockResolvedValue(null);
  expect(await planEmailDelivery(request)).toEqual({ choice: 'now', recipientIds: [6], scheduledAt: null });
});
it('checks expanded managed groups and Cc/Bcc, using the last next opening for a single group email', async () => {
  managedGroupEnvelope.mockResolvedValueOnce({ to: 'a@example.org', cc: 'b@example.org', bcc: 'private@example.org' });
  pool.execute.mockResolvedValueOnce([[{ id: 6 }, { id: 7 }, { id: 8 }]]);
  resolveRecipientDeliveryGate.mockResolvedValueOnce(null).mockResolvedValueOnce({ receiveAt: '2026-09-30T13:00:00Z' }).mockResolvedValueOnce({ receiveAt: '2026-09-30T15:00:00Z' });
  expect(await planEmailDelivery({ ...request, choice: 'next_available' })).toMatchObject({ recipientIds: [6, 7, 8], scheduledAt: '2026-09-30T15:00:00.000Z' });
  expect(pool.execute.mock.calls[0][1]).toContain('private@example.org');
});
it('never bypasses group manager authorization with Send now', async () => {
  managedGroupEnvelope.mockRejectedValueOnce(Object.assign(new Error('Managers only'), { status: 403 }));
  await expect(planEmailDelivery({ ...request, choice: 'now' })).rejects.toMatchObject({ status: 403 });
  expect(pool.execute).not.toHaveBeenCalled();
});
it('rejects unsupported delivery choices', async () => {
  await expect(planEmailDelivery({ ...request, choice: 'ignore_everything' })).rejects.toMatchObject({ status: 400 });
});
it('records the author and intended recipients, never forwarding preferences', async () => {
  await recordEmailDeliveryChoice(40, 5, { choice: 'now', recipientIds: [6], scheduledAt: null });
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO communication_message_delivery_choices'), [40, 5, 'now', '[6]', null]);
});
it('only bypasses inbound holding for a correlated sent message and intended owner', async () => {
  pool.execute.mockResolvedValue([[{ recipient_user_ids: '[6]' }]]);
  expect(await hasInboundDeliveryChoice({ agencyId: 2, messageId: 50, ownerUserId: 6 })).toBe(true);
  expect(await hasInboundDeliveryChoice({ agencyId: 2, messageId: 50, ownerUserId: 7 })).toBe(false);
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining("outbound.send_status='sent'"), [2, 50]);
  pool.execute.mockResolvedValue([[]]);
  expect(await hasInboundDeliveryChoice({ agencyId: 2, messageId: 51, ownerUserId: 6 })).toBe(false);
});

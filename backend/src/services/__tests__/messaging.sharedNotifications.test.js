import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: () => {} }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { getLink: vi.fn(), isNoView: p => !!p?.noView, listForClient: vi.fn() } }));
vi.mock('../clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: vi.fn() }));
vi.mock('../secureMessageNotify.service.js', () => ({ resolveSecureMessageClaim: vi.fn(), buildSecureClaimRedirect: vi.fn(), markSecureMessageRead: vi.fn() }));
import pool from '../../config/database.js';
import ClientGuardian from '../../models/ClientGuardian.model.js';
import { listClientNotificationHistory } from '../../controllers/clientNotificationHistory.controller.js';
import { requireReminderGuardian } from '../clientContactAffiliation.service.js';
import { minimalContactSessionReminder } from '../sessionNotification.service.js';
import { resolveSecureMessageClaim, buildSecureClaimRedirect, markSecureMessageRead } from '../secureMessageNotify.service.js';
import publicClaim from '../../routes/publicSecureMessage.routes.js';
const response = () => ({ status: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });
beforeEach(() => { vi.clearAllMocks(); pool.execute.mockResolvedValue([[]]); ClientGuardian.getLink.mockResolvedValue({ access_enabled: 1 }); });
it('returns identical shared history for both guardians without bodies or recipient login links', async () => {
  pool.execute.mockImplementation(async sql => sql.includes('UNION ALL') ? [[{ id: 'email-1', channel: 'email', notification_type: 'session_reminder', recipient_address: 'contact@example.org', organization_name: 'Tutoring', delivery_status: 'sent', occurred_at: '2026-10-07', body: 'secret token', subject: 'clinical info' }]] : [[]]);
  const first = response(), second = response(), next = vi.fn();
  for (const [id, res] of [[9, first], [10, second]]) await listClientNotificationHistory({ user: { id, role: 'client_guardian' }, params: { clientId: 4 }, query: {} }, res, next);
  expect(next).not.toHaveBeenCalled(); expect(first.json.mock.calls).toEqual(second.json.mock.calls);
  expect(JSON.stringify(first.json.mock.calls)).not.toContain('secret token'); expect(JSON.stringify(first.json.mock.calls)).not.toContain('clinical info');
  const calls = pool.execute.mock.calls.filter(([sql]) => sql.includes('UNION ALL'));
  expect(calls[0][1]).toEqual([4, 4, 4, 4, 4, 4]); expect(calls[0][0]).not.toContain('guardian_user_id =');
  expect(first.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
});
it('denies an unrelated child before querying notification history', async () => {
  ClientGuardian.getLink.mockResolvedValue(null); const res = response();
  await listClientNotificationHistory({ user: { id: 9, role: 'client_guardian' }, params: { clientId: 999 }, query: {} }, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403); expect(pool.execute.mock.calls.some(([s])=>s.includes('UNION ALL'))).toBe(false);
});
it('requires an enabled, unrestricted guardian to authorize an additional reminder contact', async () => {
  await expect(requireReminderGuardian(4, 9)).resolves.toBeUndefined();
  for (const link of [null, { access_enabled: 0 }, { access_enabled: 1, permissions_json: { noView: true } }]) {
    ClientGuardian.getLink.mockResolvedValue(link); await expect(requireReminderGuardian(4, 9)).rejects.toMatchObject({ status: 403 });
  }
});
it('only includes the scheduled date and time in additional-contact reminders', () => {
  const text = minimalContactSessionReminder({ startAt: '2026-10-08T16:00:00Z', timezone: 'America/Denver', title: 'Trauma therapy', clientName: 'Child Full Name', notes: 'Clinical details', joinUrl: 'https://secret-session', providerUserId: 7 });
  expect(text).toContain('Oct 8, 2026');
  for (const value of ['Trauma', 'Child Full Name', 'Clinical details', 'secret-session', 'provider']) expect(text).not.toContain(value);
});
it('a public claim records a link visit but never a recipient read', async () => {
  resolveSecureMessageClaim.mockResolvedValue({ id: 1, agency_id: 2, chat_thread_id: 5 });
  buildSecureClaimRedirect.mockResolvedValue({ loginUrl: '/login' });
  const handler = publicClaim.stack.find(r => r.route?.path === '/:token').route.stack[0].handle;
  const res = response(), next = vi.fn(); await handler({ params: { token: 'claim' } }, res, next);
  expect(next).not.toHaveBeenCalled(); expect(markSecureMessageRead).not.toHaveBeenCalled();
  expect(pool.execute.mock.calls[0][1][5]).toBe('notification_link_opened');
});

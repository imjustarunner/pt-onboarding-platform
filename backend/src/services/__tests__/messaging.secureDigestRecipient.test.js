import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: () => {} }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn(async () => ({ id: 'sent' })), sendNotificationEmail: vi.fn() }));
vi.mock('../emailSettings.service.js', () => ({ getAgencyEmailSettings: vi.fn(async () => ({})) }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 2, name: 'ITSCO', slug: 'itsco', timezone: 'America/Denver' })) } }));
vi.mock('../tenantMessageMailboxes.service.js', () => ({ ensureTenantMessageMailboxes: vi.fn(async () => ({ messages: { id: 1, from_email: 'messages@itsco.health' } })) }));
vi.mock('../availabilityWindow.service.js', () => ({ resolveAvailabilitySchedule: vi.fn(async () => ({ timezone: 'America/Denver' })) }));
vi.mock('../googleWorkspaceDirectory.service.js', () => ({ default: { isConfigured: () => true, getUser: vi.fn(async () => null), getGroup: vi.fn(async () => ({ id: 1 })) } }));
import pool from '../../config/database.js';
import { sendEmailFromIdentity } from '../unifiedEmail/unifiedEmailSender.service.js';
import { runHubSecureUnreadDigestTick } from '../inboxDigest.service.js';
const user = { user_id: 5, agency_id: 2, role: 'provider', email: 'provider@itsco.health', personal_email: 'private@example.org', personal_email_notify: 0, sso_password_override: 0, login_is_group_email: 0, digest_hours: 24 };
beforeEach(() => { vi.clearAllMocks(); });
function rows(person) { pool.execute.mockImplementation(async sql => sql.includes('SELECT u.id AS user_id') ? [[person]] : sql.includes('SELECT t.id AS thread_id') ? [[{ thread_id: 1, message_id:9, oldest_unread_at: '2026-09-01T00:00:00Z', unread_count: 2 }]] : [{ affectedRows: 1 }]); }
it('delivers an SSO secure-message digest to the work login even with personal reminders disabled', async () => {
  rows(user); await runHubSecureUnreadDigestTick({ now: new Date('2026-09-03T18:00:00Z') });
  expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({ to: user.email, templateType: 'hub_secure_unread_digest' }));
  expect(JSON.stringify(sendEmailFromIdentity.mock.calls)).not.toContain(user.personal_email);
});
it('respects personal-email opt-out for a verified app-only provider', async () => {
  rows({ ...user, sso_password_override: 1, login_is_group_email: 1 });
  await runHubSecureUnreadDigestTick({ now: new Date('2026-09-03T18:00:00Z') });
  expect(sendEmailFromIdentity).not.toHaveBeenCalled();
});

it('does not send outside availability hours', async () => {
  rows(user); await runHubSecureUnreadDigestTick({ now: new Date('2026-09-04T02:00:00Z') });
  expect(sendEmailFromIdentity).not.toHaveBeenCalled();
});
it('does not send again when another worker already claimed the attempt', async () => {
  rows(user);
  const query = pool.execute.getMockImplementation();
  pool.execute.mockImplementation(async sql => sql.startsWith('INSERT IGNORE INTO user_chat_email_reminders') ? [{ affectedRows: 0 }] : query(sql));
  expect(await runHubSecureUnreadDigestTick({ now: new Date('2026-09-03T18:00:00Z') })).toMatchObject({ sent: 0 });
  expect(sendEmailFromIdentity).not.toHaveBeenCalled();
});
it('records a held attempt without counting it as delivered', async () => {
  rows(user); sendEmailFromIdentity.mockResolvedValueOnce({ id: 'held', blocked: true });
  expect(await runHubSecureUnreadDigestTick({ now: new Date('2026-09-03T18:00:00Z') })).toMatchObject({ sent: 0 });
  const claimIndex = pool.execute.mock.calls.findIndex(([sql]) => sql.startsWith('INSERT IGNORE INTO user_chat_email_reminders'));
  expect(claimIndex).toBeGreaterThan(-1);
  expect(pool.execute.mock.invocationCallOrder[claimIndex]).toBeLessThan(sendEmailFromIdentity.mock.invocationCallOrder[0]);
});

it('honors immediate notification for new chat activity without waiting for the previous digest cooldown',async()=>{
 rows({...user,personal_email_delay_mode:'immediate',last_inbox_digest_at:'2026-09-03T17:59:00Z'});
 await runHubSecureUnreadDigestTick({now:new Date('2026-09-03T18:00:00Z')});expect(sendEmailFromIdentity).toHaveBeenCalledOnce();
 const query=pool.execute.mock.calls.find(([sql])=>sql.includes('SELECT t.id AS thread_id'))[0];expect(query).toContain('user_chat_email_reminders');expect(query).not.toContain('m.created_at >');
});

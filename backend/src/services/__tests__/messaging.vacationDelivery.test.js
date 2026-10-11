import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ sql: vi.fn(), vacation: vi.fn(), planned: vi.fn(), claim: vi.fn(), release: vi.fn(), send: vi.fn(), inbox: vi.fn(), add: vi.fn(), available: vi.fn(), settings: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.sql } }));
vi.mock('../vacationResponder.service.js', () => ({ resolveVacation: m.vacation, currentPlannedOut: m.planned, claimVacationReply: m.claim, releaseVacationReply: m.release, vacationDefaults: async () => ({ templates: { provider_denver: 'Hello {provider_name}. Away until {return_at}. {support_contact}' }, supportContact: 'support@example.test' }) }));
vi.mock('../emailSettings.service.js', () => ({ getAgencyEmailSettings: m.settings }));
vi.mock('../availabilityWindow.service.js', () => ({ isUserAvailable: m.available, nextAvailableAt: () => new Date('2026-10-15T15:00:00Z'), formatReturnAt: () => 'October 15 at 9 AM MDT', addBusinessHours: vi.fn(), resolveAvailabilitySchedule: vi.fn() }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: m.send }));
vi.mock('../../models/CommunicationInbox.model.js', () => ({ default: { findById: m.inbox } }));
vi.mock('../../models/CommunicationConversation.model.js', () => ({ default: { addMessage: m.add } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: async () => ({ first_name: '<Pat>', last_name: 'Test' }) } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ id: 2, name: 'Test Agency' }) } }));
vi.mock('../afterHoursEmailPolicy.service.js',()=>({eligibleClientAfterHoursReply:async()=>({id:7})}));
vi.mock('../tenantMessageMailboxes.service.js',()=>({resolveMessagesSendMailbox:async()=>({identity:{id:5},fromEmail:'messages@example.test',displayName:'Agency Messages'})}));
import { maybeSendClientOooAutoReply as reply } from '../emailAutomation.service.js';
const args = { agencyId: 2, conversationId: 9, ownerUserId: 7, fromEmail: 'new@example.test', subject: 'Hello' };
beforeEach(() => {
  vi.clearAllMocks(); m.sql.mockResolvedValue([[{ id: 9, sender_trust: 'unknown', inbox_id: 3, auto_reply_sent_at: '2026-09-01' }]]);
  m.settings.mockResolvedValue({ clientOooAutoReplyEnabled: true }); m.inbox.mockResolvedValue({ id: 3, agency_id: 2, kind: 'personal', owner_user_id: 7, sender_identity_id: 5, from_email: 'provider@example.test' });
  m.vacation.mockResolvedValue({ state: 'active', endsAt: '2026-10-15T15:00:00Z', timeZone: 'America/Denver', templateKey: 'provider_denver' });
  m.available.mockResolvedValue({ available: true, schedule: { enabled: true, timezone: 'America/Denver' } });
  m.planned.mockResolvedValue(null); m.claim.mockResolvedValue({ hash: 'abc', at: '2026-10-10' }); m.send.mockResolvedValue({ id: 'gmail-id', internetMessageId: '<internet@example.test>' }); m.add.mockResolvedValue({ id: 4 }); m.release.mockResolvedValue();
});
it('uses opted-in vacation for a new contact during normal working hours, even on an old conversation', async () => {
  expect(await reply(args)).toMatchObject({ sent: true });
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hello <Pat> Test. Away until October 15 at 9 AM MDT. support@example.test', html: expect.stringContaining('&lt;Pat&gt;') }));
  expect(m.add).toHaveBeenCalledWith(expect.objectContaining({ autoReplyKind: 'vacation' })); expect(m.release).not.toHaveBeenCalled();
});
it.each(['off','waiting','expired'])('does not send a vacation message when %s', async state => {
  m.vacation.mockResolvedValue({ state }); expect(await reply(args)).toMatchObject({ sent: false }); expect(m.send).not.toHaveBeenCalled();
});
it('uses general unavailable reply for planned out without opt-in', async () => {
  m.sql.mockResolvedValue([[{ id: 9, sender_trust: 'client', inbox_id: 3 }]]); m.vacation.mockResolvedValue({ state: 'off' }); m.planned.mockResolvedValue({ id: 4 });
  expect(await reply(args)).toMatchObject({ sent: true }); expect(m.send.mock.calls[0][0].text).toContain('currently unavailable'); expect(m.send.mock.calls[0][0].text).not.toContain('October 15'); expect(m.claim).not.toHaveBeenCalled();
});
it('never sends personal vacation notices from a shared or mismatched inbox', async () => {
  for (const patch of [{ kind: 'shared' }, { agency_id: 8 }, { owner_user_id: 8 }]) {
    m.inbox.mockResolvedValue({ agency_id: 2, kind: 'personal', owner_user_id: 7, sender_identity_id: 5, ...patch });
    expect(await reply(args)).toMatchObject({ sent: false });
  }
  expect(m.send).not.toHaveBeenCalled();
});
it('honors the agency automation switch, sender blocks, and cooldown', async () => {
  m.settings.mockResolvedValueOnce({ clientOooAutoReplyEnabled: false }); expect(await reply(args)).toMatchObject({ reason: 'disabled' });
  m.sql.mockResolvedValueOnce([[{ id: 9, sender_trust: 'blocked' }]]); expect(await reply(args)).toMatchObject({ reason: 'blocked' });
  m.claim.mockResolvedValue(null); expect(await reply(args)).toMatchObject({ reason: 'vacation_cooldown' }); expect(m.send).not.toHaveBeenCalled();
});
it.each([{ skipped: true }, { blocked: true }, { queued: true }])('does not record a held send as delivered: %j', async result => {
  m.send.mockResolvedValue(result); expect(await reply(args)).toMatchObject({ sent: false }); expect(m.add).not.toHaveBeenCalled(); expect(m.release).toHaveBeenCalledOnce();
});
it('releases the claim on delivery failure', async () => {
  m.send.mockRejectedValue(new Error('offline')); expect(await reply(args)).toMatchObject({ sent: false }); expect(m.release).toHaveBeenCalledOnce();
});

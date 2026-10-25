import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../smsCompliance.service.js', () => ({ resolveRegisteredSmsSender: vi.fn(), getSmsSender: vi.fn(), prepareSmsDelivery: vi.fn() }));
vi.mock('../meetingInvitations.service.js', () => ({ personalMeetingInvitation: vi.fn() }));
vi.mock('../vonage.service.js', () => ({ default: {} }));
vi.mock('../../models/NotificationSmsLog.model.js', () => ({ default: {} }));
import { createSupervisionRsvpSms, isSupervisionRsvpReminder } from '../supervisionRsvpSms.service.js';
import { staffCommunicationKey, phoneFingerprint } from '../../utils/staffCommunicationChoices.js';
const session = { id: 20, agency_id: 2, session_type: 'group', enrollment_mode: 'invited', start_at: '2099-10-20 23:00:00', event_timezone: 'America/Denver' };
const user = { id: 8 };
const phone = '+17195550123';
const registration = {
 brandId: 'brand', campaignId: 'campaign2', resellerId: 'reseller', brandName: 'ITSCO', legalName: 'ITSCO', supportContact: 'support@itsco.health',
 website: 'https://itsco.health', privacyUrl: 'https://itsco.health/privacy', termsUrl: 'https://itsco.health/terms', evidenceUrl: 'https://itsco.health/consent',
 purposes: ['polling', 'workforce'], keywordOwner: 'application', approved: true, numberLinked: true
};
function setup() {
 const row = { ...session, personal_phone: phone, sms_enabled: 1, notification_categories: { [staffCommunicationKey(2)]: { choices: { notifications: true }, phoneHash: phoneFingerprint(phone) } } };
 const receipts = new Set();
 let eligibilityReads = 0;
 const state = { row, afterRead: null };
 const deps = {
  db: { execute: vi.fn(async (sql, args) => {
   if (sql.startsWith('SELECT s.*')) {
    eligibilityReads++;
    const current = state.afterRead ? state.afterRead(eligibilityReads, state.row) : state.row;
    return [current ? [current] : []];
   }
   if (sql.startsWith('INSERT IGNORE')) {
    const key = args.join('|');
    if (receipts.has(key)) return [{ affectedRows: 0 }];
    receipts.add(key); return [{ affectedRows: 1, insertId: 30 }];
   }
   return [{ affectedRows: 1 }];
  }) },
  resolveSender: vi.fn(async () => '+17195550999'), readSender: vi.fn(async () => ({ registration })),
  prepare: vi.fn(async () => ({})), send: vi.fn(async () => ({ sid: 'sms-1' })),
  log: { create: vi.fn(async () => ({ id: 40 })), updateStatus: vi.fn(async () => ({})) },
  invitation: vi.fn(async () => ({ url: 'https://app.itsco.health/join/invitation/personal' }))
 };
 return { state, deps, send: createSupervisionRsvpSms(deps), request: { session, user, kind: 'join:5' } };
}
describe('mandatory pending RSVP Campaign 2 reminders', () => {
 it('sends once with the personal RSVP link, exact staff campaign and notification consent', async () => {
  const f = setup();
  await f.send(f.request); await f.send(f.request);
  expect(f.deps.send).toHaveBeenCalledOnce();
  expect(f.deps.resolveSender).toHaveBeenCalledWith({ agencyId: 2, purpose: 'workforce', requiredPurpose: 'polling' });
  expect(f.deps.send).toHaveBeenCalledWith(expect.objectContaining({ to: phone, staffNotificationKind: 'notifications', body: expect.stringContaining('Please RSVP your attendance') }));
  expect(f.deps.send.mock.calls[0][0].body).toContain('/personal?rsvp=1&eventId=20');
  const eligibilitySql = f.deps.db.execute.mock.calls[0][0];
  expect(eligibilitySql).toContain("a.status='INVITED'");
  expect(eligibilitySql).toContain('a.is_required=1 OR EXISTS');
  expect(eligibilitySql).toContain("s.status='SCHEDULED'");
  expect(eligibilitySql).toContain('s.start_at>UTC_TIMESTAMP()');
 });
 it('does not send if the current recipient is not an eligible mandatory pending RSVP', async () => {
  const f = setup(); f.state.row = null;
  await f.send(f.request); expect(f.deps.send).not.toHaveBeenCalled(); expect(f.deps.resolveSender).not.toHaveBeenCalled();
 });
 it.each(['global', 'topic', 'phone'])('requires current %s consent', async field => {
  const f = setup();
  if (field === 'global') f.state.row.sms_enabled = 0;
  if (field === 'topic') f.state.row.notification_categories[staffCommunicationKey(2)].choices.notifications = false;
  if (field === 'phone') f.state.row.personal_phone = '+17195550124';
  await f.send(f.request); expect(f.deps.send).not.toHaveBeenCalled();
 });
 it('does not substitute a patient communications campaign', async () => {
  const f = setup(); f.deps.readSender.mockResolvedValue({ registration: { ...registration, purposes: ['care', 'reminders'] } });
  expect(await f.send(f.request)).toMatchObject({ skipped: true, reason: 'event_sms_campaign_mismatch' });
  expect(f.deps.send).not.toHaveBeenCalled();
 });
 it('honors STOP and compliance preflight rejection before claiming a delivery', async () => {
  const f = setup(); f.deps.prepare.mockRejectedValue(Object.assign(new Error('STOP'), { code: 'sms_opted_out' }));
  expect(await f.send(f.request)).toMatchObject({ skipped: true, reason: 'sms_opted_out' });
  expect(f.deps.send).not.toHaveBeenCalled(); expect(f.deps.log.create).not.toHaveBeenCalled();
 });
 it.each([2, 3])('suppresses a response or removal before eligibility check %i', async read => {
  const f = setup(); f.state.afterRead = (count, row) => count >= read ? null : row;
  await f.send(f.request); expect(f.deps.send).not.toHaveBeenCalled();
 });
 it.each([1, 2, 3])('suppresses a rescheduled time at eligibility check %i', async read => {
  const f = setup(); f.state.afterRead = (count, row) => count >= read ? { ...row, start_at: '2099-10-21 23:00:00' } : row;
  await f.send(f.request); expect(f.deps.send).not.toHaveBeenCalled();
 });
 it('holds uncertain transport outcomes for review and never retries the same reminder', async () => {
  const f = setup(); f.deps.send.mockRejectedValue(new Error('timeout'));
  await f.send(f.request); await f.send(f.request);
  expect(f.deps.send).toHaveBeenCalledOnce();
  expect(f.deps.db.execute).toHaveBeenCalledWith(expect.stringContaining("delivery_status='review'"), [30]);
 });
 it('keeps signup-only, individual supervision, huddles and initial invitations out of this flow', async () => {
  for (const request of [
   { session, user, kind: 'invitation' },
   ...['day_before','join:1440','reminder:1440','presenter:1440','join:60'].map(kind=>({session,user,kind})),
   { session: { ...session, enrollment_mode: 'signup_only' }, user, kind: 'day_before' },
   { session: { ...session, session_type: 'individual' }, user, kind: 'join:5' },
   { session: { ...session, kind: 'HUDDLE' }, user, kind: 'join:5' }
  ]) {
   const f = setup(); await f.send(request); expect(f.deps.db.execute).not.toHaveBeenCalled();
  }
  expect(isSupervisionRsvpReminder(session, 'presenter:5')).toBe(true);
 });
});

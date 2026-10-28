import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), update: vi.fn(), find: vi.fn(), send: vi.fn(), lock: vi.fn(), release: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, query: m.query, getConnection: async () => ({ execute: m.lock, release: m.release }) } }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { updateById: m.update, findById: m.find } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: async () => ({ id: 2, name: 'ITSCO', slug: 'itsco' }) } }));
vi.mock('../intakeResponsesEncryption.service.js', () => ({ decryptIntakeSubmissionRows: rows => rows }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: m.send }));
vi.mock('../emailSenderIdentityResolver.service.js', () => ({ resolvePreferredSenderIdentityForAgency: async () => ({ id: 10, from_email: 'forms@itsco.health' }) }));
import { runUnfinishedEnrollmentReminderTick, dueEnrollmentReminderSlot } from '../intakeUnfinishedReminder.service.js';
const now = Date.now();
const draft = more => ({ id: 22, agency_id: 2, public_key: 'form', scope_type: 'school', session_token: 'resume-secret', status: 'consented', reminder_consent_status: 'agreed', signer_email: 'parent@example.test', reminder_consent_at: new Date(now - 25*3600000), draft_expires_at: new Date(now + 10*86400000), ...more });
beforeEach(() => {
  vi.resetAllMocks();
  m.execute.mockResolvedValue([[]]); m.lock.mockResolvedValue([[{ acquired: 1 }]]);
  m.query.mockResolvedValue([[draft()]]); m.find.mockResolvedValue(draft()); m.send.mockResolvedValue({ id: 'gmail-sent' });
});
describe('unfinished enrollment delivery', () => {
  it.each([{ skipped: true }, { queued: true }, { id: 'test-copy', redirected: true }, { ok: true }])('does not record an unsent/redirected result as notified: %j', async result => {
    m.send.mockResolvedValue(result); await runUnfinishedEnrollmentReminderTick();
    expect(m.update).not.toHaveBeenCalled(); expect(m.release).toHaveBeenCalledOnce();
  });
  it('records a confirmed send and provides a branded direct resume action', async () => {
    await runUnfinishedEnrollmentReminderTick();
    expect(m.update).toHaveBeenCalledWith(22, { reminder_24h_sent_at: expect.any(Date) });
    expect(m.send.mock.calls[0][0]).toMatchObject({ to: 'parent@example.test', intakeSubmissionId: 22 });
    expect(m.send.mock.calls[0][0].html).toContain('itsco-logo');
    expect(m.send.mock.calls[0][0].html).toContain('?session=resume-secret');
  });
  it('sends only the latest due reminder after downtime', async () => {
    const row = draft({ reminder_consent_at: new Date(now - 8*86400000) });
    m.query.mockResolvedValue([[row]]); m.find.mockResolvedValue(row);
    await runUnfinishedEnrollmentReminderTick();
    expect(m.send).toHaveBeenCalledOnce();
    expect(m.send.mock.calls[0][0].templateType).toBe('enrollment_unfinished_reminder_7d');
    expect(dueEnrollmentReminderSlot({ ...row, reminder_7d_sent_at: new Date() }, now)).toBeNull();
  });
  it.each([{ status: 'submitted' }, { submitted_at: new Date() }, { reminder_opt_out_at: new Date() }, { session_token: null }, { reminder_consent_status: 'declined' }, { draft_expires_at: new Date(now-1) }])('rechecks completion and consent before sending: %j', async changed => {
    m.find.mockResolvedValue(draft(changed)); await runUnfinishedEnrollmentReminderTick(); expect(m.send).not.toHaveBeenCalled();
  });
  it('does not duplicate an email awaiting approval', async () => {
    m.execute.mockResolvedValueOnce([[{ delivery_status: 'pending' }]]);
    await runUnfinishedEnrollmentReminderTick(); expect(m.send).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
  it('recovers a confirmed send whose slot timestamp was not saved', async () => {
    const sentAt = new Date(now-3600000); m.execute.mockResolvedValueOnce([[{ delivery_status: 'sent', sent_at: sentAt }]]);
    await runUnfinishedEnrollmentReminderTick(); expect(m.send).not.toHaveBeenCalled(); expect(m.update).toHaveBeenCalledWith(22, { reminder_24h_sent_at: sentAt });
  });
  it('does not race another server holding the worker lock', async () => {
    m.lock.mockResolvedValueOnce([[{ acquired: 0 }]]); await runUnfinishedEnrollmentReminderTick();
    expect(m.query).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled(); expect(m.release).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it, vi } from 'vitest';
const effects = vi.hoisted(() => ({ execute: vi.fn(), getConnection: vi.fn(), context: vi.fn(),
  notification: vi.fn(), mailbox: vi.fn(), email: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: effects.execute, getConnection: effects.getConnection } }));
vi.mock('../schoolContactPlan.service.js', () => ({ getContactPlanContext: effects.context,
  SCHOOL_CONTACT_DEMO_AGENCY_ID: 450, SCHOOL_CONTACT_TEST_INBOX: 'testing@itsco.health' }));
vi.mock('../communicationRouting.service.js', () => ({}));
vi.mock('../smsCompliance.service.js', () => ({}));
vi.mock('../vonage.service.js', () => ({ default: {} }));
vi.mock('../../models/Notification.model.js', () => ({ default: { coalesceOrCreate: effects.notification } }));
vi.mock('../../models/ClientNotes.model.js', () => ({ default: {} }));
vi.mock('../tenantMessageMailboxes.service.js', () => ({ resolveMessagesSendMailbox: effects.mailbox }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: effects.email }));
vi.mock('../../models/MessageLog.model.js', () => ({ default: { normalizePhone: value => value ? `+${String(value).replace(/\D/g,'').replace(/^(?=\d{10}$)/,'1')}` : null } }));
import { nextSchoolContactStep, schoolContactDemoSmsRecipient, processSchoolContactAutomation } from '../schoolContactAutomation.service.js';

const now = new Date('2026-10-30T12:00:00Z');
const plan = { status: 'enabled', sms_after_days: 3, email_after_days: 7, stale_after_hours: 72, decided_at: '2026-10-01T12:00:00Z' };
const workflow = { assignment_active: 1, client_terminal: 0, plan_decided_at: plan.decided_at };
const justBefore = instant => new Date(new Date(instant).getTime() - 1);
describe('school contact workflow decisions', () => {
  it('waits through the last millisecond before day 3, then requests one text at the boundary', () => {
    const sent = { ...workflow, initial_sent_at: '2026-10-27T12:00:00Z' };
    expect(nextSchoolContactStep(sent, plan, justBefore(now))).toBe('await_parent');
    expect(nextSchoolContactStep(sent, plan, now)).toBe('followup_sms');
    expect(nextSchoolContactStep({ ...sent, sms_completed_at: now }, plan, now)).toBe('await_parent');
  });
  it('measures day 7 from the initial email rather than the text, and never repeats the follow-up email', () => {
    const sent = { ...workflow, initial_sent_at: '2026-10-23T12:00:00Z', sms_completed_at: '2026-10-26T12:00:00Z' };
    expect(nextSchoolContactStep(sent, plan, justBefore(now))).toBe('await_parent');
    expect(nextSchoolContactStep(sent, plan, now)).toBe('followup_email');
    expect(nextSchoolContactStep({ ...sent, followup_sent_at: now }, plan, new Date('2026-11-06T12:00:00Z'))).toBe('await_parent');
  });
  it('waits through the last millisecond before 72 hours and marks the provider stale exactly once', () => {
    const replied = { ...workflow, initial_sent_at: '2026-10-20T12:00:00Z', parent_reply_at: '2026-10-27T12:00:00Z' };
    expect(nextSchoolContactStep(replied, plan, justBefore(now))).toBe('await_provider');
    expect(nextSchoolContactStep(replied, plan, now)).toBe('stale');
    expect(nextSchoolContactStep({ ...replied, stale_notified_at: now }, plan, new Date('2026-11-06T12:00:00Z'))).toBe('await_provider');
  });
  it.each([
    ['text', { initial_sent_at: '2026-10-27T12:00:00Z' }],
    ['email', { initial_sent_at: '2026-10-23T12:00:00Z', sms_completed_at: '2026-10-26T12:00:00Z' }]
  ])('a parent reply at the %s boundary prevents that follow-up', (_step, sent) => {
    expect(nextSchoolContactStep({ ...workflow, ...sent, parent_reply_at: now }, plan, now)).toBe('await_provider');
  });
  it.each(['provider_replied_at', 'external_reply_recorded_at'])('%s stops overdue follow-ups and stale reminders', field => {
    const overdue = { ...workflow, initial_sent_at: '2026-10-20T12:00:00Z', parent_reply_at: '2026-10-27T12:00:00Z', [field]: now };
    expect(nextSchoolContactStep(overdue, plan, now)).toBe('complete');
    expect(nextSchoolContactStep({ ...overdue, parent_reply_at: null }, plan, now)).toBe('complete');
  });
  it('sends one initial message then waits until the configured text and email times', () => {
    expect(nextSchoolContactStep(workflow, plan, now)).toBe('initial_email');
    const sent = { ...workflow, initial_sent_at: '2026-10-29T12:00:00Z' };
    expect(nextSchoolContactStep(sent, plan, now)).toBe('await_parent');
    const aged = { ...sent, initial_sent_at: '2026-10-20T12:00:00Z' };
    expect(nextSchoolContactStep(aged, plan, now)).toBe('followup_sms');
    expect(nextSchoolContactStep({ ...aged, sms_completed_at: now }, plan, now)).toBe('followup_email');
    expect(nextSchoolContactStep({ ...aged, sms_completed_at: now, followup_sent_at: now }, plan, now)).toBe('await_parent');
  });
  it('stops all parent followups on a reply and waits72 hours for a provider response', () => {
    expect(nextSchoolContactStep({ ...workflow, parent_reply_at: '2026-10-28T12:00:00Z' }, plan, now)).toBe('await_provider');
    expect(nextSchoolContactStep({ ...workflow, parent_reply_at: '2026-10-27T12:00:00Z' }, plan, now)).toBe('stale');
    expect(nextSchoolContactStep({ ...workflow, parent_reply_at: '2026-10-27T12:00:00Z', stale_notified_at: now }, plan, now)).toBe('await_provider');
  });
  it.each([{ external_reply_recorded_at: now }, { provider_replied_at: now }])('stops automation when provider engagement is recorded: %o', change => {
    expect(nextSchoolContactStep({ ...workflow, ...change }, plan, now)).toBe('complete');
  });
  it.each([{ status: 'declined' }, { status: 'unconfigured' }, { decided_at: '2026-10-29T12:00:00Z' }])('cancels on opt-out or a new enrollment window: %o', change => {
    expect(nextSchoolContactStep(workflow, { ...plan, ...change }, now)).toBe('cancel');
  });
  it.each([{ assignment_active: 0 }, { client_terminal: 1 }, { first_service_at: now }])('cancels when care ends or therapy begins: %o', change => {
    expect(nextSchoolContactStep({ ...workflow, ...change }, plan, now)).toBe('cancel');
  });
  it('binds demo SMS fixtures to one exact client or provider without a shared fallback', () => {
    const flags = { schoolContactPlanDemoSmsRecipients: { 'client:1': '+16189107000', 'provider:4': '+17195550100' } };
    expect(schoolContactDemoSmsRecipient(flags, { clientId: 1, phone: '618-910-7000' })).toBe('+16189107000');
    expect(schoolContactDemoSmsRecipient(flags, { clientId: 2, phone: '618-910-7000' })).toBeNull();
    expect(schoolContactDemoSmsRecipient(flags, { providerUserId: 4, phone: '+17195550100' })).toBe('+17195550100');
    expect(schoolContactDemoSmsRecipient(flags, { providerUserId: 1, phone: '+16189107000' })).toBeNull();
    expect(schoolContactDemoSmsRecipient(flags, { clientId: 1, phone: '+17195550100' })).toBeNull();
    expect(schoolContactDemoSmsRecipient({}, { clientId: 1, phone: '+16189107000' })).toBeNull();
  });
});

describe('school contact stale-reminder worker', () => {
  it('sends nothing before 72 hours, sends once at the boundary, and reuses receipts after an interrupted aggregate update', async () => {
    for (const mock of Object.values(effects)) mock.mockReset();
    const state = { ...workflow, id: 42, agency_id: 450, client_id: 2300, school_id: 451, provider_user_id: 1500,
      conversation_id: 88, initial_sent_at: '2026-10-20T12:00:00Z', parent_reply_at: '2026-10-27T12:00:00Z',
      plan_status: plan.status, current_plan_decided_at: plan.decided_at, stale_after_hours: 72, sms_after_days: 3, email_after_days: 7 };
    const steps = new Map();
    effects.context.mockResolvedValue({ userId: 1500, agency: { feature_flags: {} }, provider: { first_name: 'QA' } });
    effects.notification.mockResolvedValue({ id: 701 });
    effects.mailbox.mockResolvedValue({ identity: { id: 9 }, fromEmail: 'messages@itsco.health' });
    effects.email.mockResolvedValue({ id: 702 });
    effects.getConnection.mockImplementation(async () => ({
      execute: async () => [[{ claimed: 1 }]], release: vi.fn()
    }));
    effects.execute.mockImplementation(async (sql, args = []) => {
      if (sql.startsWith('INSERT IGNORE INTO school_contact_workflows')) return [{ affectedRows: 0 }];
      if (sql.includes('p.status AS plan_status')) return [[{ ...state }]];
      if (sql.includes('SELECT MAX(replied_at)') || sql.includes('SELECT MIN(e.occurred_at)')) return [[{ replied_at: null }]];
      if (sql.includes('SELECT p.status,p.decided_at')) return [[{ status: plan.status, decided_at: plan.decided_at }]];
      if (sql.startsWith('SELECT u.id FROM users')) return [[{ id: 1434 }]];
      if (sql.startsWith('SELECT personal_phone')) return [[{}]]; // No provider SMS fixture is enabled.
      if (sql.startsWith('INSERT IGNORE INTO school_contact_workflow_steps')) {
        if (steps.has(args[1])) return [{ affectedRows: 0 }];
        steps.set(args[1], { status: 'sending' });
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('SELECT * FROM school_contact_workflow_steps')) return [[steps.get(args[1])]];
      if (sql.startsWith('UPDATE school_contact_workflow_steps SET status=?')) {
        steps.set(args[5], { status: args[0], message_id: args[1], detail: args[2], completed_at: args[3] });
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SET stale_notified_at=?')) { state.stale_notified_at = args[0]; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE school_contact_workflows SET status=?')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected worker query: ${sql}`);
    });

    await expect(processSchoolContactAutomation({ now: justBefore(now) })).resolves.toEqual({ processed: 1 });
    expect(steps.size).toBe(0);
    expect(effects.notification).not.toHaveBeenCalled();
    expect(effects.email).not.toHaveBeenCalled();

    await processSchoolContactAutomation({ now });
    expect(effects.notification).toHaveBeenCalledTimes(1);
    expect(effects.email).toHaveBeenCalledTimes(1);
    expect(steps.get('support_alert').status).toBe('sent');
    expect(steps.get('provider_email').status).toBe('sent');
    expect(steps.get('provider_sms').status).toBe('skipped');
    expect(state.stale_notified_at).toEqual(now);

    await processSchoolContactAutomation({ now: new Date(now.getTime() + 1) });
    // Model a crash after receipts were stored but before the workflow marker persisted.
    state.stale_notified_at = null;
    await processSchoolContactAutomation({ now: new Date(now.getTime() + 2) });
    expect(effects.notification).toHaveBeenCalledTimes(1);
    expect(effects.email).toHaveBeenCalledTimes(1);
    expect(steps.size).toBe(3);
    expect(state.stale_notified_at).toEqual(new Date(now.getTime() + 2));
    expect(effects.email).toHaveBeenCalledWith(expect.objectContaining({ to: 'testing@itsco.health', bcc: 'testing@itsco.health' }));
  });
});

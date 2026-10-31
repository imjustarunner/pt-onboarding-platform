import { describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../schoolContactPlan.service.js', () => ({ SCHOOL_CONTACT_DEMO_AGENCY_ID: 450, SCHOOL_CONTACT_TEST_INBOX: 'testing@itsco.health' }));
vi.mock('../communicationRouting.service.js', () => ({}));
vi.mock('../smsCompliance.service.js', () => ({}));
vi.mock('../vonage.service.js', () => ({ default: {} }));
vi.mock('../../models/Notification.model.js', () => ({ default: {} }));
vi.mock('../../models/ClientNotes.model.js', () => ({ default: {} }));
vi.mock('../tenantMessageMailboxes.service.js', () => ({}));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({}));
vi.mock('../../models/MessageLog.model.js', () => ({ default: { normalizePhone: value => value ? `+${String(value).replace(/\D/g,'').replace(/^(?=\d{10}$)/,'1')}` : null } }));
import { nextSchoolContactStep, schoolContactDemoSmsRecipient } from '../schoolContactAutomation.service.js';

const now = new Date('2026-10-30T12:00:00Z');
const plan = { status: 'enabled', sms_after_days: 3, email_after_days: 7, stale_after_hours: 72, decided_at: '2026-10-01T12:00:00Z' };
const workflow = { assignment_active: 1, client_terminal: 0, plan_decided_at: plan.decided_at };
describe('school contact workflow decisions', () => {
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

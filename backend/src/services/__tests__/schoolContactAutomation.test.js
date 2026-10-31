vi.mock('../../models/clinical/ClinicalNote.model.js',()=>({default:{hasSignedIntakeForClient:async()=>false}}));
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
describe('three-contact school outreach decisions', () => {
  it('uses exact real 48-hour boundaries at each phase, not the worker catch-up time',()=>{
    const sent={...workflow,initial_sent_at:'2026-10-28T12:00:00Z'};
    expect(nextSchoolContactStep(sent,plan,justBefore(now))).toBe('await_parent');
    expect(nextSchoolContactStep(sent,plan,now)).toBe('second_contact');
    const second={...sent,second_contact_at:now};
    const day4=new Date('2026-11-01T12:00:00Z');
    expect(nextSchoolContactStep(second,plan,justBefore(day4))).toBe('await_parent');
    expect(nextSchoolContactStep(second,plan,day4)).toBe('final_contact');
    const final={...second,final_contact_at:day4};
    const day6=new Date('2026-11-03T12:00:00Z');
    expect(nextSchoolContactStep(final,plan,justBefore(day6))).toBe('await_parent');
    expect(nextSchoolContactStep(final,plan,day6)).toBe('provider_notice');
  });
  it('does not bunch delayed contacts into one worker run',()=>{
    const old={...workflow,initial_sent_at:'2026-10-01T12:00:00Z'};
    expect(nextSchoolContactStep(old,plan,now)).toBe('second_contact');
    expect(nextSchoolContactStep({...old,second_contact_at:now},plan,now)).toBe('await_parent');
  });
  it('stops remaining guardian messages for replies or an arranged intake, without declaring documentation complete',()=>{
    const sent={...workflow,initial_sent_at:'2026-10-01T12:00:00Z'};
    expect(nextSchoolContactStep({...sent,parent_reply_at:now},plan,now)).toBe('await_provider');
    for(const change of [{external_reply_recorded_at:now},{provider_replied_at:now},{intake_scheduled:1}])
      expect(nextSchoolContactStep({...sent,...change},plan,now)).toBe('await_intake');
  });
  it('alerts support once after a guardian has waited48hours for the provider',()=>{
    const sent={...workflow,parent_reply_at:'2026-10-28T12:00:00Z'};
    expect(nextSchoolContactStep(sent,plan,justBefore(now))).toBe('await_provider');
    expect(nextSchoolContactStep(sent,plan,now)).toBe('stale');
    expect(nextSchoolContactStep({...sent,stale_notified_at:now},plan,now)).toBe('await_provider');
  });
  it('keeps48hour documentation reminders despite a draft, scheduled intake or later provider reply',()=>{
    const waiting={...workflow,provider_notified_at:'2026-10-28T12:00:00Z',intake_scheduled:1,provider_replied_at:now};
    expect(nextSchoolContactStep(waiting,plan,justBefore(now))).toBe('await_intake');
    expect(nextSchoolContactStep(waiting,plan,now)).toBe('intake_reminder');
    expect(nextSchoolContactStep({...waiting,last_intake_reminder_at:now},plan,now)).toBe('await_intake');
    expect(nextSchoolContactStep({...waiting,intake_completed:1},plan,now)).toBe('complete');
  });
  it('does not treat first service as a finalized intake',()=>{
    expect(nextSchoolContactStep({...workflow,first_service_at:now},plan,now)).toBe('initial_email');
  });
  it.each([{status:'declined'},{status:'unconfigured'},{decided_at:'2026-10-29T12:00:00Z'}])('stops on opt-out or a new opt-in window: %o',change=>{
    expect(nextSchoolContactStep(workflow,{...plan,...change},now)).toBe('cancel');
  });
  it.each([{assignment_active:0},{client_terminal:1}])('stops when assignment/care ends: %o',change=>{
    expect(nextSchoolContactStep({...workflow,...change},plan,now)).toBe('cancel');
  });
  it('keeps client/provider SMS identities separate',()=>{
    const flags={schoolContactPlanDemoSmsRecipients:{'client:1':'+16189107000','provider:4':'+17195550100'}};
    expect(schoolContactDemoSmsRecipient(flags,{clientId:1,phone:'6189107000'})).toBe('+16189107000');
    expect(schoolContactDemoSmsRecipient(flags,{clientId:2,phone:'6189107000'})).toBeNull();
    expect(schoolContactDemoSmsRecipient(flags,{providerUserId:1,phone:'6189107000'})).toBeNull();
  });
});

describe('school contact stale-reminder worker', () => {
  it('sends nothing before 48 hours, sends once at the boundary, and reuses receipts after an interrupted aggregate update', async () => {
    for (const mock of Object.values(effects)) mock.mockReset();
    const state = { ...workflow, id: 42, agency_id: 450, client_id: 2300, school_id: 451, provider_user_id: 1500,
      conversation_id: 88, initial_sent_at: '2026-10-20T12:00:00Z', parent_reply_at: '2026-10-28T12:00:00Z',
      plan_status: plan.status, current_plan_decided_at: plan.decided_at, stale_after_hours: 72, sms_after_days: 3, email_after_days: 7 };
    const steps = new Map();
    effects.context.mockResolvedValue({ userId: 1500, schools: [{id:451}], agency: { feature_flags: {} }, provider: { first_name: 'QA' } });
    effects.notification.mockResolvedValue({ id: 701 });
    effects.mailbox.mockResolvedValue({ identity: { id: 9 }, fromEmail: 'messages@itsco.health' });
    effects.email.mockResolvedValue({ id: 702 });
    effects.getConnection.mockImplementation(async () => ({
      execute: async () => [[{ claimed: 1 }]], release: vi.fn()
    }));
    effects.execute.mockImplementation(async (sql, args = []) => {
      if (sql.startsWith('INSERT IGNORE INTO school_contact_workflows')) return [{ affectedRows: 0 }];
      if (sql.includes('p.status AS plan_status')) return [[{ ...state }]];
      if (sql.startsWith('SELECT EXISTS(SELECT 1 FROM client_intake_note_drafts')) return [[{intake_completed:0,intake_scheduled:0}]];
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
        steps.set(args[7], { status: args[0], message_id: args[1], detail: args[2], completed_at: args[3] });
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

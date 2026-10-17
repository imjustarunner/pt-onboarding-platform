import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyEventTimeHandbookAmendment, applyEventTimeReviewAmendment } from '../../content/eventTimeHandbookAmendment.js';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../smsCompliance.service.js', () => ({ getSmsSender: vi.fn(), isSmsSuppressed: vi.fn() }));
vi.mock('../companyEventSms.service.js', () => ({ isCompanyEventSmsMuted: vi.fn(), sendCompanyEventSms: vi.fn() }));
vi.mock('../companyEventParticipation.service.js', () => ({ getEmployeeEventParticipation: vi.fn(), recordEmployeeEventParticipation: vi.fn() }));
import { getSmsSender, isSmsSuppressed } from '../smsCompliance.service.js';
import { isCompanyEventSmsMuted } from '../companyEventSms.service.js';
import { handleCompanyEventCheckinInbound } from '../companyEventCheckinSms.service.js';
import { processCompanyEventCheckinReminders } from '../companyEventCheckinReminder.service.js';
import { parseEventCheckinCommand, eventCheckinReminderDue, eventCheckinMessage } from '../../utils/companyEventCheckin.js';
import { defaultTreatmentForEventType } from '../eventPayrollRate.service.js';

const registration = { brandId: 'B123', campaignId: 'C2', resellerId: 'R123', brandName: 'ITSCO', legalName: 'ITSCO, LLC', supportContact: 'support@itsco.health', website: 'https://www.itsco.health', privacyUrl: 'https://www.itsco.health/privacy', termsUrl: 'https://www.itsco.health/terms', evidenceUrl: 'https://www.itsco.health/proof', purposes: ['polling', 'workforce'], keywordOwner: 'application', approved: true, numberLinked: true };
const sender = { agency_id: 2, campaign_id: 'C2', phone_number: '+13035550100', registration };
const event = { id: 4, agency_id: 2, title: 'School fair', timezone: 'America/Denver', starts_at: '2026-10-24T16:00:00Z', ends_at: '2026-10-24T20:00:00Z', staff_link_token: 'a'.repeat(48) };
const now = new Date('2026-10-24T15:30:00Z');
const incoming = { from: '+13035550101', to: sender.phone_number, body: 'CHECKIN', messageId: 'inbound-1' };
const delivery = { company_event_id: 4, code: 112, user_id: 7 };
const state = { assigned: true, isEventDay: true, canCheckIn: true, clockedIn: false, canCheckOut: false };
beforeEach(() => {
  vi.resetAllMocks(); getSmsSender.mockResolvedValue(sender); isSmsSuppressed.mockResolvedValue(false); isCompanyEventSmsMuted.mockResolvedValue(false);
});
function inboundDeps({ members = [{ id: 7 }], deliveries = [delivery], current = state } = {}) {
  const db = { execute: vi.fn(async sql => {
    if (sql.includes('SELECT DISTINCT u.id')) return [members];
    if (sql.includes('FROM company_event_sms_deliveries')) return [deliveries];
    throw new Error(sql);
  }) };
  return { db, now, participation: vi.fn().mockResolvedValue(current), record: vi.fn().mockResolvedValue({ ok: true }) };
}

describe('event check-in text routing', () => {
  it('accepts exact commands and reserves control keywords and ordinary messages', () => {
    expect(parseEventCheckinCommand(' checkin ')).toEqual({ action: 'check-in', code: null });
    expect(parseEventCheckinCommand('CHECKOUT 112')).toEqual({ action: 'check-out', code: '112' });
    for (const body of ['STOP', 'START', 'HELP', 'Y', '112', 'please CHECKIN', 'CHECKIN 1 junk']) expect(parseEventCheckinCommand(body)).toBeNull();
  });
  it('checks the assigned employee in through the shared attendance writer', async () => {
    const deps = inboundDeps();
    expect((await handleCompanyEventCheckinInbound(incoming, deps)).responseMessage).toMatch(/^Checked in/);
    expect(deps.record).toHaveBeenCalledWith(expect.objectContaining({ eventId: 4, userId: 7, action: 'check-in', source: 'employee_event_sms', idempotencyKey: 'inbound-1' }));
    const query = deps.db.execute.mock.calls[1];
    expect(query[0]).toContain("d.status IN ('sent', 'delivered')");
    expect(query[1]).toEqual([2, 7, incoming.from, sender.phone_number, 'C2', now]);
  });
  it('requires explicit event selection when several assignments are available', async () => {
    const deps = inboundDeps({ deliveries: [delivery, { ...delivery, company_event_id: 5, code: 113 }] });
    expect((await handleCompanyEventCheckinInbound(incoming, deps)).responseMessage).toMatch(/CHECKIN.*112, 113/);
    expect(deps.record).not.toHaveBeenCalled();
    await handleCompanyEventCheckinInbound({ ...incoming, body: 'CHECKIN 113' }, deps);
    expect(deps.record).toHaveBeenCalledWith(expect.objectContaining({ eventId: 5 }));
  });
  it('deduplicates delivery rows and allows checkout for an open attendance record', async () => {
    const deps = inboundDeps({ deliveries: [delivery, delivery], current: { ...state, canCheckIn: false, clockedIn: true, canCheckOut: true } });
    expect((await handleCompanyEventCheckinInbound({ ...incoming, body: 'CHECKOUT' }, deps)).responseMessage).toMatch(/^Checked out/);
    expect(deps.record).toHaveBeenCalledTimes(1);
    expect(deps.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'check-out' }));
  });
  it('does not record for ambiguous identity, unassigned staff, stale dates, opt-outs or muted events', async () => {
    for (const options of [{ members: [{ id: 7 }, { id: 8 }] }, { deliveries: [] }, { current: { ...state, assigned: false } }, { current: { ...state, isEventDay: false } }]) {
      const deps = inboundDeps(options); await handleCompanyEventCheckinInbound(incoming, deps); expect(deps.record).not.toHaveBeenCalled();
    }
    const deps = inboundDeps();
    isSmsSuppressed.mockResolvedValue(true);
    await handleCompanyEventCheckinInbound(incoming, deps); expect(deps.record).not.toHaveBeenCalled();
    isSmsSuppressed.mockResolvedValue(false); isCompanyEventSmsMuted.mockResolvedValue(true);
    await handleCompanyEventCheckinInbound(incoming, deps); expect(deps.record).not.toHaveBeenCalled();
  });
  it('handles a retracted assignment and replay without claiming a new punch', async () => {
    const deps = inboundDeps(); deps.record.mockRejectedValueOnce(Object.assign(new Error('Assignment removed'), { status: 403 }));
    expect((await handleCompanyEventCheckinInbound(incoming, deps)).responseMessage).toContain('Assignment removed');
    deps.record.mockResolvedValueOnce({ alreadyProcessed: true });
    expect((await handleCompanyEventCheckinInbound(incoming, deps)).responseMessage).toContain('already recorded');
  });
});

describe('check-in reminder scheduling and pay defaults', () => {
  it('amends only ITSCO ready policies and draft updates without duplicating text', () => {
    const sections = ['indirect-services', 'compensation-separately-compensated-indirect-service', 'compensation-support-activity'].map(slug => ({ slug, status: 'ready', bodyHtml: '<p>Existing policy.</p>' }));
    const source = { sections };
    expect(applyEventTimeHandbookAmendment(structuredClone(source), 'nlu')).toEqual(source);
    applyEventTimeHandbookAmendment(source, 'itsco');
    const once = structuredClone(source);
    applyEventTimeHandbookAmendment(source, 'itsco'); expect(source).toEqual(once);
    for (const section of source.sections) {
      expect(section.bodyHtml).toContain('<p>Existing policy.</p>');
      expect(section.bodyHtml).toContain("employee's indirect rate");
      expect(section.bodyHtml).toContain('Support Activity → Approved Travel');
      expect(section.bodyHtml).toContain('to and from');
    }
    const updates = [{ id: 4, status: 'draft', changed_content: '<p>Prior update.</p>' }];
    applyEventTimeReviewAmendment(updates, 'itsco');
    const updated = structuredClone(updates);
    applyEventTimeReviewAmendment(updates, 'itsco'); expect(updates).toEqual(updated);
    expect(updates[0].policy_section_slugs).toHaveLength(3);
    const published = [{ id: 4, status: 'published', changed_content: '<p>Published.</p>' }];
    expect(applyEventTimeReviewAmendment(structuredClone(published), 'itsco')).toEqual(published);
  });
  it('sends within the hour before the occurrence through event end, on the local event day', () => {
    expect(eventCheckinReminderDue(event, now)).toBe(true);
    expect(eventCheckinReminderDue(event, new Date('2026-10-24T14:59Z'))).toBe(false);
    expect(eventCheckinReminderDue(event, new Date(event.ends_at))).toBe(false);
    expect(eventCheckinReminderDue({ ...event, starts_at: '2026-10-25T06:30Z', ends_at: '2026-10-25T08:00Z' }, new Date('2026-10-25T05:45Z'))).toBe(false);
    expect(eventCheckinReminderDue({ ...event, occurrence_start: '2026-10-25T16:00Z', occurrence_end: '2026-10-25T20:00Z' }, new Date('2026-10-25T15:30Z'))).toBe(true);
  });
  it('escapes event titles and links in email', () => {
    const message = eventCheckinMessage({ ...event, title: '<script>bad</script>' }, 'https://example.test/event?x="');
    expect(message.html).not.toContain('<script>'); expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).toContain('>Check in</a>'); expect(message.text).toContain('Support Activity');
  });
  it('defaults approved school and company event work to indirect and keeps clinical event treatment', () => {
    for (const type of ['school_open_house', 'school_outreach', 'school_future_event', 'company_event']) expect(defaultTreatmentForEventType(type)).toEqual({ eventType: type, rateSlot: 'indirect', useDirectIndirectSplit: false });
    expect(defaultTreatmentForEventType('skills_group').useDirectIndirectSplit).toBe(true);
  });
  it('claims email and SMS independently and sends neither twice on subsequent ticks', async () => {
    vi.stubEnv('FRONTEND_URL', 'https://example.test');
    const claimed = new Set(), statuses = [];
    const db = { execute: vi.fn(async (sql, args) => {
      if (sql.includes('FROM company_events e')) return [[event]];
      if (sql.includes('SELECT DISTINCT u.id')) return [[{ id: 7, work_email: 'staff@example.test', phone_number: incoming.from }]];
      if (sql.includes('INSERT IGNORE')) {
        const key = args.join(':'); const exists = claimed.has(key); claimed.add(key);
        return [{ affectedRows: exists ? 0 : 1, insertId: claimed.size }];
      }
      if (sql.startsWith('UPDATE company_event_checkin_reminders')) { statuses.push(args[0]); return [{}]; }
      throw new Error(sql);
    }) };
    const deps = { db, now, participation: vi.fn().mockResolvedValue(state), sendEmail: vi.fn().mockResolvedValue({ id: 'mail-1' }), sendSms: vi.fn().mockRejectedValue(Object.assign(new Error('No opt-in'), { status: 403, code: 'sms_consent_missing' })) };
    await processCompanyEventCheckinReminders(deps); await processCompanyEventCheckinReminders(deps);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1); expect(deps.sendSms).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(['sent', 'skipped']);
    expect(deps.sendEmail.mock.calls[0][0].url).toContain('#event-check-in');
    vi.unstubAllEnvs();
  });
  it('skips reminders for employees already clocked in or no longer assigned', async () => {
    vi.stubEnv('FRONTEND_URL', 'https://example.test');
    const db = { execute: vi.fn(async sql => sql.includes('FROM company_events e') ? [[event]] : [[{ id: 7, email: 'staff@example.test' }]]) };
    const sendEmail = vi.fn();
    await processCompanyEventCheckinReminders({ db, now, participation: vi.fn().mockResolvedValue({ canCheckIn: false }), sendEmail });
    expect(sendEmail).not.toHaveBeenCalled(); expect(db.execute).toHaveBeenCalledTimes(2);
    vi.unstubAllEnvs();
  });
});

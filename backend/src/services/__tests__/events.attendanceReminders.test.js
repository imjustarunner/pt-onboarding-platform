import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../companyEventParticipation.service.js', () => ({ getEmployeeEventParticipation: vi.fn() }));
vi.mock('../companyEventSms.service.js', () => ({ sendCompanyEventSms: vi.fn() }));
import { processCompanyEventCheckinReminders } from '../companyEventCheckinReminder.service.js';
import { eventAttendanceReminderType, eventCheckinMessage } from '../../utils/companyEventCheckin.js';

const event = { id: 4, agency_id: 2, title: 'School fair', timezone: 'America/Denver',
  starts_at: '2026-10-24T16:00:00Z', ends_at: '2026-10-24T20:00:00Z', staff_link_token: 'staff-token' };
const before = '2026-10-24T15:00:00Z', start = event.starts_at, overdue = '2026-10-24T20:30:00Z';
const unclocked = { assigned: true, canCheckIn: true, canCheckOut: false, lastPunch: null };
const open = { assigned: true, canCheckIn: false, canCheckOut: true, lastPunch: { id: 10, type: 'clock_in', at: event.starts_at } };
afterEach(() => vi.unstubAllEnvs());

function harness({ occurrence = event, state = unclocked, clockIns = [], phone = '+13035550101' } = {}) {
  vi.stubEnv('FRONTEND_URL', 'https://example.test');
  const claims = new Map();
  const db = { execute: vi.fn(async (sql, args) => {
    if (sql.includes('FROM company_events e')) return [[{ ...occurrence }]];
    if (sql.includes('SELECT DISTINCT u.id')) return [[{ id: 7, work_email: 'staff@example.test', phone_number: phone }]];
    if (sql.includes('FROM skill_builders_event_kiosk_punches')) return [clockIns];
    if (sql.includes('INSERT IGNORE INTO company_event_checkin_reminders')) {
      const key = args.join(':');
      if (claims.has(key)) return [{ affectedRows: 0 }];
      const row = { id: claims.size + 1, args };
      claims.set(key, row);
      return [{ affectedRows: 1, insertId: row.id }];
    }
    if (sql.startsWith('UPDATE company_event_checkin_reminders')) {
      Object.assign([...claims.values()].find(row => row.id === args[2]), { status: args[0], reason: args[1] });
      return [{}];
    }
    throw new Error(sql);
  }) };
  const deps = { db, participation: vi.fn().mockResolvedValue(state), sendEmail: vi.fn().mockResolvedValue({ id: 'email' }), sendSms: vi.fn().mockResolvedValue({ status: 'sent' }) };
  return { ...deps, claims, run: instant => processCompanyEventCheckinReminders({ ...deps, now: new Date(instant) }) };
}

describe('event attendance reminder stages', () => {
  it('uses exact start and 30-minute checkout thresholds and bounds stale reminders', () => {
    for (const [instant, expected] of [
      ['2026-10-24T14:59:59Z', null], [before, 'checkin'], [start, 'missing_checkin'],
      [event.ends_at, null], ['2026-10-24T20:29:59Z', null], [overdue, 'missing_checkout'],
      ['2026-10-25T20:00:00Z', null]
    ]) expect(eventAttendanceReminderType(event, new Date(instant))).toBe(expected);
    expect(eventAttendanceReminderType({ ...event, ends_at: event.starts_at }, new Date(before))).toBeNull();
  });

  it('sends email even when event SMS or the employee SMS consent is disabled', async () => {
    for (const code of ['event_sms_disabled', 'sms_consent_missing', 'sms_suppressed', 'event_sms_muted']) {
      const h = harness();
      h.sendSms.mockRejectedValue(Object.assign(new Error(code), { status: 403, code }));
      await h.run(before);
      await h.run(start);
      expect(h.sendEmail).toHaveBeenCalledTimes(2);
      expect([...h.claims.values()].map(c => c.status)).toEqual(['sent', 'skipped', 'sent', 'skipped']);
      expect(h.sendEmail.mock.calls[1][0].message.subject).toContain('Clock-in reminder');
    }
  });

  it('sends each stage once across concurrent scheduler ticks', async () => {
    const h = harness();
    await Promise.all([h.run(before), h.run(before)]);
    await Promise.all([h.run(start), h.run(start)]);
    expect(h.sendEmail).toHaveBeenCalledTimes(2);
    expect(h.sendSms).toHaveBeenCalledTimes(2);
    expect(h.sendSms.mock.calls.map(([args]) => args.dispatchType)).toEqual(['checkin_reminder', 'missing_checkin_reminder']);
    expect(new Set(h.sendSms.mock.calls.map(([args]) => args.batchId)).size).toBe(2);
  });

  it('emails employees without phones and still tries SMS if email delivery fails', async () => {
    const noPhone = harness({ phone: null });
    await noPhone.run(start);
    expect(noPhone.sendEmail).toHaveBeenCalledTimes(1);
    expect(noPhone.sendSms).not.toHaveBeenCalled();
    const failedEmail = harness();
    failedEmail.sendEmail.mockRejectedValue(new Error('Email unavailable'));
    await failedEmail.run(start);
    expect(failedEmail.sendSms).toHaveBeenCalledTimes(1);
    expect([...failedEmail.claims.values()].map(c => c.status)).toEqual(['review', 'sent']);
  });

  it('does not remind checked-in, completed, or ineligible employees to check in', async () => {
    for (const args of [
      { state: open, clockIns: [{ id: 10 }] },
      { state: { ...unclocked, lastPunch: { id: 11, type: 'clock_out' } }, clockIns: [{ id: 10 }] },
      { state: { ...unclocked, canCheckIn: false } }
    ]) {
      const h = harness(args);
      await h.run(start);
      expect(h.sendEmail).not.toHaveBeenCalled();
      expect(h.sendSms).not.toHaveBeenCalled();
    }
  });

  it('sends one overdue reminder only for the still-open punch of this occurrence', async () => {
    const h = harness({ state: open, clockIns: [{ id: 10 }] });
    await h.run('2026-10-24T20:29:59Z');
    expect(h.sendEmail).not.toHaveBeenCalled();
    await h.run(overdue); await h.run('2026-10-24T21:00:00Z');
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.sendSms).toHaveBeenCalledWith(expect.objectContaining({ dispatchType: 'missing_checkout_reminder', body: expect.stringContaining('Reply CHECKOUT') }));
    for (const options of [{ state: unclocked }, { state: open, clockIns: [{ id: 8 }] }, { state: open }]) {
      const other = harness(options); await other.run(overdue); expect(other.sendEmail).not.toHaveBeenCalled();
    }
  });

  it('uses the original occurrence date and finalized session assignment after midnight', async () => {
    const h = harness({ occurrence: { ...event, occurrence_session_id: 12,
      occurrence_start: '2026-10-25T04:00:00Z', occurrence_end: '2026-10-25T06:00:00Z' }, state: open, clockIns: [{ id: 10 }] });
    await h.run('2026-10-25T06:30:00Z');
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const [sql, params] = h.db.execute.mock.calls.find(([sql]) => sql.includes('SELECT DISTINCT u.id'));
    expect(sql).toContain("sp.assignment_status = 'finalized'");
    expect(params).toEqual([2, 4, 4, '2026-10-24', 12, 12, 4]);
    expect([...h.claims.values()][0].args).toEqual([4, 7, '2026-10-24', 'email', 'missing_checkout', '2026-10-25 04:00:00']);
  });

  it('does not mistake an earlier occurrence that day for this shift', async () => {
    const h = harness({ occurrence: { ...event, previous_occurrence_end: '2026-10-24T14:00:00Z' } });
    await h.run(start);
    const [, params] = h.db.execute.mock.calls.find(([sql]) => sql.includes('FROM skill_builders_event_kiosk_punches'));
    expect(params[2].toISOString()).toBe('2026-10-24T14:00:00.000Z');
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('puts distinct signed-in action links in emails without changing attendance from a link visit', () => {
    const url = 'https://example.test/company-events/4/staff/token#event-check-in';
    const email = eventCheckinMessage(event, url);
    expect(email.html).toContain('attendance=check-in#event-check-in');
    expect(email.html).toContain('attendance=check-out#event-check-in');
    const late = eventCheckinMessage(event, url, 'missing_checkout');
    expect(late.html).toContain('>Clock out now</a>');
    expect(late.html).toContain('attendance=checkout-time#event-check-in');
    expect(late.text).toContain('actual time');
    expect(late.html).toContain('Sign in and confirm');
  });
});

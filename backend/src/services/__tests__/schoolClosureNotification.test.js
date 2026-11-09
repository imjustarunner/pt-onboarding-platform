import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), identity: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { findByAgencyAndIdentityKey: m.identity } }));
import { previousWeekday, closureNoticePhase, schoolClosurePlans, closureNoticeMessage } from '../../utils/schoolClosureNotice.js';
import { runSchoolClosureNotifications } from '../schoolClosureNotification.service.js';

const monday = new Date('2026-11-09T13:00:00Z'); // 6 AM Denver, after DST ends.
const districtEvent = { id: 313, agency_id: 2, organization_id: null, district_name: 'D11', event_type: 'school_holiday', title: 'No School', starts_at: '2026-11-09 07:00:00', ends_at: '2026-11-10 06:59:59', timezone: 'America/Denver', is_active: 1, school_event_status: 'scheduled' };
const schoolEvent = { ...districtEvent, id: 340, organization_id: 430, district_name: null, event_type: 'school_day_off', title: 'Professional Development for staff', description: 'No school for students' };
const schools = [{ id: 430, agency_id: 2, name: 'Keller Elementary', slug: 'keller', district_name: 'D11', itsco_email: 'keller@itsco.health' },
  { id: 151, agency_id: 2, name: 'John Adams', slug: 'johnadams', district_name: 'd11' },
  { id: 200, agency_id: 2, name: 'Another district', district_name: 'D12' },
  { id: 450, agency_id: 450, name: 'Other tenant', district_name: 'D11' },
  { id: 414, agency_id: 2, name: 'Fake School Test', district_name: 'D11' }];
const assignments = [{ agency_id: 2, school_id: 430, provider_id: 979, provider_name: 'Lily Finch', work_email: 'lily@itsco.health' },
  { agency_id: 2, school_id: 151, provider_id: 979, provider_name: 'Lily Finch', work_email: 'lily@itsco.health' },
  { agency_id: 2, school_id: 430, provider_id: 496, provider_name: 'Megan', work_email: 'megan@itsco.health' }];
const plans = (changes = {}) => schoolClosurePlans({ events: [districtEvent, schoolEvent], schools, assignments, now: monday, ...changes });
let claims, send;
beforeEach(() => {
  vi.resetAllMocks(); claims = new Set(); send = vi.fn().mockResolvedValue({ id: 'gmail-1', communicationId: 23 });
  m.identity.mockResolvedValue({ id: 12, agency_id: 2, from_email: 'Schools@ITSCO.health' });
  m.execute.mockImplementation(async (sql, params = []) => {
    if (sql.includes('FROM agencies s')) return [schools.filter(school => school.agency_id === 2)];
    if (sql.includes('SELECT * FROM company_events')) return [[districtEvent, schoolEvent]];
    if (sql.includes('FROM provider_school_assignments')) return [assignments];
    if (sql.startsWith('INSERT IGNORE')) {
      const key = params[1];
      if (claims.has(key)) return [{ affectedRows: 0 }];
      claims.add(key); return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
});

describe('school closure timing and scope', () => {
  it('uses Friday before a Monday closure and separate 3 PM / 6 AM windows', () => {
    expect(previousWeekday('2026-11-09')).toBe('2026-11-06');
    expect(closureNoticePhase('2026-11-09', 'America/Denver', new Date('2026-11-06T21:59:59Z'))).toBeNull();
    expect(closureNoticePhase('2026-11-09', 'America/Denver', new Date('2026-11-06T22:00:00Z'))).toBe('advance');
    expect(closureNoticePhase('2026-11-09', 'America/Denver', new Date('2026-11-08T22:00:00Z'))).toBeNull();
    expect(closureNoticePhase('2026-11-09', 'America/Denver', new Date('2026-11-09T12:59:59Z'))).toBeNull();
    expect(closureNoticePhase('2026-11-09', 'America/Denver', monday)).toBe('morning');
    expect(closureNoticePhase('2026-11-09', 'America/Denver', new Date('2026-11-09T19:00:00Z'))).toBeNull();
  });
  it('follows daylight saving and each calendar’s timezone', () => {
    expect(closureNoticePhase('2026-10-26', 'America/Denver', new Date('2026-10-26T12:00:00Z'))).toBe('morning');
    expect(closureNoticePhase('2026-11-09', 'America/Los_Angeles', monday)).toBeNull();
    expect(closureNoticePhase('2026-11-09', 'America/Los_Angeles', new Date('2026-11-09T14:00:00Z'))).toBe('morning');
  });
  it('combines both sources once and lists every affected assignment for each provider', () => {
    const result = plans({ assignments: [...assignments, assignments[0]] });
    expect(result).toHaveLength(3);
    const lily = result.find(plan => plan.userId === 979);
    expect(lily.schools.map(school => school.id)).toEqual([151, 430]);
    expect(lily.schools.find(school => school.id === 430).sources.map(source => source.id)).toEqual([313, 340]);
    expect(lily.schools.find(school => school.id === 151).sources.map(source => source.id)).toEqual([313]);
    expect(new Set(result.map(plan => plan.key)).size).toBe(3);
  });
  it('does not include another district, another tenant, or a test school', () => {
    expect(plans()[0].schools.map(school => school.id).sort()).toEqual([151, 430]);
    expect(plans({ events: [{ ...districtEvent, is_active: 0 }, { ...schoolEvent, school_event_status: 'canceled' }] })).toEqual([]);
  });
  it('a school-only date affects only that school and its own providers', () => {
    const result = plans({ events: [schoolEvent] });
    expect(result[0].schools.map(school => school.id)).toEqual([430]);
    const message = closureNoticeMessage(result[0], 'schools@itsco.health');
    expect(message.subject).toContain('D11');
    expect(message.text).toContain('Professional Development for staff');
    expect(message.text).not.toContain('D11 has a district-wide');
  });
  it('preserves sessions-prohibited wording and leaves appointments/families untouched', () => {
    const result = plans({ events: [{ ...schoolEvent, event_type: 'school_sessions_prohibited', title: 'Testing' }] });
    const message = closureNoticeMessage(result[1], 'schools@itsco.health');
    expect(message.text).toContain('school sessions prohibited');
    expect(message.text).toContain('does not cancel appointments or notify families');
  });
  it('does not mail weekend days within a long break and handles UTC midnight correctly', () => {
    const result = plans({ events: [{ ...districtEvent, starts_at: '2026-11-06 07:00:00', ends_at: '2026-11-10 07:00:00' }], now: new Date('2026-11-07T14:00:00Z') });
    expect(result).toEqual([]);
    expect(plans({ events: [{ ...districtEvent, ends_at: '2026-11-09 07:00:00' }] })).toEqual([]);
  });
});

describe('school closure delivery', () => {
  it('previews the exact internal recipients, source content and envelope without writes', async () => {
    const result = await runSchoolClosureNotifications({ now: monday, dryRun: true, send });
    expect(result.deliveries.map(delivery => delivery.to).sort()).toEqual(['lily@itsco.health', 'megan@itsco.health', 'schools@itsco.health']);
    expect(result.deliveries.every(delivery => delivery.replyToOverride === 'schools@itsco.health' && delivery.senderIdentityId === 12)).toBe(true);
    expect(result.deliveries.find(delivery => delivery.userId === 979).text).toContain('Professional Development for staff — No school for students');
    expect(result.deliveries.every(delivery => delivery.text.includes('district-wide closures and individual school closures')
      && delivery.text.includes('3 PM on the previous weekday and again at 6 AM on the closure date')
      && delivery.text.includes('calendar’s local time'))).toBe(true);
    expect(m.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
  it('claims each recipient atomically so concurrent workers never repeat a send', async () => {
    await Promise.all([runSchoolClosureNotifications({ now: monday, enabled: true, send }), runSchoolClosureNotifications({ now: monday, enabled: true, send })]);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.every(([message]) => message.source === 'auto' && message.templateType === 'school_closure_notice' && !message.cc)).toBe(true);
  });
  it('sends advance and morning notices separately without replaying either phase', async () => {
    const friday = new Date('2026-11-06T22:00:00Z');
    await runSchoolClosureNotifications({ now: friday, enabled: true, send });
    await runSchoolClosureNotifications({ now: friday, enabled: true, send });
    await runSchoolClosureNotifications({ now: monday, enabled: true, send });
    await runSchoolClosureNotifications({ now: monday, enabled: true, send });
    expect(send).toHaveBeenCalledTimes(6);
    expect(new Set(send.mock.calls.map(([message]) => message.internetMessageIdOverride)).size).toBe(6);
  });
  it('holds a provider with no address without using the school group or another person', async () => {
    const missing = assignments.map(assignment => assignment.provider_id === 979 ? { ...assignment, work_email: null, email: null } : assignment);
    m.execute.mockImplementation(async sql => sql.includes('FROM agencies s') ? [schools.filter(school => school.agency_id === 2)]
      : sql.includes('SELECT * FROM company_events') ? [[districtEvent, schoolEvent]] : sql.includes('FROM provider_school_assignments') ? [missing]
      : [{ affectedRows: 1 }]);
    const result = await runSchoolClosureNotifications({ now: monday, enabled: true, send });
    expect(result.deliveries.some(delivery => delivery.status === 'missing_provider_email')).toBe(true);
    expect(send.mock.calls.map(([message]) => message.to).sort()).toEqual(['megan@itsco.health', 'schools@itsco.health']);
  });
  it('retains uncertain and approval-gated deliveries without automatic retries', async () => {
    send.mockRejectedValueOnce(new Error('timeout after provider acceptance')).mockResolvedValueOnce({ pendingApproval: true }).mockResolvedValue({ redirected: true, id: 'test-copy' });
    const first = await runSchoolClosureNotifications({ now: monday, enabled: true, send });
    const second = await runSchoolClosureNotifications({ now: monday, enabled: true, send });
    expect(first.deliveries.every(delivery => delivery.status === 'held')).toBe(true);
    expect(second.deliveries.every(delivery => delivery.status === 'already_claimed')).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
  });
  it('respects skipped delivery and never treats it as sent', async () => {
    send.mockResolvedValue({ skipped: true, reason: 'notifications_disabled' });
    const result = await runSchoolClosureNotifications({ now: monday, enabled: true, send });
    expect(result.deliveries.every(delivery => delivery.status === 'skipped')).toBe(true);
  });
  it('blocks a missing or wrong Schools sender without substituting another mailbox', async () => {
    m.identity.mockResolvedValue({ id: 8, agency_id: 2, from_email: 'notifications@itsco.health' });
    const result = await runSchoolClosureNotifications({ now: monday, enabled: true, send });
    expect(result.deliveries.every(delivery => delivery.status === 'blocked')).toBe(true);
    expect(claims.size).toBe(0); expect(send).not.toHaveBeenCalled();
  });
  it('requires activation before the scheduler reads or sends anything', async () => {
    expect(await runSchoolClosureNotifications({ enabled: false, send })).toEqual({ enabled: false, deliveries: [] });
    expect(m.execute).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
});

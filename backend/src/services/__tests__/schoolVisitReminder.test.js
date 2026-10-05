vi.mock('../../utils/schoolVisitChangeToken.js', () => ({ createSchoolVisitChangeToken: () => 'test-visit-token' }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), connection: vi.fn(), event: vi.fn(), identities: vi.fn(), send: vi.fn(), release: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute, getConnection: mocks.connection } }));
vi.mock('../googleCalendar.service.js', () => ({ default: { getEvent: mocks.event } }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { list: mocks.identities } }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: mocks.send }));
import { runSchoolVisitReminders } from '../schoolVisitReminder.service.js';

describe('school visit delivery', () => {
  let jobs, booking;
  const now = new Date('2026-10-02T16:00:00Z');
  beforeEach(() => {
    vi.resetAllMocks(); jobs = [];
    booking = { id: 4, agency_id: 2, school_name: 'Test School', itsco_email: 'test-school@itsco.health', google_event_id: 'event-1', modality: 'in_person', starts_at: '2026-10-05 17:00:00', ends_at: '2026-10-05 18:00:00', location_text: 'School office', updated_at: '2026-10-01' };
    mocks.connection.mockResolvedValue({ execute: mocks.execute, release: mocks.release });
    mocks.execute.mockImplementation(async (sql, params = []) => {
      if (sql.includes('JOIN agencies a')) return [[booking]];
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[]];
      if (sql.startsWith('INSERT IGNORE')) {
        if (!jobs.some(j => j.revision_hash === params[1])) jobs.push({ id: jobs.length + 1, revision_hash: params[1], delivery_status: params[3], last_error: params[4] });
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('SELECT * FROM school_visit_reminders')) return [[jobs.find(j => j.revision_hash === params[1])]];
      if (sql.startsWith('SELECT status,updated_at')) return [[{ status: booking.status || 'booked', updated_at: booking.updated_at }]];
      if (sql.includes("SET delivery_status='sending'")) { jobs.find(j => j.id === params[0]).delivery_status = 'sending'; return [{ affectedRows: 1 }]; }
      if (sql.includes('SET delivery_status=?')) { jobs.find(j => j.id === params[4]).delivery_status = params[0]; return [{ affectedRows: 1 }]; }
      if (sql.includes("SET delivery_status='review'")) { jobs.find(j => j.id === params[1]).delivery_status = 'review'; return [{ affectedRows: 1 }]; }
      if (sql.includes('SET last_error=?')) { jobs.find(j => j.id === params[1]).last_error = params[0]; return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    mocks.event.mockResolvedValue({ ok: true, event: { startAt: '2026-10-05T17:00:00Z', endAt: '2026-10-05T18:00:00Z', location: 'School office', status: 'confirmed' } });
    mocks.identities.mockResolvedValue([{ id: 9, from_email: 'notifications@itsco.health' }]);
    mocks.send.mockResolvedValue({ id: 'email-1', communicationId: 12 });
  });
  it('sends once to the group using the exact sender and reply-to', async () => {
    await runSchoolVisitReminders({ now }); await runSchoolVisitReminders({ now });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 9, to: 'test-school@itsco.health', replyToOverride: 'schools@itsco.health', fromDisplayNameOverride: 'ITSCO Schools', templateType: 'school_visit_reminder' }));
    expect(jobs[0].delivery_status).toBe('sent');
  });
  it('holds conflicts without sending', async () => {
    mocks.event.mockResolvedValue({ ok: true, event: { status: 'cancelled' } });
    await runSchoolVisitReminders({ now }); expect(mocks.send).not.toHaveBeenCalled(); expect(jobs[0].delivery_status).toBe('review');
  });
  it('never falls back to individual staff when the group is missing', async () => {
    booking.itsco_email = null; await runSchoolVisitReminders({ now }); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not retry an ambiguous send', async () => {
    mocks.send.mockRejectedValue(new Error('connection lost after delivery'));
    await runSchoolVisitReminders({ now }); await runSchoolVisitReminders({ now });
    expect(mocks.send).toHaveBeenCalledOnce(); expect(jobs[0].delivery_status).toBe('review');
  });
  it('dry run does not write or send', async () => {
    const result = await runSchoolVisitReminders({ now, dryRun: true });
    expect(result[0].status).toBe('due'); expect(jobs).toHaveLength(0); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('rechecks booking cancellation before sending', async () => {
    booking.status = 'cancelled'; await runSchoolVisitReminders({ now }); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not substitute another sender when notifications is unavailable', async () => {
    mocks.identities.mockResolvedValue([{ id: 10, from_email: 'schools@itsco.health' }]);
    await runSchoolVisitReminders({ now }); expect(mocks.send).not.toHaveBeenCalled();
    expect(jobs[0].last_error).toContain('notifications@itsco.health');
  });
  it('does not mark approval-gated messages sent or enqueue them repeatedly', async () => {
    mocks.send.mockResolvedValue({ pendingApproval: true });
    await runSchoolVisitReminders({ now }); await runSchoolVisitReminders({ now });
    expect(mocks.send).toHaveBeenCalledOnce(); expect(jobs[0].delivery_status).toBe('approval');
  });
});

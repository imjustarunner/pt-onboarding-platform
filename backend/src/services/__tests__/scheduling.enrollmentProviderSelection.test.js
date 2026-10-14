import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../officeIntakeProviders.service.js', () => ({ listOfficeIntakeProviders: vi.fn() }));
import { enrollmentSchedulingPreferences, recordEnrollmentProviderSelection, validateEnrollmentProviderSelection } from '../enrollmentProviderSelection.service.js';
import { stripIneligibleProviderPreference, withoutQuickProviderSelection } from '../../utils/intakeProviderPreference.js';

const link = { scope_type: 'agency', form_type: 'intake', inherits_office_master: 1 };
const providers = [
  { id: 7, name: 'Open Provider', intakeStatusByFormat: { VIRTUAL: 'accepting', IN_PERSON: 'unavailable' } },
  { id: 8, name: 'Waitlist Provider', intakeStatusByFormat: { VIRTUAL: 'waitlist', IN_PERSON: 'accepting' } }
];
const data = overrides => ({ responses: { submission: { preferred_office_provider_ids: ['7'], preferred_service_format: 'VIRTUAL', ...overrides } } });
const validate = (intakeData, overrides = {}) => validateEnrollmentProviderSelection({ link, intakeData, agencyId: 2, loadProviders: vi.fn(async () => providers), ...overrides });

describe('full enrollment provider requests', () => {
  it('uses current format status and records a requested placement, never a confirmed assignment', async () => {
    const intakeData = data({ providerSelection: { providerId: 99, status: 'CONFIRMED' } });
    await validate(intakeData);
    expect(intakeData.responses.submission.providerSelection).toEqual({ providerId: 7, providerName: 'Open Provider', status: 'REQUESTED', modality: 'VIRTUAL', source: 'general', requiresCareCoordination: true, confirmed: false });
  });
  it('places a virtual request on that provider waitlist even when their in-person intake is open', async () => {
    const intakeData = data({ preferred_office_provider_ids: ['8'] });
    await validate(intakeData);
    expect(intakeData.responses.submission.providerSelection.status).toBe('WAITLIST');
  });
  it('rejects a format closed after the profile was opened', async () => {
    await expect(validate(data({ enrollment_source: 'provider', requested_profile_provider_id: 7, preferred_service_format: 'IN_PERSON' }))).rejects.toMatchObject({ status: 409 });
  });
  it('rejects a removed or cross-agency provider', async () => {
    await expect(validate(data({ preferred_office_provider_ids: ['90'] }))).rejects.toMatchObject({ status: 409 });
  });
  it('retains the profile request for care coordination when safety screening cleared chooser IDs', async () => {
    const intakeData = data({ enrollment_source: 'provider', requested_profile_provider_id: 8, preferred_office_provider_ids: [], needsClinicalReview: true });
    await validate(intakeData);
    expect(intakeData.responses.submission).toMatchObject({ needsClinicalReview: true, providerSelection: { providerId: 8, status: 'WAITLIST', confirmed: false } });
  });
  it('allows skipping provider choice on general enrollment without retaining a stale time preference', async () => {
    const intakeData = data({ preferred_office_provider_ids: [], requested_opening_preference: { providerId: 7 } });
    expect(await validate(intakeData)).toBeNull();
    expect(intakeData.responses.submission.requested_opening_preference).toBeUndefined();
  });
  it('rejects a time preference that belongs to a different provider', async () => {
    await expect(validate(data({ requested_opening_preference: { providerId: 8 } }))).rejects.toMatchObject({ status: 400 });
  });
  it('strips profile source, desired provider, status, and hold data from brief forms', async () => {
    const intakeData = data({ enrollment_source: 'provider', requested_profile_provider_id: 8, providerSelection: { providerId: 8, status: 'WAITLIST' } });
    stripIneligibleProviderPreference({ form_type: 'quick_intake' }, intakeData);
    expect(intakeData.responses.submission).toEqual({ preferred_service_format: 'VIRTUAL' });
    expect(withoutQuickProviderSelection({ requestedOpeningPreference: { providerId: 8 }, providerHoldToken: 'secret', preferences: { providerSelection: { providerId: 8 }, preferredDays: ['Tuesday'] } })).toEqual({ preferences: { preferredDays: ['Tuesday'] } });
  });
});

function database({ assigned = false, notificationError = false } = {}) {
  let preferences = { unrelated: 'preserve' };
  const notifications = [];
  const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
    execute: vi.fn(async (sql, params) => {
      if (sql.startsWith('SELECT id, provider_id')) return [[{ id: 30, provider_id: null, intake_preferences_json: preferences }]];
      if (sql.includes('FROM client_provider_assignments')) return [assigned ? [{ id: 3 }] : []];
      if (sql.startsWith('UPDATE clients')) { preferences = { ...preferences, ...JSON.parse(params[0]) }; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT INTO notifications')) { if (notificationError) throw new Error('notification write failed'); notifications.push(params); return [{ insertId: 1 }]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    }) };
  return { getConnection: vi.fn(async () => connection), connection, notifications, preferences: () => preferences };
}

describe('staff-visible pending provider placement', () => {
  let intakeData;
  beforeEach(async () => { intakeData = data({ preferred_office_provider_ids: ['8'] }); await validate(intakeData); });
  const record = (db, intakeData) => recordEnrollmentProviderSelection(db, { agencyId: 2, clientIds: [30, 30], submissionId: 70, intakeData });
  it('saves provider-specific waitlist metadata and a single staff alert without assigning a clinician', async () => {
    const db = database();
    await record(db, intakeData);
    expect(db.preferences()).toMatchObject({ unrelated: 'preserve', preferredProviderUserId: 8, providerSelection: { status: 'WAITLIST', submissionId: 70 }, waitlist: { active: true, providerId: 8 } });
    expect(db.notifications).toHaveLength(1);
    const sql = db.connection.execute.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).not.toMatch(/UPDATE clients SET provider_id|INSERT INTO client_provider_assignments/);
    expect(db.connection.commit).toHaveBeenCalledTimes(1);
  });
  it('does not duplicate the staff notification on an intake retry', async () => {
    const db = database();
    await record(db, intakeData);
    await record(db, intakeData);
    expect(db.notifications).toHaveLength(1);
  });
  it('keeps the original active waitlist when the provider reopens intake before the same enrollment retries', async () => {
    const db = database();
    await record(db, intakeData);
    const originalWaitlist = { ...db.preferences().waitlist, priority: 'high' };
    db.preferences().waitlist = originalWaitlist;
    await validate(intakeData, { loadProviders: async () => providers.map(person => person.id === 8 ? { ...person, intakeStatusByFormat: { VIRTUAL: 'accepting' } } : person) });
    expect(intakeData.responses.submission.providerSelection.status).toBe('REQUESTED');
    await record(db, intakeData);
    expect(db.preferences().waitlist).toEqual(originalWaitlist);
    expect(db.preferences().providerSelection.status).toBe('WAITLIST');
    expect(db.preferences().preferred_office_provider_summary).toContain('provider waitlist');
    expect(db.notifications).toHaveLength(1);
  });
  it('updates scheduling answers on a retry without changing the original request date or repeating notifications', async () => {
    const db = database();
    await record(db, intakeData);
    const requestedAt = db.preferences().providerSelection.requestedAt;
    Object.assign(intakeData.responses.submission, { preferred_days: ['Tuesday', 'Thursday'], preferred_times: ['Evening'], preferred_scheduling_notes: 'After 5 PM' });
    await record(db, intakeData);
    expect(db.preferences()).toMatchObject({ preferredDays: ['Tuesday', 'Thursday'], preferredTimes: ['Evening'], preferredSchedulingNotes: 'After 5 PM', providerSelection: { requestedAt } });
    expect(db.notifications).toHaveLength(1);
  });
  it('clears only a pending preference from the same failed-finalization submission when the user skips it', async () => {
    const db = database();
    await record(db, intakeData);
    await record(db, { responses: { submission: {} } });
    expect(db.preferences()).toMatchObject({ providerSelection: null, preferredProviderUserId: null, waitlist: { active: false } });
    expect(db.notifications).toHaveLength(1);
  });
  it('never clears a request belonging to another submission', async () => {
    const db = database();
    await record(db, intakeData);
    await recordEnrollmentProviderSelection(db, { agencyId: 2, clientIds: [30], submissionId: 80, intakeData: { responses: { submission: {} } } });
    expect(db.preferences()).toMatchObject({ preferredProviderUserId: 8, waitlist: { active: true } });
  });
  it.each([false, 0])('does not reopen a staff-resolved waitlist on an enrollment retry (active=%s)', async active => {
    const db = database();
    await record(db, intakeData);
    db.preferences().waitlist.active = active;
    await record(db, intakeData);
    expect(db.preferences().waitlist.active).toBe(false);
    expect(db.notifications).toHaveLength(1);
  });
  it('bounds day/time answers and rejects browser-supplied reservation claims', () => {
    expect(enrollmentSchedulingPreferences({ preferred_days: ['Tuesday', 'Tuesday', 'Unknown'], preferred_times: ['Evening', 'Always'], preferred_scheduling_notes: 'x'.repeat(1500), preferred_time_zone: 'Invalid/Zone', requested_opening_preference: { providerId: 8, reserved: true, startAt: '2026-10-20T23:00:00Z', endAt: '2026-10-21T00:00:00Z', modality: 'VIRTUAL' } })).toMatchObject({ preferredDays: ['Tuesday'], preferredTimes: ['Evening'], preferredTimeZone: 'America/Denver' });
    expect(enrollmentSchedulingPreferences({ preferred_scheduling_notes: 'x'.repeat(1500) }).preferredSchedulingNotes).toHaveLength(1000);
    expect(enrollmentSchedulingPreferences({ requested_opening_preference: { providerId: 8, reserved: true, startAt: '2026-10-20T23:00:00Z', endAt: '2026-10-21T00:00:00Z' } }).requestedOpening).not.toHaveProperty('reserved');
  });
  it('keeps existing clinical assignments and lifecycle intact', async () => {
    const db = database({ assigned: true });
    await record(db, intakeData);
    expect(db.preferences().providerSelection.status).toBe('WAITLIST');
    expect(db.preferences().waitlist).toBeUndefined();
  });
  it('rolls back the pending placement if its staff alert fails', async () => {
    const db = database({ notificationError: true });
    await expect(record(db, intakeData)).rejects.toThrow('notification write failed');
    expect(db.connection.rollback).toHaveBeenCalledTimes(1);
    expect(db.connection.commit).not.toHaveBeenCalled();
    expect(db.connection.release).toHaveBeenCalledTimes(1);
  });
});

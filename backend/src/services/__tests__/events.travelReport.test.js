import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../googleDistance.service.js', () => ({ getDrivingDistanceMeters: vi.fn(), metersToMiles: m => m / 1609.344 }));
vi.mock('../skillBuildersEventKioskPunch.service.js', () => ({ recordEventEmployeeClockIn: vi.fn(), recordEventEmployeeClockOut: vi.fn() }));
vi.mock('../companyEventOperations.service.js', () => ({ isEventCoordinator: vi.fn() }));
vi.mock('../../utils/payrollSubmissionWindow.js', () => ({ computeSubmissionWindow: vi.fn(async () => ({ ok: true, suggestedPayrollPeriodId: 90 })) }));
vi.mock('../../models/PayrollTimeClaim.model.js', () => ({ default: { create: vi.fn(async () => ({ id: 101 })), resubmit: vi.fn() } }));
import pool from '../../config/database.js';
import { getDrivingDistanceMeters } from '../googleDistance.service.js';
import PayrollTimeClaim from '../../models/PayrollTimeClaim.model.js';
import { buildEventTravelReport, submitEventTravelReport, assertEventTravelNoOverlap, reviewEventTravelReport, listMyEventTravelOptions } from '../eventTravelReport.service.js';
import { eventTravelDefaultForm, eventTravelJourneys, recommendEventTravelLeg } from '../../../../frontend/src/navigation/eventTravel.js';

const event = { id: 8, agency_id: 2, title: 'School fair', timezone: 'America/Denver', starts_at: '2026-10-29T16:00:00Z', ends_at: '2026-10-29T18:00:00Z', is_active: 1, address: '10 Event St, Denver, CO' };
let assigned, policyDate, existingReport, mileageFailure, savedClaims, overlaps, approvedMileage;
const sql = async (query, args = []) => {
  if (query.includes('SELECT id, drive_date, applied_amount FROM payroll_mileage_claims')) return [approvedMileage && args[0] === 193 && args[1] === 2 && args[2] === 7 && args[3] === '2026-10-29' ? [approvedMileage] : []];
  if (query.includes('SELECT id, drive_date, trip_purpose')) return [approvedMileage ? [approvedMileage] : []];
  if (query.includes('SELECT e.id, e.agency_id')) return [assigned ? [event] : []];
  if (query.includes('SELECT DISTINCT e.id')) return [[event]];
  if (query.includes('SELECT 1 AS assigned')) return [assigned ? [{ assigned: 1 }] : []];
  if (query.includes('SELECT session_date')) return [[{ session_date: '2026-10-29' }]];
  if (query.includes('FROM user_office_locations')) return [[{ id: 4, name: 'Main office', street_address: '20 Office St', city: 'Denver', state: 'CO' }]];
  if (query.includes('FROM agencies s JOIN organization_affiliations')) return [[{ id: 12, name: 'School', street_address: '30 School St', city: 'Denver', state: 'CO' }]];
  if (query.includes('FROM company_event_travel_reports r WHERE r.user_id')) return [[]];
  if (query.includes('SELECT home_street_address')) return [[{ home_street_address: '40 Home St', home_city: 'Denver', home_state: 'CO' }]];
  if (query.includes('FROM company_event_travel_policy')) return [[{ effective_at: policyDate }]];
  if (query.includes('event_travel_report_id IS NULL AND status')) return [[]];
  if (query.includes('FROM skill_builders_event_kiosk_punches')) return [overlaps ? [{ id: 44 }] : []];
  if (query.includes('SELECT id, payload_json FROM payroll_time_claims')) return [savedClaims];
  if (query.includes('SELECT * FROM company_event_travel_reports')) return [existingReport ? [existingReport] : []];
  if (query.includes('SELECT id FROM users')) return [[{ id: 7 }]];
  if (query.includes('SELECT status FROM payroll_')) return [[{ status: 'submitted' }]];
  if (query.includes('SELECT id, label FROM payroll_indirect_service_types')) return [[{ id: 6, label: 'Approved Travel' }]];
  if (query.includes('SELECT id, claim_date') || query.includes('SELECT id, drive_date')) return [[]];
  if (query.includes('INSERT INTO payroll_mileage_claims') && mileageFailure) throw new Error('mileage write failed');
  if (query.startsWith('INSERT') || query.startsWith('UPDATE')) return [{ insertId: 66, affectedRows: 1 }];
  throw new Error(`Unexpected SQL: ${query}`);
};
function formWithRoute(change = {}) {
  const f = { ...eventTravelDefaultForm(), eventDate: '2026-10-29', officeLocationId: 4, materialsPickup: 'already_had', materialsReturn: 'kept', attestation: true, ...change };
  let index = 0;
  for (const j of eventTravelJourneys(f)) for (const leg of j.legs) {
    const hour = j.key === 'pickup' ? 12 : j.key === 'outbound' ? 14 : j.key === 'inbound' ? 19 : 21;
    f.intervals[leg.key] = { startedAt: `2026-10-29T${hour}:${index % 2 === 0 ? '00' : '30'}:00Z`, endedAt: `2026-10-29T${hour + (index % 2 === 1 ? 1 : 0)}:${index % 2 === 0 ? '20' : '00'}:00Z` }; index++;
  }
  return f;
}
const build = input => buildEventTravelReport({ eventId: 8, userId: 7, input, now: new Date('2026-10-31T20:00:00Z'), distance: vi.fn(async () => 1609.344 * 5) });
beforeEach(() => { vi.clearAllMocks(); assigned = true; policyDate = '2026-10-27T18:00:00Z'; existingReport = null; mileageFailure = false; savedClaims = []; overlaps = false; approvedMileage = null; pool.execute.mockImplementation(sql); });

describe('one event travel report', () => {
  it('submits travel time without duplicating a verified separate mileage reimbursement', async () => {
    approvedMileage = { id: 193, drive_date: '2026-10-29', applied_amount: '9.66' };
    policyDate = '2026-10-30T18:00:00Z';
    const report = await build(formWithRoute({ existingMileageClaimId: 193 }));
    expect(report.totalMinutes).toBeGreaterThan(0); expect(report.totalMiles).toBe(0);
    expect(report.segments.every(s => !s.mileageEligible)).toBe(true);
    expect(report.flags.join(' ')).toContain('Travel time only');
    const db = { execute: vi.fn(sql), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }; pool.getConnection.mockResolvedValue(db);
    await submitEventTravelReport({ eventId: 8, userId: 7, input: { attestation: true }, build: async () => report });
    expect(PayrollTimeClaim.create).toHaveBeenCalledOnce();
    expect(db.execute.mock.calls.some(([q]) => q.includes('INSERT INTO payroll_mileage_claims'))).toBe(false);
    expect(db.execute.mock.calls.some(([q]) => q.includes('SELECT id, drive_date, applied_amount') && q.includes('FOR UPDATE'))).toBe(true);
  });
  it('rejects an unavailable or differently owned/date mileage claim and rechecks before writing', async () => {
    await expect(build(formWithRoute({ existingMileageClaimId: 193 }))).rejects.toThrow('approved event mileage');
    approvedMileage = { id: 193, drive_date: '2026-10-29', applied_amount: '9.66' };
    await expect(build(formWithRoute({ existingMileageClaimId: 999 }))).rejects.toThrow('approved event mileage');
    const report = await build(formWithRoute({ existingMileageClaimId: 193 })); approvedMileage = null;
    const db = { execute: vi.fn(sql), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }; pool.getConnection.mockResolvedValue(db);
    await expect(submitEventTravelReport({ eventId: 8, userId: 7, input: { attestation: true }, build: async () => report })).rejects.toThrow('approved event mileage');
    expect(db.rollback).toHaveBeenCalledOnce(); expect(PayrollTimeClaim.create).not.toHaveBeenCalled();
  });
  it('prevents payroll review from adding duplicate mileage to a time-only report', async () => {
    approvedMileage = { id: 193, drive_date: '2026-10-29', applied_amount: '9.66' };
    const report = await build(formWithRoute({ existingMileageClaimId: 193 })); existingReport = { id: 66, agency_id: 2, user_id: 7, revision: 1, report_json: report };
    const db = { execute: vi.fn(sql), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }; pool.getConnection.mockResolvedValue(db);
    await expect(reviewEventTravelReport({ id: 66, reviewerId: 9, input: { revision: 1, note: 'Reviewed', segments: report.segments.map(s => ({ ...s, mileageEligible: true, miles: 4 })) } })).rejects.toThrow('already covered');
  });
  it('returns the employee’s saved home address and uses the school-mileage Google calculator for each route leg', async () => {
    expect((await listMyEventTravelOptions({ userId: 7, agencyId: 2 })).homeAddress).toBe('40 Home St, Denver, CO');
    getDrivingDistanceMeters.mockResolvedValue(1609.344 * 5);
    const input = formWithRoute({ departure: { kind: 'home', address: 'Forged home' }, eventAddressFallback: 'Forged event' });
    const report = await buildEventTravelReport({ eventId: 8, userId: 7, input, now: new Date('2026-10-31') });
    expect(getDrivingDistanceMeters.mock.calls).toEqual([
      ['40 Home St, Denver, CO', '10 Event St, Denver, CO'],
      ['10 Event St, Denver, CO', '40 Home St, Denver, CO']
    ]);
    expect(report.segments.map(s => s.miles)).toEqual([5, 5]);
  });
  it('rejects a missing saved venue address even when the caller supplies an address', async () => {
    pool.execute.mockImplementation((query, args) => query.includes('SELECT DISTINCT e.id') ? Promise.resolve([[{ ...event, address: '' }]]) : sql(query, args));
    await expect(build(formWithRoute({ eventAddressFallback: 'Unverified venue' }))).rejects.toThrow('coordinator needs to save');
  });
  it('keeps materials handling available without an extra-work checkbox', async () => {
    const input = formWithRoute();
    input.handling.pickup = { startedAt: '2026-10-29T13:45:00Z', endedAt: '2026-10-29T14:00:00Z' };
    const report = await build(input);
    expect(report.totalMinutes).toBe(15);
    expect(report.segments.find(s => s.key === 'handling-pickup')).toMatchObject({ needsReview: true, minutes: 15 });
  });
  it('accepts travel on an earlier day with an explanation in ordinary notes', async () => {
    const input = formWithRoute({ notes: 'Traveling ahead of the event to help with setup.' });
    input.intervals['outbound-0'] = { startedAt: '2026-10-27T14:00:00Z', endedAt: '2026-10-27T14:20:00Z' };
    const report = await build(input);
    expect(report.flags.join(' ')).toContain('outside the event date');
  });
  it('treats ordinary home-event-home as commuting while retaining reported trips', async () => {
    const report = await build(formWithRoute());
    expect(report.segments).toHaveLength(2); expect(report.totalMinutes).toBe(0); expect(report.totalMiles).toBe(0);
    expect(report.form.materialsPickup).toBe('already_had');
  });
  it('pays office-event-office time and personal mileage, excluding home-office legs', async () => {
    const report = await build(formWithRoute({ materialsPickup: 'before_event', materialsReturn: 'after_event' }));
    expect(report.segments.map(s => s.timeEligible)).toEqual([false, true, true, false]);
    expect(report.totalMinutes).toBe(50); expect(report.totalMiles).toBe(10);
    expect(report.segments[1].from.address).toContain('20 Office St');
    expect(report.segments[1].to.address).toContain('10 Event St');
  });
  it('records pickup on a different date, including handling time at a convenient stop', async () => {
    const f = formWithRoute({ materialsPickup: 'before_event', pickupTiming: 'separate' });
    f.intervals['pickup-0'] = { startedAt: '2026-10-28T16:00:00Z', endedAt: '2026-10-28T16:15:00Z' };
    f.handling.pickup = { startedAt: '2026-10-28T16:15:00Z', endedAt: '2026-10-28T16:20:00Z' };
    f.intervals['pickup-1'] = { startedAt: '2026-10-28T16:20:00Z', endedAt: '2026-10-28T16:35:00Z' };
    const report = await build(f);
    expect(report.totalMinutes).toBe(5); expect(report.totalMiles).toBe(0);
    expect(report.windows['2026-10-28']).toBe(90);
  });
  it('flags required pickup trips and substantial transport duties for review', async () => {
    const f = formWithRoute({ materialsPickup: 'before_event', pickupTiming: 'separate', pickupRequirement: 'required', transportDuties: true, exceptionNote: 'Required pickup before opening; large display cases' });
    const report = await build(f);
    expect(report.segments[0].timeEligible).toBe(true); expect(report.segments[0].needsReview).toBe(true);
    expect(report.flags.join(' ')).toContain('display cases');
  });
  it('does not reimburse a passenger or company vehicle', async () => {
    for (const vehicle of ['passenger', 'company']) {
      const report = await build(formWithRoute({ vehicle, departure: { kind: 'office' }, returnTo: { kind: 'office' } }));
      expect(report.totalMinutes).toBeGreaterThan(0); expect(report.totalMiles).toBe(0);
    }
  });
  it('preserves earlier promised event travel time for review', async () => {
    policyDate = '2026-10-30T18:00:00Z';
    const report = await build(formWithRoute()); expect(report.totalMinutes).toBeGreaterThan(0); expect(report.totalMiles).toBe(0); expect(report.legacyTravelPolicy).toBe(true);
  });
  it('rejects unassigned staff and unassigned offices', async () => {
    assigned = false; await expect(build(formWithRoute())).rejects.toMatchObject({ status: 404 }); assigned = true;
    await expect(build(formWithRoute({ departure: { kind: 'office' }, officeLocationId: 999 }))).rejects.toMatchObject({ status: 409 });
  });
  it('rejects future, overlapping, reversed, and timezone-less times', async () => {
    for (const interval of [
      { startedAt: '2026-11-02T12:00:00Z', endedAt: '2026-11-02T12:20:00Z' },
      { startedAt: '2026-10-29T12:00:00Z', endedAt: '2026-10-29T11:20:00Z' },
      { startedAt: '2026-10-29T12:00', endedAt: '2026-10-29T12:20' }
    ]) { const f = formWithRoute(); f.intervals['outbound-0'] = interval; await expect(build(f)).rejects.toMatchObject({ status: 400 }); }
    const f = formWithRoute(); f.intervals['inbound-0'] = f.intervals['outbound-0']; await expect(build(f)).rejects.toThrow('overlap');
  });
  it('ignores caller-supplied eligibility and mileage totals', async () => {
    const report = await build({ ...formWithRoute(), totalMiles: 10000, totalMinutes: 10000, reviewed: true, segments: [{ mileageEligible: true }] });
    expect(report.totalMiles).toBe(0); expect(report.totalMinutes).toBe(0); expect(report.reviewed).toBe(false);
  });
  it('keeps a failed distance lookup visible for review instead of inventing miles', async () => {
    const report = await buildEventTravelReport({ eventId: 8, userId: 7, input: formWithRoute({ departure: { kind: 'office' } }), now: new Date('2026-10-31'), distance: async () => { throw new Error('maps unavailable'); } });
    expect(report.segments[0].miles).toBeNull(); expect(report.flags.join(' ')).toContain('Mileage needs verification');
  });
  it('rejects overlaps with event attendance and another travel report', async () => {
    const report = await build(formWithRoute()); overlaps = true;
    await expect(assertEventTravelNoOverlap({ report, db: pool })).rejects.toThrow('attendance'); overlaps = false;
    savedClaims = [{ payload_json: { eventTravelReport: { segments: report.segments } } }];
    await expect(assertEventTravelNoOverlap({ report, db: pool })).rejects.toThrow('overlaps another');
  });
  it('commits one report and linked time/mileage together, rolling back on a failed expense write', async () => {
    const report = await build(formWithRoute({ departure: { kind: 'office' } }));
    const db = { execute: vi.fn(sql), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
    pool.getConnection.mockResolvedValue(db);
    const submit = () => submitEventTravelReport({ eventId: 8, userId: 7, input: { attestation: true }, build: async () => report });
    mileageFailure = true; await expect(submit()).rejects.toThrow('mileage write failed'); expect(db.rollback).toHaveBeenCalledOnce(); expect(db.commit).not.toHaveBeenCalled();
    mileageFailure = false; const result = await submit(); expect(result.id).toBe(66); expect(db.commit).toHaveBeenCalledOnce();
    expect(PayrollTimeClaim.create).toHaveBeenCalledWith(expect.objectContaining({ db, payload: expect.objectContaining({ serviceCode: 'MEETING', eventTravelReportId: 66 }) }));
    const insert = db.execute.mock.calls.find(([q]) => q.includes('INSERT INTO payroll_mileage_claims')); expect(insert[0]).toContain('round_trip'); expect(insert[0]).toContain("'standard'");
  });
  it('returns an existing identical submission on retry and rejects stale edits', async () => {
    const report = await build(formWithRoute()); existingReport = { id: 66, revision: 2, report_json: report };
    const db = { execute: vi.fn(sql), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }; pool.getConnection.mockResolvedValue(db);
    expect((await submitEventTravelReport({ eventId: 8, userId: 7, input: { attestation: true }, build: async () => report })).alreadySubmitted).toBe(true);
    await expect(submitEventTravelReport({ eventId: 8, userId: 7, input: { attestation: true, expectedRevision: 1 }, build: async () => ({ ...report, form: { ...report.form, notes: 'changed' } }) })).rejects.toThrow('already exists');
  });
  it('requires verified mileage in payroll review and disallows reimbursement for company vehicles', async () => {
    const report = await build(formWithRoute({ vehicle: 'company' })); existingReport = { id: 66, user_id: 7, revision: 1, report_json: report };
    const db = { execute: vi.fn(sql), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }; pool.getConnection.mockResolvedValue(db);
    await expect(reviewEventTravelReport({ id: 66, reviewerId: 9, input: { revision: 1, note: 'Reviewed', segments: report.segments.map(s => ({ ...s, mileageEligible: true, miles: 4 })) } })).rejects.toThrow('Only personal');
  });
});

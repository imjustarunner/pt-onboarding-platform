import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import { shouldBookOnDate, shouldBookByCount } from '../officeScheduleMaterializer.service.js';
const assignment = { weekday: 1, assigned_frequency: 'WEEKLY', availability_mode: 'AVAILABLE' };
const plan = { is_active: 1, booking_start_date: '2026-01-05', booked_frequency: 'WEEKLY', session_context_json: { agencyId: 2, bookingLimitsExplicit: true } };
it('keeps an explicitly ongoing office reservation beyond one year', () => {
 expect(shouldBookOnDate(plan, assignment, '2028-01-03')).toBe(true);
 expect(shouldBookByCount(plan, assignment, '2028-01-03')).toBe(true);
});
it('does not activate old intake caps merely because agency ownership was added', () => {
 const legacy = { ...plan, active_until_date: '2026-02-01', booked_occurrence_count: 6, session_context_json: { agencyId: 2 } };
 expect(shouldBookOnDate(legacy, assignment, '2026-06-01')).toBe(true);
 expect(shouldBookByCount(legacy, assignment, '2026-06-01')).toBe(true);
});
it('honors explicit end dates and counts, including counts over a year', () => {
 expect(shouldBookOnDate({ ...plan, active_until_date: '2026-02-01' }, assignment, '2026-06-01')).toBe(false);
 expect(shouldBookByCount({ ...plan, booked_occurrence_count: 60 }, assignment, '2027-06-07')).toBe(false);
 expect(shouldBookByCount({ ...plan, booked_occurrence_count: 60 }, assignment, '2027-02-22')).toBe(true);
});

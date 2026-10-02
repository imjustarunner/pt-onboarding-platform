import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import { officeYearBoundary, withinOfficeRecordWindow } from '../../utils/officeRecordWindow.js';
import { shouldBookOnDate } from '../officeScheduleMaterializer.service.js';
const assignment = { weekday: 4, assigned_frequency: 'WEEKLY', availability_mode: 'AVAILABLE' };
it('bounds actual office records by the office-local anniversary', () => {
 const now = new Date('2026-10-02T02:00:00Z'); // Still Oct 1 in Denver.
 expect(withinOfficeRecordWindow('2027-09-30', 'America/Denver', now)).toBe(true);
 expect(withinOfficeRecordWindow('2027-10-01', 'America/Denver', now)).toBe(false);
 expect(withinOfficeRecordWindow('2030-01-01', 'America/Denver', now)).toBe(false);
});
it('handles leap-year anniversaries without slipping into March', () => {
 expect(officeYearBoundary('2028-02-29')).toBe('2029-02-28');
});
it('stops patient series at one year while allowing ongoing room assignments', () => {
 const plan = { is_active: 1, booking_start_date: '2026-10-01', booked_frequency: 'WEEKLY', session_context_json: { clientId: 9 } };
 expect(shouldBookOnDate(plan, assignment, '2027-09-30')).toBe(true);
 expect(shouldBookOnDate(plan, assignment, '2027-10-01')).toBe(false);
 expect(shouldBookOnDate({ ...plan, session_context_json: { agencyId: 2 } }, assignment, '2028-10-01')).toBe(true);
});
it('does not load or write recurring records when a forced calendar read is beyond the horizon', async () => {
 const { default: OfficeLocation } = await import('../../models/OfficeLocation.model.js');
 const { default: StandingAssignment } = await import('../../models/OfficeStandingAssignment.model.js');
 const { default: Materializer } = await import('../officeScheduleMaterializer.service.js');
 vi.spyOn(OfficeLocation, 'findById').mockResolvedValue({ id: 7, timezone: 'America/Denver' });
 const standing = vi.spyOn(StandingAssignment, 'listByOffice');
 const result = await Materializer.materializeWeek({ officeLocationId: 7, weekStartRaw: '2199-01-07', useExactWeekStart: true, force: true });
 expect(result).toMatchObject({ reason: 'beyond_record_window', upsertedCount: 0 });
 expect(standing).not.toHaveBeenCalled();
});

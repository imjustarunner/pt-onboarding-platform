import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../officeAssignmentBookingAvailability.service.js', () => ({ publishOfficeAssignmentEvent: vi.fn() }));
import pool from '../../config/database.js';
import Materializer from '../officeScheduleMaterializer.service.js';
import Assignment from '../../models/OfficeStandingAssignment.model.js';
import Plan from '../../models/OfficeBookingPlan.model.js';
import Event from '../../models/OfficeEvent.model.js';
import Location from '../../models/OfficeLocation.model.js';
const assignment = { id: 1, room_id: 2, provider_id: 3, booking_agency_id: 4, weekday: 1, hour: 14, assigned_frequency: 'WEEKLY', availability_mode: 'AVAILABLE', available_since_date: '2026-09-01' };
beforeEach(() => {
 vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-01T18:00:00Z'));
 pool.execute.mockResolvedValue([[]]);
 vi.spyOn(Location, 'findById').mockResolvedValue({ id: 8, timezone: 'America/Denver' });
 vi.spyOn(Assignment, 'listByOffice').mockResolvedValue([assignment]);
 vi.spyOn(Plan, 'listActiveByAssignmentIds').mockResolvedValue([]);
 vi.spyOn(Event, 'listForOfficeWindow').mockResolvedValue([]);
 vi.spyOn(Event, 'upsertSlotState').mockResolvedValue({ id: 12 });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const run = () => Materializer.materializeWeek({ officeLocationId: 8, weekStartRaw: '2026-10-05', force: true });
it('automatically books an approved assignment without an appointment before transition', async () => {
 await run(); expect(Event.upsertSlotState).toHaveBeenCalledWith(expect.objectContaining({ slotState: 'ASSIGNED_BOOKED', bookedProviderId: 3, bookingPlanId: null }));
 expect(pool.execute.mock.calls.some(([sql,args]) => sql.includes('bookingSource') && args.includes('automatic_office_reservation'))).toBe(true);
});
it('ignores automatic legacy booking plans after transition, keeping the assignment available', async () => {
 pool.execute.mockResolvedValue([[{ agency_id: 4, transition_date: '2026-10-05' }]]);
 Plan.listActiveByAssignmentIds.mockResolvedValue([{ id: 10, standing_assignment_id: 1, is_active: 1, booking_start_date: '2026-09-01', booked_frequency: 'WEEKLY' }]);
 await run(); expect(Event.upsertSlotState).toHaveBeenCalledWith(expect.objectContaining({ slotState: 'ASSIGNED_AVAILABLE', bookedProviderId: null, bookingPlanId: null, allowAutomaticReservationDowngrade: true }));
});
it('retains actual patient series after transition', async () => {
 pool.execute.mockResolvedValue([[{ agency_id: 4, transition_date: '2026-10-05' }]]);
 Plan.listActiveByAssignmentIds.mockResolvedValue([{ id: 10, standing_assignment_id: 1, is_active: 1, booking_start_date: '2026-09-01', booked_frequency: 'WEEKLY', session_context_json: { agencyId: 4, clientId: 9 } }]);
 await run(); expect(Event.upsertSlotState).toHaveBeenCalledWith(expect.objectContaining({ slotState: 'ASSIGNED_BOOKED', bookedProviderId: 3, bookingPlanId: 10 }));
});
it('never rewrites historical office time', async () => {
 await Materializer.materializeWeek({ officeLocationId: 8, weekStartRaw: '2026-09-21', force: true });
 expect(Event.upsertSlotState).not.toHaveBeenCalled();
});

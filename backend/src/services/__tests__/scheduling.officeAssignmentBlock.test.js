import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/OfficeStandingAssignment.model.js', () => ({ default: { create: vi.fn(), update: vi.fn() } }));
vi.mock('../../models/OfficeBookingPlan.model.js', () => ({ default: { upsertActive: vi.fn() } }));
vi.mock('../../models/OfficeEvent.model.js', () => ({ default: { upsertSlotState: vi.fn() } }));
vi.mock('../../models/OfficeLocation.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../officeScheduleMaterializer.service.js', () => ({ default: { startOfWeekMonday: vi.fn(d => d), addDays: vi.fn(d => d), materializeWeek: vi.fn(), invalidateOffice: vi.fn() } }));
import OfficeStandingAssignment from '../../models/OfficeStandingAssignment.model.js';
import OfficeBookingPlan from '../../models/OfficeBookingPlan.model.js';
import OfficeEvent from '../../models/OfficeEvent.model.js';
import OfficeLocation from '../../models/OfficeLocation.model.js';
import { assignOneTimeOfficeBlock } from '../officeAssignmentOrchestrator.service.js';
beforeEach(() => {
  vi.clearAllMocks();
  OfficeLocation.findById.mockResolvedValue({ timezone: 'America/Denver' });
  OfficeStandingAssignment.create.mockImplementation(async row => ({ ...row, id: row.hour }));
  OfficeStandingAssignment.update.mockImplementation(async (id, row) => ({ id, ...row }));
  OfficeEvent.upsertSlotState.mockImplementation(async row => ({ ...row, id: row.standingAssignmentId }));
});
it('keeps all selected hours assigned available under the chosen tenant without creating bookings', async () => {
  const result = await assignOneTimeOfficeBlock({ officeLocationId: 1, roomId: 4, providerId: 538, dateYmd: '2027-03-15',
    startHour: 13, endHour: 17, createdByUserId: 501, markBooked: false, bookingAgencyId: 6 });
  expect(result.events).toHaveLength(4);
  expect(OfficeBookingPlan.upsertActive).not.toHaveBeenCalled();
  for (const [, row] of OfficeStandingAssignment.update.mock.calls) expect(row).toMatchObject({ booking_agency_id: 6, available_since_date: '2027-03-15', temporary_until_date: '2027-03-15' });
  expect(result.events.every(e => e.slotState === 'ASSIGNED_AVAILABLE' && e.bookedProviderId === null && e.assignedProviderId === 538)).toBe(true);
  expect(result.events[0]).toMatchObject({ startAt: '2027-03-15 19:00:00', endAt: '2027-03-15 20:00:00' });
  expect(result.events.at(-1).endAt).toBe('2027-03-15 23:00:00');
});
it('keeps existing callers without an explicit tenant compatible', async () => {
  await assignOneTimeOfficeBlock({ officeLocationId: 1, roomId: 4, providerId: 538, dateYmd: '2027-03-15', startHour: 13, endHour: 14, createdByUserId: 501 });
  expect(OfficeStandingAssignment.update.mock.calls[0][1]).not.toHaveProperty('booking_agency_id');
});

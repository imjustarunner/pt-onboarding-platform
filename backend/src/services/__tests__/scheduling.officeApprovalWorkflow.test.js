import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('../officeRequestEmails.service.js', () => ({ queueOfficeRequestReview: vi.fn(), queueOfficeDecisionEmail: vi.fn() }));
const m = vi.hoisted(() => ({
  execute: vi.fn(),
  getConnection: vi.fn(),
  agencies: vi.fn(),
  booking: vi.fn(),
  legacy: vi.fn(),
  validate: vi.fn(),
  notify: vi.fn()
}));
vi.mock('../../config/database.js', () => ({
  default: { execute: m.execute, getConnection: m.getConnection }
}));
vi.mock('../../models/User.model.js', () => ({
  default: {
    getAgencies: m.agencies,
    findById: vi.fn(async () => ({ first_name: 'Provider', last_name: 'Name' }))
  }
}));
vi.mock('../../models/OfficeBookingRequest.model.js', () => ({
  default: { listPendingForAgencies: m.booking }
}));
vi.mock('../../models/OfficeRoomRequest.model.js', () => ({
  default: { listPendingForAgencies: m.legacy }
}));
vi.mock('../../models/Notification.model.js', () => ({
  default: { create: m.notify }
}));
vi.mock('../../models/OfficeLocationAgency.model.js', () => ({
  default: { listAgenciesForOffice: vi.fn(async () => [{ id: 2 }]) }
}));
vi.mock('../officeSlotSeries.service.js', () => ({
  validateOfficeSlotSeries: m.validate,
  loadOfficeSlotInventory: vi.fn(async () => ({
    events: [],
    assignments: [],
    plans: [],
    legacy: []
  }))
}));
import {
  approvalAssignmentConflict,
  approvalWindow,
  listOfficeApprovals,
  findOfficeApproval,
  officeApprovalContext,
  withOfficeDecisionLock,
  notifyOfficeRequestPending
} from '../officeApprovalWorkflow.service.js';
const actor = { id: 465, role: 'clinical_practice_assistant' };
const booking = {
  id: 37,
  requested_provider_id: 525,
  office_location_id: 1,
  office_timezone: 'America/Denver',
  start_at: '2026-10-30 23:00:00',
  end_at: '2026-10-31 00:00:00',
  room_id: 5,
  recurrence: 'WEEKLY',
  request_type: 'PROVIDER_REQUEST',
  status: 'PENDING'
};
beforeEach(() => {
  vi.clearAllMocks();
  m.agencies.mockResolvedValue([{ id: 2 }]);
  m.booking.mockResolvedValue([booking]);
  m.legacy.mockResolvedValue([]);
  m.validate.mockResolvedValue({ ok: true });
  m.execute.mockImplementation(async (sql) => {
    if (sql.includes('FROM provider_office_availability_requests'))
      return [
        [
          {
            id: 878,
            agency_id: 2,
            provider_id: 525,
            status: 'PENDING',
            requested_frequency: 'BIWEEKLY',
            requested_occurrence_count: 6,
            requested_start_date: '2026-10-30'
          }
        ]
      ];
    if (sql.includes('FROM provider_office_availability_request_slots'))
      return [
        [{ request_id: 878, startHour: 17, endHour: 19, roomId: 5, weekday: 5 }]
      ];
    if (sql.includes('FROM office_rooms rm'))
      return [
        [
          {
            roomId: 5,
            officeId: 1,
            officeName: 'Windchime',
            timezone: 'America/Denver',
            label: 'Counseling'
          }
        ]
      ];
    return [[]];
  });
});
it('combines the actual intake, calendar and legacy formats without colliding IDs', async () => {
  m.legacy.mockResolvedValue([
    { ...booking, id: 878, user_id: 567, location_id: 1 }
  ]);
  const rows = await listOfficeApprovals(actor);
  expect(rows.map((r) => r.key).sort()).toEqual([
    'booking:37',
    'intake:878',
    'legacy:878'
  ]);
  expect(rows.find((r) => r.key === 'booking:37').slots).toEqual([
    { startHour: 17, endHour: 18, roomId: 5 }
  ]);
  expect(m.booking).toHaveBeenCalledWith([2]);
});
it('denies unprivileged users and requests outside the approved agency scope', async () => {
  await expect(
    listOfficeApprovals({ id: 1, role: 'provider' })
  ).rejects.toMatchObject({ status: 403 });
  await expect(findOfficeApproval(actor, 'booking:900')).rejects.toMatchObject({
    status: 404
  });
  await expect(
    findOfficeApproval(actor, 'booking:1 OR 1=1')
  ).rejects.toMatchObject({ status: 400 });
});
it('keeps the biweekly anchor and remaining count across Denver daylight saving', () => {
  const request = {
    startDate: '2026-10-16',
    recurrence: 'BIWEEKLY',
    occurrenceCount: 6,
    slots: [{ startHour: 17, endHour: 19 }]
  };
  const result = approvalWindow(
    request,
    'America/Denver',
    new Date('2026-10-20T12:00:00Z')
  );
  expect(result.startDate).toBe('2026-10-30');
  expect(result.occurrenceCount).toBe(5);
  expect(result.checkedDates).toContain('2026-11-13');
});
it('does not turn an expired one-time request into a new booking or round partial hours', () => {
  const request = {
    startDate: '2026-10-16',
    recurrence: 'ONCE',
    occurrenceCount: 1,
    slots: [{ startHour: 17, endHour: 19 }]
  };
  expect(() =>
    approvalWindow(request, 'America/Denver', new Date('2026-10-20T12:00:00Z'))
  ).toThrow('ended');
  expect(() =>
    approvalWindow(
      { ...request, slots: [{ startHour: 17.5, endHour: 19 }] },
      'America/Denver'
    )
  ).toThrow('whole hours');
});
it('checks recurring windows and returns a specific blocked-date explanation', async () => {
  m.validate.mockResolvedValue({
    ok: false,
    error: {
      message: 'Room is booked on November 13',
      blockedDate: '2026-11-13'
    }
  });
  const result = await officeApprovalContext(actor, 'intake:878', {
    now: new Date('2026-10-20T12:00:00Z')
  });
  expect(result.rooms[0]).toMatchObject({
    available: false,
    reason: 'Room is booked on November 13',
    blockedDate: '2026-11-13'
  });
  expect(m.validate).toHaveBeenCalledWith(
    expect.objectContaining({
      providerId: 525,
      roomId: 5,
      recurrence: 'BIWEEKLY',
      occurrenceCount: 6,
      startHour: 17,
      endHour: 19,
      officeTimeZone: 'America/Denver'
    })
  );
});
it('fails closed when availability cannot be checked', async () => {
  m.validate.mockRejectedValue(new Error('database unavailable'));
  await expect(officeApprovalContext(actor, 'intake:878')).rejects.toThrow(
    'database unavailable'
  );
});
it('releases the shared decision lock after a failed write, and never proceeds without it', async () => {
  const execute = vi.fn(async (sql) =>
      sql.includes('GET_LOCK') ? [[{ acquired: 1 }]] : [[]]
    ),
    release = vi.fn();
  m.getConnection.mockResolvedValue({ execute, release });
  await expect(
    withOfficeDecisionLock(async () => {
      throw new Error('failed');
    })
  ).rejects.toThrow('failed');
  expect(execute.mock.calls.some(([sql]) => sql.includes('RELEASE_LOCK'))).toBe(
    true
  );
  expect(release).toHaveBeenCalled();
  execute.mockResolvedValue([[{ acquired: 0 }]]);
  const work = vi.fn();
  await expect(withOfficeDecisionLock(work)).rejects.toMatchObject({
    status: 409
  });
  expect(work).not.toHaveBeenCalled();
});
it('uses the same pending alert for every source with a distinct entity key and avoids repeat alerts', async () => {
  await notifyOfficeRequestPending({
    source: 'booking',
    id: 37,
    providerId: 525,
    officeId: 1
  });
  expect(m.notify).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'office_availability_request_pending',
      relatedEntityType: 'office_booking_request',
      relatedEntityId: 37,
      agencyId: 2
    })
  );
  m.execute.mockResolvedValue([[{ id: 22 }]]);
  await notifyOfficeRequestPending({
    source: 'booking',
    id: 37,
    providerId: 525,
    officeId: 1
  });
  expect(m.notify).toHaveBeenCalledTimes(1);
});

it('matches standing ownership rules without changing existing series', () => {
  const window = {
    weekday: 5,
    startHour: 17,
    endHour: 19,
    timezone: 'America/Denver'
  };
  const now = new Date('2026-10-20T12:00:00Z');
  const room = { roomId: 5 };
  const owners = [17, 18].map((hour) => ({
    room_id: 5,
    provider_id: 10,
    weekday: 5,
    hour,
    first_name: 'Other'
  }));
  const request = { source: 'booking', providerId: 525, recurrence: 'WEEKLY' };
  expect(
    approvalAssignmentConflict(
      request,
      room,
      window,
      { assignments: owners },
      now
    )
  ).toContain('standing assignment for Other');
  expect(
    approvalAssignmentConflict(
      { ...request, source: 'intake', recurrence: 'ONCE' },
      room,
      window,
      { assignments: owners },
      now
    )
  ).toBeNull();
  expect(
    approvalAssignmentConflict(
      { ...request, source: 'intake', recurrence: 'ONCE' },
      room,
      window,
      { assignments: owners.slice(0, 1) },
      now
    )
  ).toContain('standing assignment');
  expect(
    approvalAssignmentConflict(
      { ...request, providerId: 10 },
      room,
      window,
      { assignments: owners },
      now
    )
  ).toContain('already has a standing assignment');
  expect(
    approvalAssignmentConflict(
      request,
      room,
      window,
      {
        assignments: owners.map((row) => ({
          ...row,
          availability_mode: 'TEMPORARY',
          temporary_until_date: '2026-10-19'
        }))
      },
      now
    )
  ).toBeNull();
});
it('warns when two pending request sources overlap for the same provider', async () => {
  const result = await officeApprovalContext(actor, 'intake:878', {
    now: new Date('2026-10-20T12:00:00Z')
  });
  expect(result.warnings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'pending_request',
        requestKey: 'booking:37'
      })
    ])
  );
});

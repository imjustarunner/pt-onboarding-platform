import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/Appointment.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../appointment.controller.js', () => ({ assertAppointmentChangeAccess: vi.fn(), updateAppointmentHandler: vi.fn() }));
vi.mock('../../services/appointmentReschedule.service.js', () => ({ appointmentReschedule: { context: vi.fn(), options: vi.fn() } }));
vi.mock('../../services/appointmentOfficeReservation.service.js', () => ({ default: { moveToReservedRoom: vi.fn() } }));
vi.mock('../officeSlotActions.controller.js', () => ({ rescheduleOfficeEvent: vi.fn() }));
vi.mock('../user.controller.js', () => ({ updateUserScheduleEvent: vi.fn() }));
vi.mock('../../models/OfficeLocation.model.js', () => ({ default: { findById: vi.fn().mockResolvedValue({ timezone: 'America/Denver' }) } }));
import Appointment from '../../models/Appointment.model.js';
import { assertAppointmentChangeAccess, updateAppointmentHandler } from '../appointment.controller.js';
import { appointmentReschedule } from '../../services/appointmentReschedule.service.js';
import reservations from '../../services/appointmentOfficeReservation.service.js';
import { rescheduleOfficeEvent } from '../officeSlotActions.controller.js';
import { updateUserScheduleEvent } from '../user.controller.js';
import { rescheduleAppointment } from '../appointmentReschedule.controller.js';

let req, res, next, appointment, plan;
beforeEach(() => {
  vi.clearAllMocks();
  appointment = { id: 18, agencyId: 2, providerUserId: 501, startAt: '2026-11-18 00:00:00', endAt: '2026-11-18 01:00:00', officeLocationId: 3, officeEventId: 20 };
  plan = { inPerson: true, canMoveSeries: true, timeZone: 'America/Denver', startAt: '2026-11-20 00:00:00', endAt: '2026-11-20 01:00:00', rooms: [{ id: 10, buildingId: 3, needsRequest: false }] };
  Appointment.findById.mockImplementation(async () => appointment);
  appointmentReschedule.options.mockImplementation(async () => plan);
  assertAppointmentChangeAccess.mockResolvedValue();
  req = { user: { id: 501, role: 'provider' }, params: { id: '18' }, body: { startAt: '2026-11-19T17:00:00', endAt: '2026-11-19T18:00:00', scope: 'single', roomId: 10,
    expectedStartAt: '2026-11-18T00:00:00Z', expectedEndAt: '2026-11-18T01:00:00Z' } };
  res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; next = vi.fn();
});
it('routes the same appointment’s office occurrence with the chosen reserved room', async () => {
  await rescheduleAppointment(req, res, next);
  expect(assertAppointmentChangeAccess).toHaveBeenCalledWith(req, appointment);
  expect(rescheduleOfficeEvent).toHaveBeenCalledWith(req, res, next);
  expect(req.params).toEqual({ officeId: '3', eventId: '20' });
  expect(req.body).toMatchObject({ startAt: '2026-11-19 17:00:00', scope: 'single', roomId: 10, requestRoom: false });
});
it('requests an unassigned room explicitly while leaving the original appointment to the approval flow', async () => {
  plan.rooms[0].needsRequest = true;
  await rescheduleAppointment(req, res, next);
  expect(req.body.requestRoom).toBe(true);
  expect(updateAppointmentHandler).not.toHaveBeenCalled();
});
it('moves virtual series through the calendar adapter without an office operation', async () => {
  plan.inPerson = false; appointment.providerScheduleEventId = 44; req.body.scope = 'future';
  await rescheduleAppointment(req, res, next);
  expect(updateUserScheduleEvent).toHaveBeenCalledWith(req, res, next);
  expect(req.params).toEqual({ id: '501', eventId: '44' });
  expect(req.appointmentReschedule).toMatchObject({ originalStartAt: appointment.startAt, startAt: plan.startAt, timeZone: plan.timeZone });
  expect(rescheduleOfficeEvent).not.toHaveBeenCalled();
});
it('requires an explicit recurrence scope before making any change', async () => {
  delete req.body.scope; await rescheduleAppointment(req, res, next);
  expect(res.status).toHaveBeenCalledWith(400); expect(rescheduleOfficeEvent).not.toHaveBeenCalled();
});
it('does not move an appointment that changed after the form was opened', async () => {
  appointment.startAt = '2026-11-19 00:00:00'; await rescheduleAppointment(req, res, next);
  expect(res.status).toHaveBeenCalledWith(409); expect(appointmentReschedule.options).not.toHaveBeenCalled(); expect(rescheduleOfficeEvent).not.toHaveBeenCalled();
});
it('checks access before room lookup or writes', async () => {
  assertAppointmentChangeAccess.mockRejectedValue(Object.assign(new Error('Access denied'), { status: 403 }));
  await rescheduleAppointment(req, res, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  expect(appointmentReschedule.options).not.toHaveBeenCalled(); expect(rescheduleOfficeEvent).not.toHaveBeenCalled();
});

it('moves a school-origin appointment to the selected destination reservation', async () => {
  appointment.officeEventId = null;
  appointment.officeLocationId = null;
  appointment.providerScheduleEventId = 44;
  reservations.moveToReservedRoom.mockResolvedValue({ ok: true, appointment: { id: 18, roomId: 10 } });
  await rescheduleAppointment(req, res, next);
  expect(reservations.moveToReservedRoom).toHaveBeenCalledWith(req.user, appointment, plan, plan.rooms[0]);
  expect(res.json).toHaveBeenCalledWith({ ok: true, appointment: { id: 18, roomId: 10 } });
  expect(rescheduleOfficeEvent).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
});

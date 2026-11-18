import Appointment from '../models/Appointment.model.js';
import { assertAppointmentChangeAccess, updateAppointmentHandler } from './appointment.controller.js';
import { appointmentReschedule } from '../services/appointmentReschedule.service.js';

async function authorized(req) {
  const appointment = await Appointment.findById(Number(req.params.id));
  if (!appointment) throw Object.assign(new Error('Appointment not found'), { status: 404 });
  await assertAppointmentChangeAccess(req, appointment);
  return appointment;
}

export async function rescheduleContext(req, res, next) {
  try { res.set('Cache-Control', 'no-store'); res.json(await appointmentReschedule.context(await authorized(req))); }
  catch (error) { next(error); }
}

export async function rescheduleOptions(req, res, next) {
  try { res.set('Cache-Control', 'no-store'); res.json(await appointmentReschedule.options(await authorized(req), req.body || {})); }
  catch (error) { next(error); }
}

export async function rescheduleAppointment(req, res, next) {
  try {
    const appointment = await authorized(req);
    const { parseUtcDate } = await import('../utils/officeEventDateTime.util.js');
    if (req.body?.expectedStartAt && (+parseUtcDate(req.body.expectedStartAt) !== +parseUtcDate(appointment.startAt)
      || +parseUtcDate(req.body.expectedEndAt) !== +parseUtcDate(appointment.endAt))) {
      return res.status(409).json({ error: { message: 'This session changed. Refresh the schedule before moving it.' } });
    }
    const plan = await appointmentReschedule.options(appointment, req.body || {});
    const scope = req.body?.scope;
    if (!['single', 'future'].includes(scope) || scope === 'future' && !plan.canMoveSeries) {
      return res.status(400).json({ error: { message: 'Choose just this session or this and all future sessions.' } });
    }
    if (plan.inPerson) {
      const room = plan.rooms.find(r => r.id === Number(req.body.roomId));
      if (!room) return res.status(409).json({ error: { message: 'Choose an available room for the new time.' } });
      if (!appointment.officeEventId) return res.status(409).json({ error: { message: 'This in-person session needs its original office reservation linked before it can be moved.' } });
      const { rescheduleOfficeEvent } = await import('./officeSlotActions.controller.js');
      const { utcToZonedMysqlWall } = await import('../utils/officeEventDateTime.util.js');
      const OfficeLocation = (await import('../models/OfficeLocation.model.js')).default;
      const office = await OfficeLocation.findById(room.buildingId);
      const zone = office?.timezone || plan.timeZone;
      req.params = { officeId: String(appointment.officeLocationId), eventId: String(appointment.officeEventId) };
      req.body = { startAt: utcToZonedMysqlWall(plan.startAt, zone), endAt: utcToZonedMysqlWall(plan.endAt, zone),
        roomId: room.id, scope, reuseOwnReservations: true, requestRoom: room.needsRequest === true, reason: String(req.body.reason || '') };
      return rescheduleOfficeEvent(req, res, next);
    }
    if (appointment.providerScheduleEventId) {
      const { updateUserScheduleEvent } = await import('./user.controller.js');
      req.params = { id: String(appointment.providerUserId), eventId: String(appointment.providerScheduleEventId) };
      req.body = { startAt: req.body.startAt, endAt: req.body.endAt, timeZone: plan.timeZone, scope };
      req.appointmentReschedule = { originalStartAt: appointment.startAt, startAt: plan.startAt, endAt: plan.endAt, timeZone: plan.timeZone };
      return updateUserScheduleEvent(req, res, next);
    }
    req.body = { startAt: req.body.startAt, endAt: req.body.endAt, timeZone: plan.timeZone };
    return updateAppointmentHandler(req, res, next);
  } catch (error) { next(error); }
}

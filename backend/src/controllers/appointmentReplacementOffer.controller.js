import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import { assertAppointmentChangeAccess } from './appointment.controller.js';
import { authorizedClient } from '../services/guardianAppointments.service.js';
import { cancellationFollowUp } from '../services/cancellationFollowUp.service.js';
import { replacementOffers } from '../services/appointmentReplacementOffer.service.js';

export const options = async (req, res, next) => { try {
  const a = await Appointment.findById(Number(req.params.id));
  if (!a) return res.status(404).json({ error: { message: 'Appointment not found.' } });
  await assertAppointmentChangeAccess(req, a);
  res.set('Cache-Control', 'no-store');
  res.json(await cancellationFollowUp.context(a.id, { includeSlots: req.query.slots === 'true' }));
} catch (e) { next(e); } };

export const response = async (req, res, next) => { try {
  if (req.guardianPreviewMode) return res.status(403).json({ error: { message: 'Preview cannot respond to offers.' } });
  const clientId = Number(req.params.clientId), appointmentId = Number(req.params.appointmentId);
  const client = await authorizedClient(req.user.id, clientId);
  const a = await Appointment.findById(appointmentId);
  if (!a || Number(a.agencyId) !== Number(client.agency_id)) return res.status(404).json({ error: { message: 'Appointment not found.' } });
  res.set('Cache-Control', 'no-store');
  res.json(await replacementOffers.respond({ appointmentId, clientId, userId: req.user.id,
    action: req.body?.action, selectedKey: req.body?.selectedKey }));
} catch (e) { next(e); } };

export const release = async (req, res, next) => { try {
  const [[slot]] = await pool.execute('SELECT * FROM appointment_replacement_slots WHERE id=?', [Number(req.params.slotId)]);
  if (!slot) return res.status(404).json({ error: { message: 'Offered time not found.' } });
  await assertAppointmentChangeAccess(req, { agencyId: slot.agency_id, providerUserId: slot.provider_id });
  res.json(await replacementOffers.releaseSlot(slot.id, req.user.id));
} catch (e) { next(e); } };

export const custom = async (req,res,next) => { try {
  const a=await Appointment.findById(Number(req.params.id));
  if (!a) return res.status(404).json({error:{message:'Appointment not found.'}});
  await assertAppointmentChangeAccess(req,a);
  res.json(await cancellationFollowUp.customSlot(a.id,{localStart:req.body?.localStart,roomId:Number(req.body?.roomId)||null}));
} catch(e){next(e);} };

export const requestOffice = async (req,res,next) => { try {
  const a=await Appointment.findById(Number(req.params.id));
  if(!a) return res.status(404).json({error:{message:'Appointment not found.'}});
  await assertAppointmentChangeAccess(req,a);
  const checked=await cancellationFollowUp.customSlot(a.id,{localStart:req.body?.localStart,roomId:Number(req.body?.roomId)});
  const room=checked.rooms.find(r=>Number(r.id)===Number(req.body?.roomId) && r.needsRequest);
  if(!room) return res.status(409).json({error:{message:'This room is no longer available to request. Check available rooms again.'}});
  if(req.body?.confirmOneTime!==true) return res.status(400).json({error:{message:'Confirm this is a one-time room request.'}});
  const {createMyOfficeAvailabilityRequest}=await import('./availability.controller.js');
  req.query={agencyId:a.agencyId};
  req.body={agencyId:a.agencyId,providerId:a.providerUserId,preferredOfficeIds:[room.buildingId],preferredRoomIds:[room.id],
    requestedFrequency:'ONCE',requestedOccurrenceCount:1,requestedStartDate:room.date,slots:[{weekday:room.weekday,startHour:room.startHour,endHour:room.endHour,roomId:room.id}],
    notes:`One-time replacement for appointment #${a.id}. ${room.windowLabel}. Preserve the provider's regular recurring room schedule.`};
  return createMyOfficeAvailabilityRequest(req,res,next);
} catch(e){next(e);} };

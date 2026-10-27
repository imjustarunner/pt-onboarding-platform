import { getEmployeeEventParticipation, recordEmployeeEventParticipation, buildEventTravelClaim } from '../services/companyEventParticipation.service.js';

export const getMyEventParticipation = async (req, res, next) => {
  try { res.json(await getEmployeeEventParticipation({ eventId: req.params.eventId, userId: req.user.id })); } catch (err) { next(err); }
};
export const checkInToMyEvent = async (req, res, next) => {
  try { res.json(await recordEmployeeEventParticipation({ eventId: req.params.eventId, userId: req.user.id, action: 'check-in', ip: req.ip })); } catch (err) { next(err); }
};
export const checkOutOfMyEvent = async (req, res, next) => {
  try { res.json(await recordEmployeeEventParticipation({ eventId: req.params.eventId, userId: req.user.id, action: 'check-out', checkoutAt: req.body?.checkoutAt, ip: req.ip })); } catch (err) { next(err); }
};
export const getMyEventTravelContext = async (req, res, next) => {
  try { res.json(await buildEventTravelClaim({ eventId: req.params.eventId, userId: req.user.id, travelStartedAt: req.body?.travelStartedAt, travelEndedAt: req.body?.travelEndedAt, travelDirection: req.body?.travelDirection, attestation: req.body?.attestation })); } catch (err) { next(err); }
};

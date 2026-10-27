import { listMyEventTravelOptions, buildEventTravelReport, submitEventTravelReport } from '../services/eventTravelReport.service.js';

export const getMyEventTravelOptions = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId);
    if (!Number.isInteger(agencyId) || agencyId <= 0) return res.status(400).json({ error: { message: 'Choose an organization' } });
    res.json(await listMyEventTravelOptions({ userId: req.user.id, agencyId }));
  } catch (e) { next(e); }
};
export const previewMyEventTravelReport = async (req, res, next) => {
  try { res.json(await buildEventTravelReport({ eventId: req.params.eventId, userId: req.user.id, input: req.body || {} })); }
  catch (e) { next(e); }
};
export const submitMyEventTravelReport = async (req, res, next) => {
  try { res.status(201).json(await submitEventTravelReport({ eventId: req.params.eventId, userId: req.user.id, submittedByUserId: req.actorUser?.id || req.user.id, input: req.body || {} })); }
  catch (e) { next(e); }
};

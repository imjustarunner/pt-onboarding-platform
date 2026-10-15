import { getSupervisionRecord, submitSupervisionTimeCorrection, reviewSupervisionTimeCorrection, syncSupervisionTimeCorrections } from '../services/supervisionTimeCorrection.service.js';
const handler = action => async (req,res,next) => {
  try { res.set('Cache-Control','no-store').json(await action(req)); } catch(error) { next(error); }
};
export const getRecord = handler(req => getSupervisionRecord(req.params.id,req.user));
export const submitCorrection = handler(req => submitSupervisionTimeCorrection(req.params.id,req.user,req.body));
export const reviewCorrection = handler(req => reviewSupervisionTimeCorrection(req.params.id,req.params.correctionId,req.user,req.body.decision));
export const syncCorrections = handler(req => syncSupervisionTimeCorrections(req.params.id,req.user));

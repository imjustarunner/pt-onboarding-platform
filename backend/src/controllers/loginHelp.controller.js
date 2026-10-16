import { diagnoseLoginHelp, sendLoginHelp } from '../services/loginHelp.service.js';

export const checkUserLoginHelp = async (req, res, next) => {
  try { res.json(await diagnoseLoginHelp({ actor: req.user, userId: req.params.id, agencyId: req.query.agencyId })); }
  catch (error) { next(error); }
};

export const sendUserLoginHelp = async (req, res, next) => {
  try { res.json(await sendLoginHelp({ actor: req.user, userId: req.params.id, agencyId: req.body?.agencyId })); }
  catch (error) { next(error); }
};

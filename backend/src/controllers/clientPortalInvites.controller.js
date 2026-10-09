import { previewClientPortalInvites, sendClientPortalInvite } from '../services/clientPortalInvites.service.js';
export const preview = async (req, res, next) => {
  try { res.json(await previewClientPortalInvites({ actor: req.user, clientIds: req.body?.clientIds })); }
  catch (error) { next(error); }
};
export const send = async (req, res, next) => {
  try { res.json(await sendClientPortalInvite({ actor: req.user, clientIds: req.body?.clientIds, recipientKey: req.body?.recipientKey })); }
  catch (error) { next(error); }
};

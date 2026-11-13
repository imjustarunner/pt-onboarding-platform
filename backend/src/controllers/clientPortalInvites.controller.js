import { previewClientPortalInvites, sendClientPortalInvite } from '../services/clientPortalInvites.service.js';
export const preview = async (req, res, next) => {
  try { res.json(await previewClientPortalInvites({ actor: req.user, clientIds: req.body?.clientIds })); }
  catch (error) { next(error); }
};
export const send = async (req, res, next) => {
  try { res.json(await sendClientPortalInvite({ actor: req.user, clientIds: req.body?.clientIds, recipientKey: req.body?.recipientKey, recipientSnapshot:req.body?.recipientSnapshot })); }
  catch (error) {
    if(error.status===409 && error.code==='PORTAL_INVITATION_PREVIEW_CHANGED')return res.status(409).json({error:{code:error.code,message:error.message}});
    next(error);
  }
};

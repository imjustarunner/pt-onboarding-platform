import express from 'express';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { readSharedFamilyNotice, acknowledgeSharedFamilyNotice } from '../services/sharedFamilyNotice.service.js';
const router = express.Router();
router.use(authenticate, requireActiveStatus);
const handle = fn => async (req,res) => {
  res.set('Cache-Control','private, no-store');
  try {
    const fixed = req.auricwellPreview?.agencyId || req.user.sessionCommentAgencyId;
    const agencyId = req.body?.agencyId || req.query?.agencyId || req.get('X-Agency-Id');
    if (fixed && Number(fixed) !== Number(agencyId)) return res.status(403).json({error:{message:'Open the notice in its own workspace.'}});
    res.json(await fn({ userId:req.user.id,agencyId,version:req.body?.version,acknowledged:req.body?.acknowledged,req }));
  } catch (e) { const status=[400,403,409].includes(e.status)?e.status:503;res.status(status).json({error:{code:status===503?'FAMILY_SHARING_NOTICE_UNAVAILABLE':e.code,message:status===503?'The communication notice could not be saved. Please keep your draft and try again.':e.message}}); }
};
export const getSharedFamilyNotice = handle(readSharedFamilyNotice);
export const postSharedFamilyNoticeAck = handle(acknowledgeSharedFamilyNotice);
router.get('/',getSharedFamilyNotice);
router.post('/ack',postSharedFamilyNoticeAck);
export default router;

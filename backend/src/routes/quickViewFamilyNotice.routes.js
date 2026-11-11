import express from 'express';
import { requireQuickSessionCommentPrincipal } from '../controllers/quickViewSessionComments.controller.js';
import { getSharedFamilyNotice, postSharedFamilyNoticeAck } from './sharedFamilyNotice.routes.js';
const router = express.Router();
router.use(requireQuickSessionCommentPrincipal);
router.get('/',getSharedFamilyNotice);
router.post('/ack',postSharedFamilyNoticeAck);
export default router;

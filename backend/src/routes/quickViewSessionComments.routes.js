import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireQuickSessionCommentPrincipal } from '../controllers/quickViewSessionComments.controller.js';
import * as comments from '../controllers/secureSessionComments.controller.js';

const router = express.Router();
router.use(requireQuickSessionCommentPrincipal);
router.get('/today', comments.today);
router.post('/attention', comments.attention);
router.get('/history', comments.history);
router.get('/badges', comments.badges);
router.get('/appointments/:appointmentId', comments.thread);
const sendLimit=rateLimit({ windowMs:60000,max:20,standardHeaders:true,legacyHeaders:false,
  keyGenerator:req=>`session-comments:${req.user.id}`,
  message:{error:{code:'SESSION_COMMENT_RATE_LIMIT',message:'Please wait a minute before sending another secure session comment.'}} });
router.post('/appointments/:appointmentId',sendLimit,comments.create);
router.patch('/appointments/:appointmentId/comments/:commentId',sendLimit,comments.edit);
router.post('/appointments/:appointmentId/read', comments.read);
export default router;

import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import * as controller from '../controllers/secureSessionComments.controller.js';

const router = express.Router();
router.use(authenticate, requireActiveStatus);
router.get('/today', controller.today);
router.get('/history', controller.history);
router.get('/badges', controller.badges);
router.post('/attention', controller.attention);
router.get('/appointments/:appointmentId', controller.thread);
router.post('/appointments/:appointmentId', rateLimit({ windowMs: 60000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => `session-comments:${req.user.id}`,
  message: { error: { code: 'SESSION_COMMENT_RATE_LIMIT', message: 'Please wait a minute before sending another secure session comment.' } } }), controller.create);
router.post('/appointments/:appointmentId/read', controller.read);
router.patch('/appointments/:appointmentId/comments/:commentId',rateLimit({windowMs:60000,max:20,standardHeaders:true,legacyHeaders:false,keyGenerator:req=>`session-comment-edits:${req.user.id}`,
  message:{error:{code:'SESSION_COMMENT_RATE_LIMIT',message:'Please wait a minute before editing another secure session comment.'}}}),controller.edit);
export default router;

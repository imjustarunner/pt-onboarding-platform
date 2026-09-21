import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { resolvePersonalMeetingInvitation } from '../services/meetingInvitations.service.js';
import { activeMeetingPrompts } from '../services/activeMeetingPrompts.service.js';

const router = express.Router();
router.get('/active', authenticate, async (req,res,next) => {
  res.set('Cache-Control','no-store');
  try { res.json({prompts: await activeMeetingPrompts(req.user.id)}); }
  catch (error) { next(error); }
});
router.get('/:token', authenticate, async (req,res,next) => {
  res.set('Cache-Control','no-store');
  res.set('Referrer-Policy','no-referrer');
  try { res.json(await resolvePersonalMeetingInvitation(req.params.token,req.user.id)); }
  catch (error) { next(error); }
});
export default router;

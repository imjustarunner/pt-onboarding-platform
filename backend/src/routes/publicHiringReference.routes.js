import express from 'express';
import { publicHiringReferenceSubmitLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  getReferenceFormMeta,
  postReferenceFormSubmit,
  trackReferenceEmailOpen
} from '../controllers/publicHiringReference.controller.js';

const router = express.Router();

router.get('/open/:token', trackReferenceEmailOpen);
router.get('/:token', getReferenceFormMeta);
router.post('/:token/submit', publicHiringReferenceSubmitLimiter, postReferenceFormSubmit);

export default router;

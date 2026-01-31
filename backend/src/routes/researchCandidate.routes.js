import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';
import { researchCandidate } from '../controllers/researchCandidate.controller.js';

const router = express.Router();

router.post(
  '/research-candidate',
  // IMPORTANT:
  // This router is mounted at `/api` in `server.js`.
  // Do NOT use `router.use(authenticate, requireCapability(...))` here, otherwise it will
  // run for *every* `/api/*` request (payroll, presence, chat, weather, etc) and cause
  // widespread 403s for non-hiring roles.
  authenticate,
  requireCapability('canManageHiring'),
  [
    body('agencyId').isInt({ min: 1 }),
    body('candidateUserId').isInt({ min: 1 }),
    body('candidateName').optional().isString().isLength({ max: 180 }),
    body('resumeText').optional().isString().isLength({ max: 20000 }),
    body('linkedInUrl').optional().isString().isLength({ max: 800 })
  ],
  researchCandidate
);

export default router;


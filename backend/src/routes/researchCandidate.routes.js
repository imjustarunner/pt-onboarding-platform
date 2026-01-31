import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';
import { researchCandidate } from '../controllers/researchCandidate.controller.js';

const router = express.Router();

// All research endpoints require hiring capability
router.use(authenticate, requireCapability('canManageHiring'));

router.post(
  '/research-candidate',
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


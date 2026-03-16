import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware.js';
import { createClub, getClubManagerContext, listClubs, applyToClub } from '../controllers/summitStats.controller.js';

const router = express.Router();

// Public: list clubs (no auth)
router.get('/clubs', listClubs);

router.use(authenticate);

router.get('/club-manager-context', getClubManagerContext);
router.post('/clubs', [
  body('name').trim().notEmpty().withMessage('Club name is required'),
  body('slug').optional().trim().isString()
], createClub);
router.post('/clubs/:id/apply', applyToClub);

export default router;

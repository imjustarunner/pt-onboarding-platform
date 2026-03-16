import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware.js';
import { createClub, getClubManagerContext, getClubSpecs, listClubs, applyToClub, addMemberToClub } from '../controllers/summitStats.controller.js';

const router = express.Router();

// Public: list clubs (no auth)
router.get('/clubs', listClubs);

router.use(authenticate);

router.get('/club-specs', getClubSpecs);
router.get('/club-manager-context', getClubManagerContext);
router.post('/clubs', [
  body('name').trim().notEmpty().withMessage('Club name is required'),
  body('slug').optional().trim().isString()
], createClub);
router.post('/clubs/:id/apply', applyToClub);
router.post('/clubs/:id/add-member', [
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('Valid email required')
], addMemberToClub);

export default router;

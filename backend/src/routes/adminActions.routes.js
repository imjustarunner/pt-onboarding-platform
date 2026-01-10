import express from 'express';
import { body } from 'express-validator';
import { resetModule, resetTrack, markModuleComplete, markTrackComplete, getAuditLog } from '../controllers/adminActions.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateAction = [
  body('userId').isInt({ min: 1 }).withMessage('User ID is required'),
  body('agencyId').isInt({ min: 1 }).withMessage('Agency ID is required')
];

const validateModuleAction = [
  ...validateAction,
  body('moduleId').isInt({ min: 1 }).withMessage('Module ID is required')
];

const validateTrackAction = [
  ...validateAction,
  body('trackId').isInt({ min: 1 }).withMessage('Track ID is required')
];

router.post('/reset-module', authenticate, requireAdmin, validateModuleAction, resetModule);
router.post('/reset-track', authenticate, requireAdmin, validateTrackAction, resetTrack);
router.post('/mark-module-complete', authenticate, requireAdmin, validateModuleAction, markModuleComplete);
router.post('/mark-track-complete', authenticate, requireAdmin, validateTrackAction, markTrackComplete);
router.get('/audit-log/:agencyId', authenticate, requireAdmin, getAuditLog);

export default router;


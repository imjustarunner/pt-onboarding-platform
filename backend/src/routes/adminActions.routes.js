import express from 'express';
import { body } from 'express-validator';
import { resetModule, resetTrack, markModuleComplete, markTrackComplete, getAuditLog, syncFormSpec } from '../controllers/adminActions.controller.js';
import { authenticate, requireBackofficeAdmin, requireSuperAdmin } from '../middleware/auth.middleware.js';

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

router.post('/reset-module', authenticate, requireBackofficeAdmin, validateModuleAction, resetModule);
router.post('/reset-track', authenticate, requireBackofficeAdmin, validateTrackAction, resetTrack);
router.post('/mark-module-complete', authenticate, requireBackofficeAdmin, validateModuleAction, markModuleComplete);
router.post('/mark-track-complete', authenticate, requireBackofficeAdmin, validateTrackAction, markTrackComplete);
router.get('/audit-log/:agencyId', authenticate, requireBackofficeAdmin, getAuditLog);
router.post('/sync-form-spec', authenticate, requireSuperAdmin, syncFormSpec);

export default router;


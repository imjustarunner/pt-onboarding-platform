import express from 'express';
import {
  assignTrainingFocus,
  assignModule,
  getPublicTrainings,
  removeTrainingFocus,
  removeModule
} from '../controllers/agencyPublicTraining.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { body } from 'express-validator';

const router = express.Router();

// All routes require authentication and admin/support role
router.use(authenticate);
router.use(requireBackofficeAdmin); // admin/super_admin/support only

router.post(
  '/training-focus',
  [
    body('agencyId').isInt().withMessage('Agency ID is required'),
    body('trainingFocusId').isInt().withMessage('Training Focus ID is required')
  ],
  assignTrainingFocus
);

router.post(
  '/module',
  [
    body('agencyId').isInt().withMessage('Agency ID is required'),
    body('moduleId').isInt().withMessage('Module ID is required')
  ],
  assignModule
);

router.get('/:agencyId', getPublicTrainings);

router.delete(
  '/training-focus/:id',
  removeTrainingFocus
);

router.delete(
  '/module/:id',
  removeModule
);

export default router;


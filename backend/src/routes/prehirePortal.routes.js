import express from 'express';
import { body } from 'express-validator';
import { authenticatePrehireToken } from '../middleware/prehirePortalAuth.middleware.js';
import {
  getPortal,
  getPortalTask,
  portalConsent,
  portalIntent,
  portalSign,
  portalAcknowledge,
  portalComplete,
  listPortalMessages,
  sendPortalMessage,
  completeIntakeFormTask,
  getPortalModule,
  getPortalModuleContent,
  getPortalModuleFormDefinition,
  submitPortalModuleForm,
  uploadPortalModuleFormFile,
  completePortalModule,
  startPortalModule
} from '../controllers/prehirePortal.controller.js';

const router = express.Router();

// All routes validated by the pre-hire token — token is the :token route param
router.use('/:token', authenticatePrehireToken);

router.get('/:token', getPortal);
router.get('/:token/messages', listPortalMessages);
router.post(
  '/:token/messages',
  [body('message').trim().notEmpty().withMessage('message is required')],
  sendPortalMessage
);
router.post('/:token/complete', portalComplete);
router.get('/:token/tasks/:taskId', getPortalTask);
router.post('/:token/tasks/:taskId/consent', portalConsent);
router.post('/:token/tasks/:taskId/intent', portalIntent);
router.post(
  '/:token/tasks/:taskId/sign',
  [body('signatureData').notEmpty().withMessage('Signature data is required')],
  portalSign
);
router.post('/:token/tasks/:taskId/acknowledge', portalAcknowledge);
router.post('/:token/tasks/:taskId/complete-form', completeIntakeFormTask);

// Token-scoped module / employee-info form (no login required)
router.get('/:token/modules/:moduleId', getPortalModule);
router.get('/:token/modules/:moduleId/content', getPortalModuleContent);
router.get('/:token/modules/:moduleId/form-definition', getPortalModuleFormDefinition);
router.post('/:token/modules/:moduleId/form-submit', submitPortalModuleForm);
router.post('/:token/modules/:moduleId/form-upload', uploadPortalModuleFormFile);
router.post('/:token/modules/:moduleId/complete', completePortalModule);
router.post('/:token/modules/:moduleId/progress/start', startPortalModule);

export default router;

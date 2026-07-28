import express from 'express';
import * as ctrl from '../controllers/providerYearUpdate.controller.js';
import { licenseUpload } from '../middleware/licenseUpload.middleware.js';

const router = express.Router();

router.get('/:token', ctrl.getPublicByToken);
router.put('/:token/sections/:sectionKey', ctrl.updatePublicSection);
router.post('/:token/license-upload', licenseUpload.single('file'), ctrl.uploadPublicLicense);
router.post(
  '/:token/schools/:schoolId/clients/:clientId/assigned-day',
  ctrl.assignClientDayByToken
);
router.post('/:token/finalize', ctrl.finalizePublic);

export default router;

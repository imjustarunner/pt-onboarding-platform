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
router.get('/:token/availability/me/pending', ctrl.getAvailabilityPendingByToken);
router.post('/:token/availability/school-requests', ctrl.createSchoolAvailabilityByToken);
router.post(
  '/:token/availability/me/school-requests/:id/withdraw',
  ctrl.withdrawSchoolAvailabilityByToken
);
router.post(
  '/:token/availability/me/requests/unrequest-all',
  ctrl.unrequestAllAvailabilityByToken
);
router.post('/:token/finalize', ctrl.finalizePublic);

export default router;

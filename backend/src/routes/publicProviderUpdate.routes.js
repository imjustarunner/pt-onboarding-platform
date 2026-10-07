import * as review from '../controllers/providerUpdateReview.controller.js';
import { licenseUpload } from '../middleware/licenseUpload.middleware.js';
import express from 'express';
import * as ctrl from '../controllers/providerUpdate.controller.js';
import * as hb from '../controllers/workplaceHandbook.controller.js';
import {protectProviderUpdatePreview} from '../middleware/providerUpdatePreview.middleware.js';

const router = express.Router();
router.use('/:token',protectProviderUpdatePreview);

router.get('/:token', ctrl.getPublicByToken);
router.post('/:token/session-heartbeat', ctrl.heartbeatPublic);
router.put('/:token/sections/:sectionKey', ctrl.updatePublicSection);
router.post('/:token/finalize', ctrl.finalizePublic);
router.get('/:token/office-schedule-review', ctrl.officeSchedulePublic);
router.get('/:token/admin-update-latest', ctrl.latestAdminUpdatePublic);
router.get('/:token/fall-actions', ctrl.fallActionsPublic);

router.get('/:token/handbook', hb.publicPublishedByToken);
router.post('/:token/handbook/views', hb.publicTrackByToken);
router.post('/:token/handbook/questions', hb.publicAskByToken);

router.get('/:token/review-context', review.reviewContext);
router.post('/:token/office-assignments/:assignmentId/:action', review.officeReviewAction);
router.post('/:token/documents/:kind', licenseUpload.single('file'), review.uploadReviewDocument);

export default router;

import {sectionTraining} from '../controllers/providerUpdateTraining.controller.js';
import {updateRoomRequest} from '../controllers/providerUpdateRoomRequest.controller.js';
import {helpUpload,submitUpdateHelp} from '../controllers/providerUpdateHelp.controller.js';
import {getAmendment,amendmentSigning} from '../controllers/providerUpdateAmendmentReview.controller.js';
import {updateAvailability} from '../controllers/providerUpdateAvailability.controller.js';
import {providerUpdateCredentialLimit} from '../middleware/providerUpdateCredentialLimit.middleware.js';
import * as review from '../controllers/providerUpdateReview.controller.js';
import {upload as photoUpload} from '../controllers/userProfilePhoto.controller.js';
import { licenseUpload } from '../middleware/licenseUpload.middleware.js';
import express from 'express';
import * as ctrl from '../controllers/providerUpdate.controller.js';
import * as hb from '../controllers/workplaceHandbook.controller.js';
import {protectProviderUpdatePreview} from '../middleware/providerUpdatePreview.middleware.js';

const router = express.Router();
router.post('/:token/save-for-later', review.saveForLater);
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

router.post('/:token/photo', photoUpload.single('photo'), review.uploadReviewPhoto);
router.put('/:token/fall-actions/:clientId', review.saveFallClientAction);
router.get('/:token/training/:sectionKey', sectionTraining);
router.get('/:token/amendment', getAmendment);
router.get('/:token/amendment/download', (req,res,next)=>{req.params.action='download';return amendmentSigning(req,res,next);});
router.post('/:token/amendment/:action', amendmentSigning);
router.get('/:token/review-context', review.reviewContext);
router.post('/:token/office-assignments/:assignmentId/:action', review.officeReviewAction);
router.post('/:token/documents/:kind', licenseUpload.single('file'), review.uploadReviewDocument);

router.get('/:token/assets/:kind', review.reviewAsset);

router.post('/:token/quick-view-setup', providerUpdateCredentialLimit, review.setupQuickView);
router.get('/:token/contact-hours',review.contactHours);
router.put('/:token/contact-hours',review.contactHours);
router.get('/:token/school-review',review.schoolReview);
router.post('/:token/school-assignments/:assignmentId/request',review.schoolAdjustment);

router.get('/:token/availability-calendar',updateAvailability);
router.post('/:token/availability-calendar/:action',updateAvailability);

router.post('/:token/help-ticket',helpUpload.array('screenshots',3),submitUpdateHelp);

router.get('/:token/availability-rooms',updateRoomRequest);
router.post('/:token/availability-rooms',updateRoomRequest);

export default router;

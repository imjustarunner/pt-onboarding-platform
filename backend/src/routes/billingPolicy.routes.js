import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getPolicyProfiles,
  postPolicyProfile,
  patchPolicyProfile,
  publishPolicyProfileController,
  getPolicyProfileRules,
  postPolicyProfileRule,
  postPolicyRuleEligibility,
  postPolicyRuleSource,
  getAgencyPolicyActivationController,
  putAgencyPolicyActivationController,
  getAgencyServiceCodeActivationController,
  putAgencyServiceCodeActivationController,
  getResolvedRuleForAgencyAndCodeController,
  postPolicyIngestionUploadController,
  getPolicyIngestionJobsController,
  getPolicyIngestionJobDetailController,
  postPolicyIngestionCandidateReviewController,
  postPolicyIngestionPublishController,
  deletePolicyIngestionJobController
} from '../controllers/billingPolicy.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

const router = express.Router();
router.use(authenticate);

// Policy profile and rules
router.get('/profiles', getPolicyProfiles);
router.post('/profiles', postPolicyProfile);
router.put('/profiles/:profileId', patchPolicyProfile);
router.post('/profiles/:profileId/publish', publishPolicyProfileController);
router.get('/profiles/:profileId/rules', getPolicyProfileRules);
router.post('/profiles/:profileId/rules', postPolicyProfileRule);
router.post('/rules/:serviceRuleId/eligibility', postPolicyRuleEligibility);
router.post('/rules/:serviceRuleId/sources', postPolicyRuleSource);

// Agency activation and resolution
router.get('/agency/:agencyId/activation', getAgencyPolicyActivationController);
router.put('/agency/:agencyId/activation', putAgencyPolicyActivationController);
router.get('/agency/:agencyId/service-codes', getAgencyServiceCodeActivationController);
router.put('/agency/:agencyId/service-codes/:serviceCode', putAgencyServiceCodeActivationController);
router.get('/agency/:agencyId/rules/:serviceCode', getResolvedRuleForAgencyAndCodeController);

// PDF ingestion + review/publish
router.post('/profiles/:profileId/ingestion/upload', upload.single('file'), postPolicyIngestionUploadController);
router.get('/ingestion/jobs', getPolicyIngestionJobsController);
router.get('/ingestion/jobs/:jobId', getPolicyIngestionJobDetailController);
router.post('/ingestion/candidates/:candidateId/review', postPolicyIngestionCandidateReviewController);
router.post('/ingestion/jobs/:jobId/publish', postPolicyIngestionPublishController);
router.delete('/ingestion/jobs/:jobId', deletePolicyIngestionJobController);

export default router;

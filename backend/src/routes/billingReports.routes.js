import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  uploadBillingReport,
  listBillingReportUploads,
  getBillingReportUpload,
  getBillingSessionTotals,
  getBillingRevenueSummary,
  getBillingProviderClientPos,
  listClientBillingEncounters,
  listClientMedicalRecord,
  bootstrapBillingEncounterClinicalSession,
  listClientBillingDiagnoses,
  listProviderBillingClients,
  revertBillingReportUploadHandler,
  runBillingAutoTerminate
} from '../controllers/billingReports.controller.js';

const router = express.Router();

router.use(authenticate);

router.post('/uploads', ...uploadBillingReport);
router.get('/uploads', listBillingReportUploads);
router.get('/uploads/:id', getBillingReportUpload);
router.post('/uploads/:id/revert', revertBillingReportUploadHandler);
router.get('/session-totals', getBillingSessionTotals);
router.get('/provider-client-pos', getBillingProviderClientPos);
router.get('/revenue-summary', getBillingRevenueSummary);
router.get('/provider-clients', listProviderBillingClients);
router.get('/clients/:clientId/encounters', listClientBillingEncounters);
router.get('/clients/:clientId/medical-record', listClientMedicalRecord);
router.post('/encounters/:encounterId/clinical-session', bootstrapBillingEncounterClinicalSession);
router.get('/clients/:clientId/diagnoses', listClientBillingDiagnoses);
router.post('/auto-terminate', runBillingAutoTerminate);

export default router;

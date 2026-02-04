import express from 'express';
import { authenticate, requireAgencyAccess, requireAgencyAdmin } from '../middleware/auth.middleware.js';
import {
  addManualNumber,
  assignNumber,
  getAgencySmsSettings,
  getNumberRules,
  listAgencyNumbers,
  listUserAvailableNumbers,
  purchaseNumber,
  releaseNumber,
  resolveOutboundPreview,
  searchAvailableNumbers,
  unassignNumber,
  updateAgencySmsSettings,
  upsertNumberRules
} from '../controllers/smsNumbers.controller.js';

const router = express.Router();

router.use(authenticate);

// Agency-level settings (feature flags)
router.get('/agency/:agencyId/settings', requireAgencyAccess, getAgencySmsSettings);
router.put('/agency/:agencyId/settings', requireAgencyAdmin, updateAgencySmsSettings);

// Agency numbers
router.get('/agency/:agencyId', requireAgencyAccess, listAgencyNumbers);
router.post('/agency/:agencyId/search', requireAgencyAdmin, searchAvailableNumbers);
router.post('/agency/:agencyId/buy', requireAgencyAdmin, purchaseNumber);
router.post('/agency/:agencyId/add', requireAgencyAdmin, addManualNumber);

// Number lifecycle
router.delete('/:numberId', releaseNumber);
router.post('/assign', assignNumber);
router.post('/unassign', unassignNumber);

// Rules
router.get('/:numberId/rules', getNumberRules);
router.put('/:numberId/rules', upsertNumberRules);

// Current user available numbers
router.get('/available', listUserAvailableNumbers);
router.get('/resolve', resolveOutboundPreview);

export default router;

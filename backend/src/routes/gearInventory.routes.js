import express from 'express';
import { authenticate, requireAgencyAdminOrOperationsLead } from '../middleware/auth.middleware.js';
import {
  getGearSummary,
  listGearTypes,
  createGearType,
  updateGearType,
  listGearStock,
  adjustGearStock,
  listGearAssets,
  createGearAsset,
  updateGearAsset,
  listGearMovements,
  listUserGearAssignments,
  issueUserGear,
  returnUserGear,
  getUserGearPreferences,
  setUserGearPreferences,
  listIssuableOptions,
} from '../controllers/gearInventory.controller.js';

const router = express.Router();

router.use(authenticate);

// Catalog
router.get('/:agencyId/summary', requireAgencyAdminOrOperationsLead, getGearSummary);
router.get('/:agencyId/types', requireAgencyAdminOrOperationsLead, listGearTypes);
router.post('/:agencyId/types', requireAgencyAdminOrOperationsLead, createGearType);
router.patch('/:agencyId/types/:typeId', requireAgencyAdminOrOperationsLead, updateGearType);

// Sized stock
router.get('/:agencyId/stock', requireAgencyAdminOrOperationsLead, listGearStock);
router.post('/:agencyId/stock/adjust', requireAgencyAdminOrOperationsLead, adjustGearStock);

// Unique assets
router.get('/:agencyId/assets', requireAgencyAdminOrOperationsLead, listGearAssets);
router.post('/:agencyId/assets', requireAgencyAdminOrOperationsLead, createGearAsset);
router.patch('/:agencyId/assets/:assetId', requireAgencyAdminOrOperationsLead, updateGearAsset);

// Movements
router.get('/:agencyId/movements', requireAgencyAdminOrOperationsLead, listGearMovements);

// Issuable options for a type
router.get('/:agencyId/types/:typeId/issuable', requireAgencyAdminOrOperationsLead, listIssuableOptions);

// Per-user assignments / preferences (profile Lifecycle Equipment)
router.get('/:agencyId/users/:userId/assignments', requireAgencyAdminOrOperationsLead, listUserGearAssignments);
router.post('/:agencyId/users/:userId/issue', requireAgencyAdminOrOperationsLead, issueUserGear);
router.post('/:agencyId/assignments/:assignmentId/return', requireAgencyAdminOrOperationsLead, returnUserGear);
router.get('/:agencyId/users/:userId/preferences', requireAgencyAdminOrOperationsLead, getUserGearPreferences);
router.put('/:agencyId/users/:userId/preferences', requireAgencyAdminOrOperationsLead, setUserGearPreferences);

export default router;

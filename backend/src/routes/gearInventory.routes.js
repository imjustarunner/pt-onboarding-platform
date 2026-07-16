import express from 'express';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.middleware.js';
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
router.get('/:agencyId/summary', requireAgencyAdmin, getGearSummary);
router.get('/:agencyId/types', requireAgencyAdmin, listGearTypes);
router.post('/:agencyId/types', requireAgencyAdmin, createGearType);
router.patch('/:agencyId/types/:typeId', requireAgencyAdmin, updateGearType);

// Sized stock
router.get('/:agencyId/stock', requireAgencyAdmin, listGearStock);
router.post('/:agencyId/stock/adjust', requireAgencyAdmin, adjustGearStock);

// Unique assets
router.get('/:agencyId/assets', requireAgencyAdmin, listGearAssets);
router.post('/:agencyId/assets', requireAgencyAdmin, createGearAsset);
router.patch('/:agencyId/assets/:assetId', requireAgencyAdmin, updateGearAsset);

// Movements
router.get('/:agencyId/movements', requireAgencyAdmin, listGearMovements);

// Issuable options for a type
router.get('/:agencyId/types/:typeId/issuable', requireAgencyAdmin, listIssuableOptions);

// Per-user assignments / preferences (profile Lifecycle Equipment)
router.get('/:agencyId/users/:userId/assignments', requireAgencyAdmin, listUserGearAssignments);
router.post('/:agencyId/users/:userId/issue', requireAgencyAdmin, issueUserGear);
router.post('/:agencyId/assignments/:assignmentId/return', requireAgencyAdmin, returnUserGear);
router.get('/:agencyId/users/:userId/preferences', requireAgencyAdmin, getUserGearPreferences);
router.put('/:agencyId/users/:userId/preferences', requireAgencyAdmin, setUserGearPreferences);

export default router;

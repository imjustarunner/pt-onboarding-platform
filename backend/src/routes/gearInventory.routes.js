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
  getCatalogSummary,
  listCatalog,
  getCatalogItem,
  createCatalogItem,
  updateCatalogItem,
  upsertCatalogAgencies,
  uploadCatalogImage,
  deleteCatalogImage,
  markCatalogLow,
  clearCatalogLow,
  sendCatalogItem,
  listCatalogActivity,
  listCatalogAgencies,
  listCatalogAgencyUsers,
  catalogImageUpload,
} from '../controllers/gearInventory.controller.js';

const router = express.Router();

router.use(authenticate);

const requireCatalogAccess = (req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  const allowed = [
    'super_admin',
    'admin',
    'support',
    'staff',
    'clinical_practice_assistant',
    'provider_plus',
  ];
  if (allowed.includes(role)) return next();
  return res.status(403).json({ error: { message: 'Admin access required for Gear & Materials catalog' } });
};

// Multi-agency catalog (must be registered before /:agencyId routes)
router.get('/catalog/summary', requireCatalogAccess, getCatalogSummary);
router.get('/catalog', requireCatalogAccess, listCatalog);
router.get('/catalog/activity', requireCatalogAccess, listCatalogActivity);
router.get('/catalog/agencies', requireCatalogAccess, listCatalogAgencies);
router.get('/catalog/agencies/:agencyId/users', requireCatalogAccess, listCatalogAgencyUsers);
router.post('/catalog', requireCatalogAccess, createCatalogItem);
router.get('/catalog/:catalogItemId', requireCatalogAccess, getCatalogItem);
router.patch('/catalog/:catalogItemId', requireCatalogAccess, updateCatalogItem);
router.put('/catalog/:catalogItemId/agencies', requireCatalogAccess, upsertCatalogAgencies);
router.post(
  '/catalog/:catalogItemId/images',
  requireCatalogAccess,
  catalogImageUpload.single('image'),
  uploadCatalogImage
);
router.delete('/catalog/:catalogItemId/images/:imageId', requireCatalogAccess, deleteCatalogImage);
router.post('/catalog/:catalogItemId/mark-low', requireCatalogAccess, markCatalogLow);
router.post('/catalog/:catalogItemId/clear-low', requireCatalogAccess, clearCatalogLow);
router.post('/catalog/:catalogItemId/send', requireCatalogAccess, sendCatalogItem);

// Agency-scoped inventory (lifecycle + legacy)
router.get('/:agencyId/summary', requireAgencyAdminOrOperationsLead, getGearSummary);
router.get('/:agencyId/types', requireAgencyAdminOrOperationsLead, listGearTypes);
router.post('/:agencyId/types', requireAgencyAdminOrOperationsLead, createGearType);
router.patch('/:agencyId/types/:typeId', requireAgencyAdminOrOperationsLead, updateGearType);

router.get('/:agencyId/stock', requireAgencyAdminOrOperationsLead, listGearStock);
router.post('/:agencyId/stock/adjust', requireAgencyAdminOrOperationsLead, adjustGearStock);

router.get('/:agencyId/assets', requireAgencyAdminOrOperationsLead, listGearAssets);
router.post('/:agencyId/assets', requireAgencyAdminOrOperationsLead, createGearAsset);
router.patch('/:agencyId/assets/:assetId', requireAgencyAdminOrOperationsLead, updateGearAsset);

router.get('/:agencyId/movements', requireAgencyAdminOrOperationsLead, listGearMovements);

router.get('/:agencyId/types/:typeId/issuable', requireAgencyAdminOrOperationsLead, listIssuableOptions);

router.get('/:agencyId/users/:userId/assignments', requireAgencyAdminOrOperationsLead, listUserGearAssignments);
router.post('/:agencyId/users/:userId/issue', requireAgencyAdminOrOperationsLead, issueUserGear);
router.post('/:agencyId/assignments/:assignmentId/return', requireAgencyAdminOrOperationsLead, returnUserGear);
router.get('/:agencyId/users/:userId/preferences', requireAgencyAdminOrOperationsLead, getUserGearPreferences);
router.put('/:agencyId/users/:userId/preferences', requireAgencyAdminOrOperationsLead, setUserGearPreferences);

export default router;

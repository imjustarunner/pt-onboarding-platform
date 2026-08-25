import express from 'express';
import { authenticate, requireAgencyAdminOrOperationsLead, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { actorCanManagePlatformGear } from '../services/gearCatalog.service.js';
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
  listGearPackages,
  getGearPackage,
  createGearPackage,
  updateGearPackage,
  deleteGearPackage,
  previewGearPackageIssue,
  issueGearPackage,
  listPlatformGearManagers,
  searchPlatformGearGrantUsers,
  setPlatformGearAccess,
} from '../controllers/gearInventory.controller.js';

const router = express.Router();

router.use(authenticate);

const requireCatalogAccess = async (req, res, next) => {
  try {
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
    // Explicit platform gear grant (e.g. materials staff who are not admin roles)
    if (await actorCanManagePlatformGear(req.user)) return next();
    return res.status(403).json({ error: { message: 'Admin access required for Gear & Materials catalog' } });
  } catch (err) {
    return next(err);
  }
};

/** Agency inventory routes: agency admin/ops lead, or platform gear managers. */
const requireGearAgencyAccess = async (req, res, next) => {
  try {
    if (await actorCanManagePlatformGear(req.user)) return next();
    return requireAgencyAdminOrOperationsLead(req, res, next);
  } catch (err) {
    return next(err);
  }
};

// Multi-agency catalog (must be registered before /:agencyId routes)
router.get('/catalog/summary', requireCatalogAccess, getCatalogSummary);
router.get('/catalog', requireCatalogAccess, listCatalog);
router.get('/catalog/activity', requireCatalogAccess, listCatalogActivity);
router.get('/catalog/agencies', requireCatalogAccess, listCatalogAgencies);
router.get('/catalog/agencies/:agencyId/users', requireCatalogAccess, listCatalogAgencyUsers);

// Superadmin: grant / revoke platform-wide Gear access on this page
router.get('/platform-managers', requireSuperAdmin, listPlatformGearManagers);
router.get('/platform-managers/search', requireSuperAdmin, searchPlatformGearGrantUsers);
router.put('/platform-managers/:userId', requireSuperAdmin, setPlatformGearAccess);

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

// Packages (kits)
router.get('/packages', requireCatalogAccess, listGearPackages);
router.post('/packages', requireCatalogAccess, createGearPackage);
router.get('/packages/:packageId', requireCatalogAccess, getGearPackage);
router.patch('/packages/:packageId', requireCatalogAccess, updateGearPackage);
router.delete('/packages/:packageId', requireCatalogAccess, deleteGearPackage);
router.post('/packages/:packageId/preview-issue', requireCatalogAccess, previewGearPackageIssue);
router.post('/packages/:packageId/issue', requireCatalogAccess, issueGearPackage);

// Agency-scoped inventory (lifecycle + legacy)
router.get('/:agencyId/summary', requireGearAgencyAccess, getGearSummary);
router.get('/:agencyId/types', requireGearAgencyAccess, listGearTypes);
router.post('/:agencyId/types', requireGearAgencyAccess, createGearType);
router.patch('/:agencyId/types/:typeId', requireGearAgencyAccess, updateGearType);

router.get('/:agencyId/stock', requireGearAgencyAccess, listGearStock);
router.post('/:agencyId/stock/adjust', requireGearAgencyAccess, adjustGearStock);

router.get('/:agencyId/assets', requireGearAgencyAccess, listGearAssets);
router.post('/:agencyId/assets', requireGearAgencyAccess, createGearAsset);
router.patch('/:agencyId/assets/:assetId', requireGearAgencyAccess, updateGearAsset);

router.get('/:agencyId/movements', requireGearAgencyAccess, listGearMovements);

router.get('/:agencyId/types/:typeId/issuable', requireGearAgencyAccess, listIssuableOptions);

router.get('/:agencyId/users/:userId/assignments', requireGearAgencyAccess, listUserGearAssignments);
router.post('/:agencyId/users/:userId/issue', requireGearAgencyAccess, issueUserGear);
router.post('/:agencyId/assignments/:assignmentId/return', requireGearAgencyAccess, returnUserGear);
router.get('/:agencyId/users/:userId/preferences', requireGearAgencyAccess, getUserGearPreferences);
router.put('/:agencyId/users/:userId/preferences', requireGearAgencyAccess, setUserGearPreferences);

export default router;

import * as gearInventory from '../services/gearInventory.service.js';
import * as gearCatalog from '../services/gearCatalog.service.js';
import * as gearPackages from '../services/gearPackages.service.js';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype || '')) return cb(null, true);
    cb(new Error('Only image uploads are allowed'));
  }
});

export const catalogImageUpload = upload;

const agencyFromReq = (req) =>
  Number(req.params.agencyId || req.query.agencyId || req.body?.agencyId || req.headers['x-agency-id'] || 0) || null;

const handle = (fn) => async (req, res, next) => {
  try {
    const data = await fn(req);
    res.json(data);
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ error: { message: err.message || 'Request failed' } });
    }
    next(err);
  }
};

export const getGearSummary = handle(async (req) => gearInventory.getSummary(agencyFromReq(req)));

export const listGearTypes = handle(async (req) =>
  gearInventory.listTypes(agencyFromReq(req), { includeInactive: req.query.includeInactive === '1' })
);

export const createGearType = handle(async (req) =>
  gearInventory.createType(agencyFromReq(req), req.body || {}, req.user?.id)
);

export const updateGearType = handle(async (req) =>
  gearInventory.updateType(
    Number(req.params.agencyId || 0) || agencyFromReq(req),
    req.params.typeId,
    req.body || {},
    req.user || null
  )
);

export const listGearStock = handle(async (req) => gearInventory.listStock(agencyFromReq(req)));

export const adjustGearStock = handle(async (req) =>
  gearInventory.adjustStock(agencyFromReq(req), req.body || {}, req.user?.id)
);

export const listGearAssets = handle(async (req) =>
  gearInventory.listAssets(agencyFromReq(req), {
    gearItemTypeId: req.query.gearItemTypeId || null,
    status: req.query.status || null,
  })
);

export const createGearAsset = handle(async (req) =>
  gearInventory.createAsset(agencyFromReq(req), req.body || {}, req.user?.id)
);

export const updateGearAsset = handle(async (req) =>
  gearInventory.updateAsset(agencyFromReq(req), req.params.assetId, req.body || {})
);

export const listGearMovements = handle(async (req) =>
  gearInventory.listMovements(agencyFromReq(req), { limit: req.query.limit })
);

export const listUserGearAssignments = handle(async (req) =>
  gearInventory.listUserAssignments(agencyFromReq(req), req.params.userId, {
    activeOnly: req.query.activeOnly !== '0',
  })
);

export const issueUserGear = handle(async (req) =>
  gearInventory.issueGear(
    agencyFromReq(req),
    { ...(req.body || {}), userId: req.params.userId || req.body?.userId },
    req.user?.id
  )
);

export const returnUserGear = handle(async (req) =>
  gearInventory.returnGear(agencyFromReq(req), req.params.assignmentId, req.user?.id, req.body || {})
);

export const getUserGearPreferences = handle(async (req) =>
  gearInventory.getUserPreferences(agencyFromReq(req), req.params.userId)
);

export const setUserGearPreferences = handle(async (req) =>
  gearInventory.setUserPreferences(
    agencyFromReq(req),
    req.params.userId,
    req.body?.preferences || req.body || {},
    req.user?.id
  )
);

export const listIssuableOptions = handle(async (req) =>
  gearInventory.listIssuableStock(agencyFromReq(req), req.params.typeId)
);

export const getCatalogSummary = handle(async (req) => gearCatalog.getCatalogSummary(req.user));

export const listCatalog = handle(async (req) =>
  gearCatalog.listCatalog(req.user, {
    agencyId: req.query.agencyId || null,
    category: req.query.category || null,
    status: req.query.status || null,
    search: req.query.search || req.query.q || null,
    sort: req.query.sort || 'type',
    includeInactive: req.query.includeInactive === '1'
  })
);

export const getCatalogItem = handle(async (req) =>
  gearCatalog.getCatalogItem(req.user, req.params.catalogItemId)
);

export const createCatalogItem = handle(async (req) =>
  gearCatalog.createCatalogItem(req.user, req.body || {})
);

export const updateCatalogItem = handle(async (req) =>
  gearCatalog.updateCatalogItem(req.user, req.params.catalogItemId, req.body || {})
);

export const upsertCatalogAgencies = handle(async (req) =>
  gearCatalog.upsertCatalogAgencies(
    req.user,
    req.params.catalogItemId,
    req.body?.agencies || req.body || []
  )
);

export const uploadCatalogImage = handle(async (req) =>
  gearCatalog.uploadCatalogImage(req.user, req.params.catalogItemId, req.file, {
    isPrimary: req.body?.isPrimary === '1' || req.body?.isPrimary === true || req.body?.isPrimary === 'true'
  })
);

export const deleteCatalogImage = handle(async (req) =>
  gearCatalog.deleteCatalogImage(req.user, req.params.catalogItemId, req.params.imageId)
);

export const markCatalogLow = handle(async (req) =>
  gearCatalog.markAgencyLow(req.user, req.params.catalogItemId, req.body?.agencyId, {
    low: req.body?.low !== false && req.body?.low !== 0 && req.body?.low !== '0',
    reason: req.body?.reason || null
  })
);

export const clearCatalogLow = handle(async (req) =>
  gearCatalog.markAgencyLow(req.user, req.params.catalogItemId, req.body?.agencyId, {
    low: false,
    reason: req.body?.reason || null
  })
);

export const sendCatalogItem = handle(async (req) =>
  gearCatalog.sendCatalogItem(req.user, req.params.catalogItemId, req.body || {})
);

export const listCatalogActivity = handle(async (req) =>
  gearCatalog.listActivity(req.user, {
    agencyId: req.query.agencyId || null,
    catalogItemId: req.query.catalogItemId || null,
    limit: req.query.limit
  })
);

export const listCatalogAgencies = handle(async (req) =>
  gearCatalog.listAccessibleAgencies(req.user)
);

export const listCatalogAgencyUsers = handle(async (req) =>
  gearCatalog.listAgencyUsersForPicker(req.user, req.params.agencyId)
);

export const listPlatformGearManagers = handle(async (req) =>
  gearCatalog.listPlatformGearManagers(req.user)
);

export const searchPlatformGearGrantUsers = handle(async (req) =>
  gearCatalog.searchUsersForPlatformGearGrant(req.user, {
    q: req.query.q || '',
    limit: req.query.limit,
  })
);

export const setPlatformGearAccess = handle(async (req) =>
  gearCatalog.setPlatformGearAccess(
    req.user,
    req.params.userId || req.body?.userId,
    req.body?.enabled !== false && req.body?.enabled !== 0 && req.body?.enabled !== '0'
  )
);

export const listGearPackages = handle(async (req) =>
  gearPackages.listPackages(req.user, {
    agencyId: req.query.agencyId || null,
    packageType: req.query.packageType || null,
  })
);

export const getGearPackage = handle(async (req) =>
  gearPackages.getPackage(req.user, req.params.packageId)
);

export const createGearPackage = handle(async (req) =>
  gearPackages.createPackage(req.user, req.body || {})
);

export const updateGearPackage = handle(async (req) =>
  gearPackages.updatePackage(req.user, req.params.packageId, req.body || {})
);

export const deleteGearPackage = handle(async (req) =>
  gearPackages.deletePackage(req.user, req.params.packageId)
);

export const previewGearPackageIssue = handle(async (req) =>
  gearPackages.previewPackageIssue(req.user, req.params.packageId, {
    agencyId: req.body?.agencyId || req.query.agencyId,
    userId: req.body?.userId || req.query.userId,
  })
);

export const issueGearPackage = handle(async (req) =>
  gearPackages.issuePackage(req.user, req.params.packageId, req.body || {})
);

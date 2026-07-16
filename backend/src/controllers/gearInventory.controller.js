import * as gearInventory from '../services/gearInventory.service.js';

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
  gearInventory.updateType(agencyFromReq(req), req.params.typeId, req.body || {})
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

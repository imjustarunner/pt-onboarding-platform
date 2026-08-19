import {
  listMaterialsRequestBoard,
  listAssignees,
  getInventoryOptions,
  assignMaterialsItem,
  fulfillMaterialsItem,
  reopenMaterialsItem,
} from '../services/materialsRequests.service.js';

function safeInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

export async function getBoard(req, res, next) {
  try {
    const agencyId = safeInt(req.params.agencyId);
    const schoolYear = req.query.schoolYear ? String(req.query.schoolYear) : null;
    const data = await listMaterialsRequestBoard(agencyId, { schoolYear });
    res.json(data);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

export async function getAssignees(req, res, next) {
  try {
    const agencyId = safeInt(req.params.agencyId);
    const users = await listAssignees(agencyId);
    res.json({ users });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

export async function getInventoryOptionsHandler(req, res, next) {
  try {
    const agencyId = safeInt(req.params.agencyId);
    const itemKey = String(req.query.itemKey || '');
    const data = await getInventoryOptions(agencyId, itemKey);
    res.json(data);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

export async function assignItem(req, res, next) {
  try {
    const agencyId = safeInt(req.params.agencyId);
    const row = await assignMaterialsItem({
      agencyId,
      sourceType: req.body?.sourceType,
      sourceId: req.body?.sourceId,
      itemKey: req.body?.itemKey,
      assignedToUserId: req.body?.assignedToUserId,
      notes: req.body?.notes,
      actorUserId: req.user?.id || null,
    });
    res.json({ fulfillment: row });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

export async function fulfillItem(req, res, next) {
  try {
    const agencyId = safeInt(req.params.agencyId);
    const result = await fulfillMaterialsItem({
      agencyId,
      sourceType: req.body?.sourceType,
      sourceId: req.body?.sourceId,
      itemKey: req.body?.itemKey,
      actorUserId: req.user?.id || null,
      notes: req.body?.notes,
      gearItemTypeId: req.body?.gearItemTypeId,
      uniqueAssetId: req.body?.uniqueAssetId,
      sizeLabel: req.body?.sizeLabel,
      gender: req.body?.gender,
      issueToUserId: req.body?.issueToUserId,
      skipInventory: req.body?.skipInventory === true,
    });
    res.json(result);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

export async function reopenItem(req, res, next) {
  try {
    const agencyId = safeInt(req.params.agencyId);
    const row = await reopenMaterialsItem({
      agencyId,
      sourceType: req.body?.sourceType,
      sourceId: req.body?.sourceId,
      itemKey: req.body?.itemKey,
      actorUserId: req.user?.id || null,
    });
    res.json({ fulfillment: row });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

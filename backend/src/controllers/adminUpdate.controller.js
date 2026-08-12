import User from '../models/User.model.js';
import * as AdminUpdateService from '../services/adminUpdate.service.js';

const parseAgencyId = (raw) => {
  const id = parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const parseId = (raw) => {
  const id = parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

async function ensureAgencyAccess(req, agencyId) {
  if (req.user?.role === 'super_admin') return;
  const userAgencies = await User.getAgencies(req.user.id);
  if (!(userAgencies || []).some((a) => Number(a.id) === Number(agencyId))) {
    const err = new Error('Access denied to this agency');
    err.status = 403;
    throw err;
  }
}

function handle(res, next, err) {
  if (err?.status) {
    return res.status(err.status).json({ error: { message: err.message } });
  }
  return next(err);
}

export const getAdminUpdateOptions = async (req, res, next) => {
  try {
    res.json(AdminUpdateService.catalogOptions());
  } catch (error) {
    next(error);
  }
};

export const listAdminUpdates = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    await ensureAgencyAccess(req, agencyId);
    const rows = await AdminUpdateService.listUpdates(agencyId);
    res.json({ updates: rows });
  } catch (error) {
    handle(res, next, error);
  }
};

export const createAdminUpdate = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agency id' } });
    await ensureAgencyAccess(req, agencyId);
    const created = await AdminUpdateService.createUpdate({
      agencyId,
      createdByUserId: req.user.id,
      title: req.body?.title
    });
    res.status(201).json(created);
  } catch (error) {
    handle(res, next, error);
  }
};

export const getAdminUpdate = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    if (!agencyId || !updateId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.json(await AdminUpdateService.getUpdate(agencyId, updateId));
  } catch (error) {
    handle(res, next, error);
  }
};

export const updateAdminUpdate = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    if (!agencyId || !updateId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.json(await AdminUpdateService.updateDraft(agencyId, updateId, req.body || {}));
  } catch (error) {
    handle(res, next, error);
  }
};

export const deleteAdminUpdate = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    if (!agencyId || !updateId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.json(await AdminUpdateService.deleteUpdate(agencyId, updateId));
  } catch (error) {
    handle(res, next, error);
  }
};

export const addAdminUpdateTopic = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    if (!agencyId || !updateId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.status(201).json(await AdminUpdateService.addTopic(agencyId, updateId, req.body || {}));
  } catch (error) {
    handle(res, next, error);
  }
};

export const updateAdminUpdateTopic = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    const topicId = parseId(req.params.topicId);
    if (!agencyId || !updateId || !topicId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.json(await AdminUpdateService.updateTopic(agencyId, updateId, topicId, req.body || {}));
  } catch (error) {
    handle(res, next, error);
  }
};

export const deleteAdminUpdateTopic = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    const topicId = parseId(req.params.topicId);
    if (!agencyId || !updateId || !topicId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.json(await AdminUpdateService.deleteTopic(agencyId, updateId, topicId));
  } catch (error) {
    handle(res, next, error);
  }
};

export const addAdminUpdateItem = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    const topicId = parseId(req.params.topicId);
    if (!agencyId || !updateId || !topicId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.status(201).json(await AdminUpdateService.addItem(agencyId, updateId, topicId, req.body || {}));
  } catch (error) {
    handle(res, next, error);
  }
};

export const updateAdminUpdateItem = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    const itemId = parseId(req.params.itemId);
    if (!agencyId || !updateId || !itemId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.json(await AdminUpdateService.updateItem(agencyId, updateId, itemId, req.body || {}));
  } catch (error) {
    handle(res, next, error);
  }
};

export const deleteAdminUpdateItem = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    const itemId = parseId(req.params.itemId);
    if (!agencyId || !updateId || !itemId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.json(await AdminUpdateService.deleteItem(agencyId, updateId, itemId));
  } catch (error) {
    handle(res, next, error);
  }
};

export const refreshAdminUpdatePeople = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    if (!agencyId || !updateId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.json(await AdminUpdateService.refreshPeople(agencyId, updateId));
  } catch (error) {
    handle(res, next, error);
  }
};

export const previewAdminUpdate = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    if (!agencyId || !updateId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.json(await AdminUpdateService.previewHtml(agencyId, updateId));
  } catch (error) {
    handle(res, next, error);
  }
};

export const testAdminUpdate = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    const to = String(req.body?.to || '').trim();
    if (!agencyId || !updateId) return res.status(400).json({ error: { message: 'Invalid id' } });
    if (!to.includes('@')) return res.status(400).json({ error: { message: 'A test recipient email is required' } });
    await ensureAgencyAccess(req, agencyId);
    res.json(await AdminUpdateService.sendTest({
      agencyId,
      updateId,
      to,
      actorUserId: req.user.id
    }));
  } catch (error) {
    handle(res, next, error);
  }
};

export const scheduleAdminUpdate = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    if (!agencyId || !updateId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.json(await AdminUpdateService.scheduleUpdate(agencyId, updateId, req.body?.scheduledAt));
  } catch (error) {
    handle(res, next, error);
  }
};

export const cancelAdminUpdate = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    if (!agencyId || !updateId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.json(await AdminUpdateService.cancelSchedule(agencyId, updateId));
  } catch (error) {
    handle(res, next, error);
  }
};

export const getAdminUpdateActivity = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    if (!agencyId || !updateId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.json(await AdminUpdateService.activitySummary(agencyId, updateId));
  } catch (error) {
    handle(res, next, error);
  }
};

export const getAdminUpdatePublicLink = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req.params.id);
    const updateId = parseId(req.params.updateId);
    if (!agencyId || !updateId) return res.status(400).json({ error: { message: 'Invalid id' } });
    await ensureAgencyAccess(req, agencyId);
    res.json(await AdminUpdateService.publicLinkForUpdate(agencyId, updateId));
  } catch (error) {
    handle(res, next, error);
  }
};

export const getMyAdminUpdateSplash = async (req, res, next) => {
  try {
    const splash = await AdminUpdateService.pendingSplashForUser(req.user.id);
    res.json({ splash });
  } catch (error) {
    handle(res, next, error);
  }
};

export const openMyAdminUpdateSplash = async (req, res, next) => {
  try {
    const splashId = parseId(req.params.splashId);
    if (!splashId) return res.status(400).json({ error: { message: 'Invalid id' } });
    res.json(await AdminUpdateService.markSplashOpened(req.user.id, splashId));
  } catch (error) {
    handle(res, next, error);
  }
};

export const dismissMyAdminUpdateSplash = async (req, res, next) => {
  try {
    const splashId = parseId(req.params.splashId);
    if (!splashId) return res.status(400).json({ error: { message: 'Invalid id' } });
    res.json(await AdminUpdateService.dismissSplash(req.user.id, splashId));
  } catch (error) {
    handle(res, next, error);
  }
};

export const openMyAdminUpdateSplashByToken = async (req, res, next) => {
  try {
    res.json(await AdminUpdateService.markSplashOpenedByViewToken(req.user.id, req.params.token));
  } catch (error) {
    handle(res, next, error);
  }
};

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  'base64'
);

export const getPublicAdminUpdate = async (req, res, next) => {
  try {
    res.json(await AdminUpdateService.getPublicView(req.params.token));
  } catch (error) {
    handle(res, next, error);
  }
};

export const postPublicAdminUpdateActivity = async (req, res, next) => {
  try {
    res.json(await AdminUpdateService.recordPublicActivity(req.params.token, req.body || {}));
  } catch (error) {
    handle(res, next, error);
  }
};

export const trackPublicAdminUpdateOpen = async (req, res) => {
  try {
    const raw = String(req.params.token || '').replace(/\.(gif|png|jpg|jpeg)$/i, '');
    await AdminUpdateService.trackOpenByToken(raw);
  } catch {
    // pixel must always succeed
  }
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.status(200).send(TRANSPARENT_GIF);
};

export const trackPublicAdminUpdateClick = async (req, res, next) => {
  try {
    const dest = await AdminUpdateService.trackClickByToken(req.params.token, req.query?.u);
    res.redirect(302, dest);
  } catch (error) {
    handle(res, next, error);
  }
};


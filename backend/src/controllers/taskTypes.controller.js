import TaskTypeDefinition from '../models/TaskTypeDefinition.model.js';

export const listTaskTypes = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });
    const types = await TaskTypeDefinition.listForUser(userId, agencyId);
    res.json(types);
  } catch (err) {
    next(err);
  }
};

export const createAgencyTaskType = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin', 'support'].includes(role)) {
      return res.status(403).json({ error: { message: 'Admin, support, or superadmin required' } });
    }
    const { agencyId, slug, label, colorHex, iconKey, iconChoices, sortOrder } = req.body || {};
    const aid = parseInt(agencyId, 10);
    if (!aid || !label) return res.status(400).json({ error: { message: 'agencyId and label required' } });
    const row = await TaskTypeDefinition.create({
      agencyId: aid,
      slug: slug || label,
      label,
      colorHex,
      iconKey,
      iconChoices,
      sortOrder,
      createdByUserId: userId
    });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
};

export const createPlatformTaskType = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Superadmin required' } });
    }
    const { slug, label, colorHex, iconKey, iconChoices, sortOrder, systemTaskType } = req.body || {};
    if (!label) return res.status(400).json({ error: { message: 'label required' } });
    const row = await TaskTypeDefinition.create({
      agencyId: null,
      slug: slug || label,
      label,
      colorHex,
      iconKey,
      iconChoices,
      sortOrder,
      systemTaskType,
      createdByUserId: req.user.id
    });
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
};

export const updateTaskType = async (req, res, next) => {
  try {
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin', 'support'].includes(role)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const id = parseInt(req.params.id, 10);
    const row = await TaskTypeDefinition.update(id, req.body || {});
    if (!row) return res.status(404).json({ error: { message: 'Not found' } });
    res.json(row);
  } catch (err) {
    next(err);
  }
};

export const setTaskTypePref = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const definitionId = parseInt(req.params.id, 10);
    const { isHidden, preferredIconKey, sortOrder } = req.body || {};
    await TaskTypeDefinition.setUserPref(userId, definitionId, {
      isHidden: !!isHidden,
      preferredIconKey,
      sortOrder
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

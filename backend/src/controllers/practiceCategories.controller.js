import User from '../models/User.model.js';
import {
  getPracticeCategoriesForUserAgency,
  setPracticeCategoriesForUserAgency,
  addPracticeCategoryForUserAgency,
  removePracticeCategoryForUserAgency,
  getPracticeCategoryDefaultsForAgency,
  setPracticeCategoryDefaultsForAgency,
  bulkAssignPracticeCategory,
  ensureDefaultsForEnabledBusinessTypes
} from '../services/practiceCategories.service.js';

const MANAGE_ROLES = new Set([
  'super_admin',
  'admin',
  'support',
  'assistant_admin',
  'clinical_practice_assistant'
]);

function canManagePracticeCategories(actor, targetUserId) {
  if (!actor) return false;
  if (Number(actor.id) === Number(targetUserId)) return true;
  return MANAGE_ROLES.has(String(actor.role || '').toLowerCase());
}

function canManageCatalog(role) {
  const r = String(role || '').toLowerCase();
  return ['super_admin', 'superadmin', 'admin', 'agency_admin', 'backoffice_admin', 'support'].includes(r);
}

export const getUserAgencyPracticeCategories = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId || req.params.id || 0);
    const agencyId = Number(req.params.agencyId || 0);
    if (!userId || !agencyId) {
      return res.status(400).json({ error: { message: 'userId and agencyId are required' } });
    }
    if (!canManagePracticeCategories(req.user, userId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ error: { message: 'User not found' } });

    const payload = await getPracticeCategoriesForUserAgency(agencyId, userId);
    res.json({ ok: true, ...payload });
  } catch (e) {
    next(e);
  }
};

export const putUserAgencyPracticeCategories = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId || req.params.id || 0);
    const agencyId = Number(req.params.agencyId || 0);
    if (!userId || !agencyId) {
      return res.status(400).json({ error: { message: 'userId and agencyId are required' } });
    }
    if (!canManagePracticeCategories(req.user, userId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ error: { message: 'User not found' } });

    const categories = Array.isArray(req.body?.categories)
      ? req.body.categories
      : Array.isArray(req.body)
        ? req.body
        : [];

    const payload = await setPracticeCategoriesForUserAgency(agencyId, userId, categories);
    res.json({ ok: true, ...payload });
  } catch (e) {
    if (e?.status === 400) {
      return res.status(400).json({ error: { message: e.message } });
    }
    next(e);
  }
};

/** POST …/practice-categories/:category — grant one category without replacing others. */
export const postUserAgencyPracticeCategory = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId || req.params.id || 0);
    const agencyId = Number(req.params.agencyId || 0);
    const category = String(req.params.category || req.body?.category || '').trim();
    if (!userId || !agencyId || !category) {
      return res.status(400).json({ error: { message: 'userId, agencyId, and category are required' } });
    }
    if (!canManagePracticeCategories(req.user, userId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ error: { message: 'User not found' } });

    const payload = await addPracticeCategoryForUserAgency(agencyId, userId, category);
    res.json({ ok: true, ...payload });
  } catch (e) {
    if (e?.status === 400) {
      return res.status(400).json({ error: { message: e.message } });
    }
    next(e);
  }
};

/** DELETE …/practice-categories/:category — revoke or remove one category. */
export const deleteUserAgencyPracticeCategory = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId || req.params.id || 0);
    const agencyId = Number(req.params.agencyId || 0);
    const category = String(req.params.category || '').trim();
    if (!userId || !agencyId || !category) {
      return res.status(400).json({ error: { message: 'userId, agencyId, and category are required' } });
    }
    if (!canManagePracticeCategories(req.user, userId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ error: { message: 'User not found' } });

    const payload = await removePracticeCategoryForUserAgency(agencyId, userId, category);
    res.json({ ok: true, ...payload });
  } catch (e) {
    if (e?.status === 400) {
      return res.status(400).json({ error: { message: e.message } });
    }
    next(e);
  }
};

export const getAgencyPracticeCategoryDefaults = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!canManageCatalog(req.user?.role) && !MANAGE_ROLES.has(String(req.user?.role || '').toLowerCase())) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const payload = await getPracticeCategoryDefaultsForAgency(agencyId);
    res.json({ ok: true, ...payload });
  } catch (e) {
    next(e);
  }
};

export const putAgencyPracticeCategoryDefaults = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!canManageCatalog(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can edit practice category defaults' } });
    }
    const defaults = Array.isArray(req.body?.defaults) ? req.body.defaults : [];
    const seedMissing = String(req.body?.seedMissing || '') === 'true' || req.body?.seedMissing === true;
    const payload = await setPracticeCategoryDefaultsForAgency(agencyId, defaults, { seedMissing });
    res.json({ ok: true, ...payload });
  } catch (e) {
    if (e?.status === 400) {
      return res.status(400).json({ error: { message: e.message } });
    }
    next(e);
  }
};

export const postBulkAssignPracticeCategory = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    const category = String(req.params.category || '').trim();
    const audienceKey = String(req.body?.audienceKey || req.body?.group || '').trim();
    if (!agencyId || !category || !audienceKey) {
      return res.status(400).json({ error: { message: 'agencyId, category, and audienceKey are required' } });
    }
    if (!canManageCatalog(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can bulk-assign practice categories' } });
    }
    const payload = await bulkAssignPracticeCategory(agencyId, category, audienceKey);
    res.json({ ok: true, ...payload });
  } catch (e) {
    if (e?.status === 400) {
      return res.status(400).json({ error: { message: e.message } });
    }
    next(e);
  }
};

export const postEnsurePracticeCategoryDefaults = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId || 0);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!canManageCatalog(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const payload = await ensureDefaultsForEnabledBusinessTypes(agencyId);
    res.json({ ok: true, ...(payload || {}) });
  } catch (e) {
    next(e);
  }
};

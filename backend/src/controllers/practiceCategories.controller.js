import User from '../models/User.model.js';
import {
  getPracticeCategoriesForUserAgency,
  setPracticeCategoriesForUserAgency
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

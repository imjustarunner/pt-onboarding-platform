import NoteAidAgencyCatalog from '../models/NoteAidAgencyCatalog.model.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';

function parseIntValue(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const listNoteAidAgencyCatalog = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId || req.params.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const data = await NoteAidAgencyCatalog.listEnabledCatalogIdsForUser(agencyId, req.user.id);
    return res.json({ ok: true, ...data });
  } catch (e) {
    next(e);
  }
};

export const adminListNoteAidAgencyCatalog = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const data = await NoteAidAgencyCatalog.adminBundle(agencyId);
    return res.json({ ok: true, ...data });
  } catch (e) {
    next(e);
  }
};

export const upsertNoteAidAgencySetting = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const catalogAidId = String(req.body.catalogAidId || '').trim();
    if (!agencyId || !catalogAidId) {
      return res.status(400).json({ error: { message: 'agencyId and catalogAidId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const row = await NoteAidAgencyCatalog.upsertSetting(agencyId, catalogAidId, {
      enabled: req.body.enabled,
      titleOverride: req.body.titleOverride,
      attachableToSession: req.body.attachableToSession,
      attachableToClaim: req.body.attachableToClaim,
      sortOrder: req.body.sortOrder
    });
    return res.json({ ok: true, setting: row });
  } catch (e) {
    next(e);
  }
};

export const createNoteAidCustomAid = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const row = await NoteAidAgencyCatalog.createCustomAid(agencyId, req.body, req.user.id);
    return res.status(201).json({ ok: true, aid: row });
  } catch (e) {
    next(e);
  }
};

export const updateNoteAidCustomAid = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const id = parseIntValue(req.params.id);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'agencyId and id are required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const row = await NoteAidAgencyCatalog.updateCustomAid(id, agencyId, req.body);
    if (!row) return res.status(404).json({ error: { message: 'Custom aid not found' } });
    return res.json({ ok: true, aid: row });
  } catch (e) {
    next(e);
  }
};

export const listNoteAidCatalogAgencyUsers = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const pool = (await import('../config/database.js')).default;
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.role, u.credentials
       FROM users u
       JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ?
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [agencyId]
    );
    return res.json({ ok: true, users: rows || [] });
  } catch (e) {
    next(e);
  }
};

export const listNoteAidAssignments = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const rows = await NoteAidAgencyCatalog.listAssignments(agencyId, {
      catalogAidId: req.query.catalogAidId || null,
      customAidId: parseIntValue(req.query.customAidId)
    });
    return res.json({ ok: true, assignments: rows });
  } catch (e) {
    next(e);
  }
};

export const setNoteAidUserAssignment = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const userId = parseIntValue(req.body.userId);
    if (!agencyId || !userId) {
      return res.status(400).json({ error: { message: 'agencyId and userId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const role = String(req.user?.role || '').toLowerCase();
    if (!['admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    await NoteAidAgencyCatalog.setUserAssignment({
      agencyId,
      userId,
      catalogAidId: req.body.catalogAidId || null,
      customAidId: parseIntValue(req.body.customAidId),
      isEnabled: req.body.isEnabled !== false
    });
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

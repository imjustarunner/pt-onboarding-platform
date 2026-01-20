import pool from '../config/database.js';
import { validationResult } from 'express-validator';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import Agency from '../models/Agency.model.js';

const parseAgencyId = (req) => {
  const raw = req.params.agencyId || req.query.agencyId || req.body.agencyId || req.user?.agencyId;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const isSchoolLinkedToAgency = async (schoolOrganizationId, agencyId) => {
  const activeAgencyId =
    (await OrganizationAffiliation.getActiveAgencyIdForOrganization(schoolOrganizationId)) ||
    (await AgencySchool.getActiveAgencyIdForSchool(schoolOrganizationId));
  return activeAgencyId ? parseInt(activeAgencyId, 10) === parseInt(agencyId, 10) : false;
};

export const listPaperworkDeliveryMethods = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const schoolId = parseInt(req.params.schoolId, 10);
    if (!schoolId) return res.status(400).json({ error: { message: 'schoolId is required' } });

    const linked = await isSchoolLinkedToAgency(schoolId, agencyId);
    if (!linked && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'School is not linked to this agency' } });
    }

    const [rows] = await pool.execute(
      `SELECT * FROM paperwork_delivery_methods WHERE school_organization_id = ? ORDER BY is_active DESC, label ASC`,
      [schoolId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const upsertPaperworkDeliveryMethod = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });

    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const schoolId = parseInt(req.params.schoolId, 10);
    if (!schoolId) return res.status(400).json({ error: { message: 'schoolId is required' } });

    const linked = await isSchoolLinkedToAgency(schoolId, agencyId);
    if (!linked && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'School is not linked to this agency' } });
    }

    const { id, methodKey, label, isActive } = req.body;
    const is_active = isActive === undefined ? true : (isActive === true || isActive === 'true');

    if (id) {
      await pool.execute(
        `UPDATE paperwork_delivery_methods SET method_key = ?, label = ?, is_active = ? WHERE id = ? AND school_organization_id = ?`,
        [String(methodKey).trim(), String(label).trim(), is_active, parseInt(id, 10), schoolId]
      );
      const [rows] = await pool.execute(`SELECT * FROM paperwork_delivery_methods WHERE id = ?`, [parseInt(id, 10)]);
      return res.json(rows[0] || null);
    }

    await pool.execute(
      `INSERT INTO paperwork_delivery_methods (school_organization_id, method_key, label, is_active)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), is_active = VALUES(is_active)`,
      [schoolId, String(methodKey).trim(), String(label).trim(), is_active]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM paperwork_delivery_methods WHERE school_organization_id = ? AND method_key = ? LIMIT 1`,
      [schoolId, String(methodKey).trim()]
    );
    res.status(201).json(rows[0] || null);
  } catch (e) {
    next(e);
  }
};

const safeJsonObject = (v) => {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try {
    const parsed = JSON.parse(String(v));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeCategoryKey = (s) => {
  const raw = String(s || '').trim().toLowerCase();
  if (!raw) return null;
  const k = raw
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return k || null;
};

export const getSchoolCommentCategories = async (req, res, next) => {
  try {
    const schoolId = parseInt(req.params.schoolId, 10);
    if (!schoolId) return res.status(400).json({ error: { message: 'schoolId is required' } });

    const org = await Agency.findById(schoolId);
    if (!org) return res.status(404).json({ error: { message: 'School not found' } });

    // Any user who can access this school org can read categories (school_staff included).
    // We keep it simple: if a non-super admin doesn't belong to the org, block.
    if (req.user?.role !== 'super_admin') {
      const User = (await import('../models/User.model.js')).default;
      const orgs = await User.getAgencies(req.user.id);
      const ok = (orgs || []).some((o) => parseInt(o.id, 10) === schoolId);
      if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const custom = safeJsonObject(org.custom_parameters);
    const list = Array.isArray(custom?.school_note_categories) ? custom.school_note_categories : null;

    const defaults = [
      { key: 'general', label: 'General' },
      { key: 'behavior', label: 'Behavior' },
      { key: 'logistics', label: 'Logistics' },
      { key: 'medical', label: 'Medical' }
    ];

    if (!list) return res.json({ categories: defaults });

    const out = [];
    for (const item of list) {
      if (typeof item === 'string') {
        const key = normalizeCategoryKey(item);
        if (key) out.push({ key, label: String(item).trim() });
      } else if (item && typeof item === 'object') {
        const key = normalizeCategoryKey(item.key || item.value || item.label);
        const label = String(item.label || item.value || item.key || '').trim();
        if (key && label) out.push({ key, label });
      }
    }

    res.json({ categories: out.length ? out : defaults });
  } catch (e) {
    next(e);
  }
};

export const setSchoolCommentCategories = async (req, res, next) => {
  try {
    // Admin/support scope: keep it behind requireAgencyAdmin at route level.
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const schoolId = parseInt(req.params.schoolId, 10);
    if (!schoolId) return res.status(400).json({ error: { message: 'schoolId is required' } });

    const linked = await isSchoolLinkedToAgency(schoolId, agencyId);
    if (!linked && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'School is not linked to this agency' } });
    }

    const categories = Array.isArray(req.body?.categories) ? req.body.categories : [];
    const out = [];
    for (const item of categories) {
      const label = typeof item === 'string' ? item : (item?.label || item?.value || item?.key);
      const key = normalizeCategoryKey(typeof item === 'string' ? item : (item?.key || item?.value || item?.label));
      const labelTrim = String(label || '').trim();
      if (!key || !labelTrim) continue;
      out.push({ key, label: labelTrim });
    }

    const org = await Agency.findById(schoolId);
    if (!org) return res.status(404).json({ error: { message: 'School not found' } });

    const custom = safeJsonObject(org.custom_parameters);
    custom.school_note_categories = out;

    await pool.execute(
      `UPDATE agencies SET custom_parameters = ? WHERE id = ?`,
      [JSON.stringify(custom), schoolId]
    );

    res.json({ categories: out });
  } catch (e) {
    next(e);
  }
};


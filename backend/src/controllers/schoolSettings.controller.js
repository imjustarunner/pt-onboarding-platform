import pool from '../config/database.js';
import { validationResult } from 'express-validator';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';

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


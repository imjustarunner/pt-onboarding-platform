import pool from '../config/database.js';
import { validationResult } from 'express-validator';

const parseAgencyId = (req) => {
  const raw = req.params.agencyId || req.query.agencyId || req.body.agencyId || req.user?.agencyId;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
};

export const listClientStatuses = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const [rows] = await pool.execute(
      `SELECT * FROM client_statuses WHERE agency_id = ? ORDER BY is_active DESC, label ASC`,
      [agencyId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const upsertClientStatus = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });

    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const { id, statusKey, label, description, isActive } = req.body;
    const is_active = isActive === undefined ? true : (isActive === true || isActive === 'true');

    if (id) {
      await pool.execute(
        `UPDATE client_statuses SET status_key = ?, label = ?, description = ?, is_active = ? WHERE id = ? AND agency_id = ?`,
        [String(statusKey).trim(), String(label).trim(), description ? String(description) : null, is_active, parseInt(id, 10), agencyId]
      );
      const [rows] = await pool.execute(`SELECT * FROM client_statuses WHERE id = ?`, [parseInt(id, 10)]);
      return res.json(rows[0] || null);
    }

    await pool.execute(
      `INSERT INTO client_statuses (agency_id, status_key, label, description, is_active)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = VALUES(is_active)`,
      [agencyId, String(statusKey).trim(), String(label).trim(), description ? String(description) : null, is_active]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM client_statuses WHERE agency_id = ? AND status_key = ? LIMIT 1`,
      [agencyId, String(statusKey).trim()]
    );
    res.status(201).json(rows[0] || null);
  } catch (e) {
    next(e);
  }
};

export const listPaperworkStatuses = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const [rows] = await pool.execute(
      `SELECT * FROM paperwork_statuses WHERE agency_id = ? ORDER BY is_active DESC, label ASC`,
      [agencyId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const upsertPaperworkStatus = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });

    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const { id, statusKey, label, description, isActive } = req.body;
    const is_active = isActive === undefined ? true : (isActive === true || isActive === 'true');

    if (id) {
      await pool.execute(
        `UPDATE paperwork_statuses SET status_key = ?, label = ?, description = ?, is_active = ? WHERE id = ? AND agency_id = ?`,
        [String(statusKey).trim(), String(label).trim(), description ? String(description) : null, is_active, parseInt(id, 10), agencyId]
      );
      const [rows] = await pool.execute(`SELECT * FROM paperwork_statuses WHERE id = ?`, [parseInt(id, 10)]);
      return res.json(rows[0] || null);
    }

    await pool.execute(
      `INSERT INTO paperwork_statuses (agency_id, status_key, label, description, is_active)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), is_active = VALUES(is_active)`,
      [agencyId, String(statusKey).trim(), String(label).trim(), description ? String(description) : null, is_active]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM paperwork_statuses WHERE agency_id = ? AND status_key = ? LIMIT 1`,
      [agencyId, String(statusKey).trim()]
    );
    res.status(201).json(rows[0] || null);
  } catch (e) {
    next(e);
  }
};

export const listInsuranceTypes = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const [rows] = await pool.execute(
      `SELECT * FROM insurance_types WHERE agency_id = ? ORDER BY is_active DESC, label ASC`,
      [agencyId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const upsertInsuranceType = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });

    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const { id, insuranceKey, label, isActive } = req.body;
    const is_active = isActive === undefined ? true : (isActive === true || isActive === 'true');

    if (id) {
      await pool.execute(
        `UPDATE insurance_types SET insurance_key = ?, label = ?, is_active = ? WHERE id = ? AND agency_id = ?`,
        [String(insuranceKey).trim(), String(label).trim(), is_active, parseInt(id, 10), agencyId]
      );
      const [rows] = await pool.execute(`SELECT * FROM insurance_types WHERE id = ?`, [parseInt(id, 10)]);
      return res.json(rows[0] || null);
    }

    await pool.execute(
      `INSERT INTO insurance_types (agency_id, insurance_key, label, is_active)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), is_active = VALUES(is_active)`,
      [agencyId, String(insuranceKey).trim(), String(label).trim(), is_active]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM insurance_types WHERE agency_id = ? AND insurance_key = ? LIMIT 1`,
      [agencyId, String(insuranceKey).trim()]
    );
    res.status(201).json(rows[0] || null);
  } catch (e) {
    next(e);
  }
};

const isBackofficeRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'super_admin' || r === 'admin' || r === 'staff' || r === 'support';
};

const normalizeLanguageKey = (label) => {
  const raw = String(label || '').trim().toLowerCase();
  // Collapse internal whitespace and strip some punctuation for stable keys.
  return raw.replace(/\s+/g, ' ').replace(/[().,]/g, '').trim();
};

export const listLanguageOptions = async (req, res, next) => {
  try {
    if (!isBackofficeRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const [rows] = await pool.execute(
      `SELECT id, label, label_key, is_active, created_at
       FROM language_options
       WHERE is_active = TRUE
       ORDER BY label ASC
       LIMIT 500`
    );
    res.json(rows || []);
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
    if (missing) return res.json([]);
    next(e);
  }
};

export const createLanguageOption = async (req, res, next) => {
  try {
    if (!isBackofficeRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const label = String(req.body?.label || '').trim();
    if (!label) return res.status(400).json({ error: { message: 'label is required' } });
    if (label.length > 128) return res.status(400).json({ error: { message: 'label is too long (max 128)' } });
    const key = normalizeLanguageKey(label);
    if (!key) return res.status(400).json({ error: { message: 'Invalid label' } });

    const userId = req.user?.id ? parseInt(req.user.id, 10) : null;
    await pool.execute(
      `INSERT INTO language_options (label, label_key, is_active, created_by_user_id)
       VALUES (?, ?, TRUE, ?)
       ON DUPLICATE KEY UPDATE is_active = TRUE, label = VALUES(label)`,
      [label, key, userId]
    );
    const [rows] = await pool.execute(
      `SELECT id, label, label_key, is_active, created_at
       FROM language_options
       WHERE label_key = ?
       LIMIT 1`,
      [key]
    );
    res.status(201).json(rows?.[0] || null);
  } catch (e) {
    next(e);
  }
};


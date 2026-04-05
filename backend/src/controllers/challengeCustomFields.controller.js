/**
 * Custom Field Definitions & Values for Summit Stats Challenge clubs.
 *
 * Club managers define custom profile fields (e.g. "reach_inches", "bench_press_max_lbs").
 * Members fill in their values. These values can be used as criteria in custom recognition categories.
 *
 * Endpoints:
 *   GET    /summit-stats/clubs/:id/custom-fields              — list field definitions for club
 *   POST   /summit-stats/clubs/:id/custom-fields              — create a field definition
 *   PUT    /summit-stats/clubs/:id/custom-fields/:fieldId     — update a field definition
 *   DELETE /summit-stats/clubs/:id/custom-fields/:fieldId     — soft-delete (set is_active = false)
 *   GET    /summit-stats/clubs/:id/seasons/:classId/participants/:userId/custom-values
 *   PUT    /summit-stats/clubs/:id/seasons/:classId/participants/:userId/custom-values/:fieldId
 */
import pool from '../config/database.js';
import { canUserManageClub } from '../utils/sscClubAccess.js';

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

// ── Field Definitions ─────────────────────────────────────────────

export const listCustomFields = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club ID' } });

    const [rows] = await pool.execute(
      `SELECT id, agency_id, name, label, field_type, unit_label, is_active, sort_order, created_at, updated_at
       FROM challenge_custom_field_definitions
       WHERE agency_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
      [clubId]
    );
    return res.json({ fields: rows });
  } catch (e) {
    next(e);
  }
};

export const createCustomField = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    if (!clubId) return res.status(400).json({ error: { message: 'Invalid club ID' } });
    if (!(await canUserManageClub({ user: req.user, clubId }))) return res.status(403).json({ error: { message: 'Club manager access required' } });

    const name = String(req.body.name || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const label = String(req.body.label || '').trim();
    const fieldType = ['number', 'text', 'date'].includes(req.body.fieldType) ? req.body.fieldType : 'number';
    const unitLabel = String(req.body.unitLabel || '').trim() || null;
    const sortOrder = toInt(req.body.sortOrder) ?? 0;

    if (!name) return res.status(400).json({ error: { message: '"name" is required (will be snake_cased)' } });
    if (!label) return res.status(400).json({ error: { message: '"label" is required' } });

    const [existing] = await pool.execute(
      `SELECT id FROM challenge_custom_field_definitions WHERE agency_id = ? AND name = ? LIMIT 1`,
      [clubId, name]
    );
    if (existing.length > 0) return res.status(409).json({ error: { message: `A field named "${name}" already exists for this club` } });

    const [result] = await pool.execute(
      `INSERT INTO challenge_custom_field_definitions (agency_id, name, label, field_type, unit_label, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [clubId, name, label, fieldType, unitLabel, sortOrder]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM challenge_custom_field_definitions WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    return res.status(201).json({ field: rows[0] });
  } catch (e) {
    next(e);
  }
};

export const updateCustomField = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const fieldId = toInt(req.params.fieldId);
    if (!clubId || !fieldId) return res.status(400).json({ error: { message: 'Invalid ID' } });
    if (!(await canUserManageClub({ user: req.user, clubId }))) return res.status(403).json({ error: { message: 'Club manager access required' } });

    const [existing] = await pool.execute(
      `SELECT id FROM challenge_custom_field_definitions WHERE id = ? AND agency_id = ? LIMIT 1`,
      [fieldId, clubId]
    );
    if (!existing.length) return res.status(404).json({ error: { message: 'Field not found' } });

    const setParts = [];
    const params = [];

    if (req.body.label !== undefined) { setParts.push('label = ?'); params.push(String(req.body.label || '').trim()); }
    if (req.body.unitLabel !== undefined) { setParts.push('unit_label = ?'); params.push(String(req.body.unitLabel || '').trim() || null); }
    if (req.body.sortOrder !== undefined) { setParts.push('sort_order = ?'); params.push(toInt(req.body.sortOrder) ?? 0); }
    if (req.body.isActive !== undefined) { setParts.push('is_active = ?'); params.push(req.body.isActive ? 1 : 0); }

    if (!setParts.length) return res.status(400).json({ error: { message: 'No updateable fields provided' } });
    setParts.push('updated_at = CURRENT_TIMESTAMP');
    params.push(fieldId, clubId);

    await pool.execute(
      `UPDATE challenge_custom_field_definitions SET ${setParts.join(', ')} WHERE id = ? AND agency_id = ?`,
      params
    );
    const [rows] = await pool.execute(`SELECT * FROM challenge_custom_field_definitions WHERE id = ? LIMIT 1`, [fieldId]);
    return res.json({ field: rows[0] });
  } catch (e) {
    next(e);
  }
};

export const deleteCustomField = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const fieldId = toInt(req.params.fieldId);
    if (!clubId || !fieldId) return res.status(400).json({ error: { message: 'Invalid ID' } });
    if (!(await canUserManageClub({ user: req.user, clubId }))) return res.status(403).json({ error: { message: 'Club manager access required' } });

    await pool.execute(
      `UPDATE challenge_custom_field_definitions SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND agency_id = ?`,
      [fieldId, clubId]
    );
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

// ── Participant Custom Values ──────────────────────────────────────

export const getParticipantCustomValues = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const classId = toInt(req.params.classId);
    const userId = toInt(req.params.userId);
    if (!clubId || !userId) return res.status(400).json({ error: { message: 'Invalid ID' } });

    const isOwner = Number(req.user?.id) === userId;
    if (!isOwner && !(await canUserManageClub({ user: req.user, clubId }))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const [rows] = await pool.execute(
      `SELECT cfv.id, cfv.field_definition_id, cfd.name, cfd.label, cfd.field_type, cfd.unit_label,
              cfv.value_text, cfv.value_number, cfv.value_date, cfv.updated_at
       FROM challenge_custom_field_values cfv
       INNER JOIN challenge_custom_field_definitions cfd ON cfd.id = cfv.field_definition_id
       WHERE cfv.agency_id = ? AND cfv.user_id = ?
         AND (cfv.learning_class_id = ? OR cfv.learning_class_id IS NULL)
         AND cfd.is_active = 1
       ORDER BY cfd.sort_order ASC, cfd.created_at ASC`,
      [clubId, userId, classId || null]
    );
    return res.json({ values: rows });
  } catch (e) {
    next(e);
  }
};

export const upsertParticipantCustomValue = async (req, res, next) => {
  try {
    const clubId = toInt(req.params.id);
    const classId = toInt(req.params.classId);
    const userId = toInt(req.params.userId);
    const fieldId = toInt(req.params.fieldId);
    if (!clubId || !userId || !fieldId) return res.status(400).json({ error: { message: 'Invalid ID' } });

    const isOwner = Number(req.user?.id) === userId;
    if (!isOwner && !(await canUserManageClub({ user: req.user, clubId }))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const [fieldRows] = await pool.execute(
      `SELECT id, field_type FROM challenge_custom_field_definitions WHERE id = ? AND agency_id = ? AND is_active = 1 LIMIT 1`,
      [fieldId, clubId]
    );
    if (!fieldRows.length) return res.status(404).json({ error: { message: 'Custom field not found' } });
    const field = fieldRows[0];

    let valueText = null, valueNumber = null, valueDate = null;
    if (field.field_type === 'number') {
      const n = Number.parseFloat(req.body.value);
      if (!Number.isFinite(n)) return res.status(400).json({ error: { message: 'Expected a numeric value' } });
      valueNumber = n;
    } else if (field.field_type === 'date') {
      const d = new Date(req.body.value);
      if (!Number.isFinite(d.getTime())) return res.status(400).json({ error: { message: 'Expected a date value' } });
      valueDate = d.toISOString().slice(0, 10);
    } else {
      valueText = String(req.body.value || '').trim() || null;
    }

    await pool.execute(
      `INSERT INTO challenge_custom_field_values
         (agency_id, learning_class_id, user_id, field_definition_id, value_text, value_number, value_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE value_text = VALUES(value_text), value_number = VALUES(value_number), value_date = VALUES(value_date), updated_at = CURRENT_TIMESTAMP`,
      [clubId, classId || null, userId, fieldId, valueText, valueNumber, valueDate]
    );
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

import pool from '../config/database.js';
import { isBudgetManagementEnabled } from './budget.controller.js';

function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function listDepartments(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) {
      return res.status(403).json({ error: { message: 'Budget Management is not enabled for this agency' } });
    }
    const [rows] = await pool.execute(
      `SELECT id, agency_id, name, slug, display_order, settings_json, is_active, created_at, updated_at
       FROM agency_departments
       WHERE agency_id = ?
       ORDER BY display_order ASC, name ASC`,
      [agencyId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error('[agencyDepartments.controller] listDepartments:', err);
    res.status(500).json({ error: { message: 'Failed to list departments' } });
  }
}

export async function createDepartment(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) {
      return res.status(403).json({ error: { message: 'Budget Management is not enabled for this agency' } });
    }
    const { name, displayOrder = 0, settings } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: { message: 'Name is required' } });
    }
    const slug = slugify(name);
    if (!slug) {
      return res.status(400).json({ error: { message: 'Name must contain at least one alphanumeric character' } });
    }
    const [result] = await pool.execute(
      `INSERT INTO agency_departments (agency_id, name, slug, display_order, settings_json, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [agencyId, String(name).trim(), slug, Number(displayOrder) || 0, settings ? JSON.stringify(settings) : null]
    );
    const [rows] = await pool.execute(
      'SELECT id, agency_id, name, slug, display_order, settings_json, is_active, created_at, updated_at FROM agency_departments WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0] || {});
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: { message: 'A department with this name already exists' } });
    }
    console.error('[agencyDepartments.controller] createDepartment:', err);
    res.status(500).json({ error: { message: 'Failed to create department' } });
  }
}

export async function updateDepartment(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const departmentId = parseInt(req.params.id, 10);
    if (!agencyId || !departmentId) {
      return res.status(400).json({ error: { message: 'Invalid agencyId or department id' } });
    }
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) {
      return res.status(403).json({ error: { message: 'Budget Management is not enabled for this agency' } });
    }
    const { name, displayOrder, settings, isActive } = req.body || {};
    const updates = [];
    const values = [];
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        return res.status(400).json({ error: { message: 'Name cannot be empty' } });
      }
      updates.push('name = ?', 'slug = ?');
      values.push(trimmed, slugify(name));
    }
    if (displayOrder !== undefined) {
      updates.push('display_order = ?');
      values.push(Number(displayOrder) || 0);
    }
    if (settings !== undefined) {
      updates.push('settings_json = ?');
      values.push(settings ? JSON.stringify(settings) : null);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(isActive ? 1 : 0);
    }
    if (updates.length === 0) {
      const [rows] = await pool.execute(
        'SELECT id, agency_id, name, slug, display_order, settings_json, is_active, created_at, updated_at FROM agency_departments WHERE id = ? AND agency_id = ?',
        [departmentId, agencyId]
      );
      return res.json(rows[0] || {});
    }
    values.push(departmentId, agencyId);
    await pool.execute(
      `UPDATE agency_departments SET ${updates.join(', ')} WHERE id = ? AND agency_id = ?`,
      values
    );
    const [rows] = await pool.execute(
      'SELECT id, agency_id, name, slug, display_order, settings_json, is_active, created_at, updated_at FROM agency_departments WHERE id = ? AND agency_id = ?',
      [departmentId, agencyId]
    );
    res.json(rows[0] || {});
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: { message: 'A department with this name already exists' } });
    }
    console.error('[agencyDepartments.controller] updateDepartment:', err);
    res.status(500).json({ error: { message: 'Failed to update department' } });
  }
}

export async function deleteDepartment(req, res) {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const departmentId = parseInt(req.params.id, 10);
    if (!agencyId || !departmentId) {
      return res.status(400).json({ error: { message: 'Invalid agencyId or department id' } });
    }
    const enabled = await isBudgetManagementEnabled(agencyId);
    if (!enabled) {
      return res.status(403).json({ error: { message: 'Budget Management is not enabled for this agency' } });
    }
    const [result] = await pool.execute(
      'DELETE FROM agency_departments WHERE id = ? AND agency_id = ?',
      [departmentId, agencyId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: { message: 'Department not found' } });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[agencyDepartments.controller] deleteDepartment:', err);
    res.status(500).json({ error: { message: 'Failed to delete department' } });
  }
}

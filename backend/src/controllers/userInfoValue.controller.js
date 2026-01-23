import UserInfoValue from '../models/UserInfoValue.model.js';
import { validationResult } from 'express-validator';
import Task from '../models/Task.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import pool from '../config/database.js';

export const getUserInfo = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { agencyId } = req.query;
    const assignedOrHasValueOnly = String(req.query.assignedOrHasValueOnly || '').toLowerCase() === 'true';
    
    // Users can view their own info, admins can view any
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const summary = await UserInfoValue.getUserInfoSummary(
      parseInt(userId),
      agencyId ? parseInt(agencyId) : null
    );

    if (!assignedOrHasValueOnly) {
      return res.json(summary);
    }

    // Concise mode: only show fields that are either:
    // - referenced by an assigned training module with a form page, OR
    // - already have a saved value (imported/entered)
    //
    // IMPORTANT: filter by canonical `field_key` (not `field_definition_id`) because:
    // - field definitions can be duplicated across agencies/platform templates
    // - module form pages store definition IDs that may not match the "best" definition chosen for display
    const assignedFieldKeys = new Set();
    try {
      const tasks = await Task.findByUser(parseInt(userId), { taskType: 'training' });
      const moduleIds = Array.from(
        new Set((tasks || []).map((t) => Number(t.reference_id)).filter((n) => Number.isInteger(n) && n > 0))
      );

      const assignedIds = new Set();
      for (const moduleId of moduleIds) {
        const pages = await ModuleContent.findByModuleId(moduleId);
        for (const p of (pages || []).filter((x) => x.content_type === 'form')) {
          let data = p.content_data;
          if (typeof data === 'string') {
            try {
              data = JSON.parse(data);
            } catch {
              data = {};
            }
          }
          const ids = Array.isArray(data?.fieldDefinitionIds) ? data.fieldDefinitionIds : [];
          for (const id of ids) {
            const n = Number(id);
            if (Number.isInteger(n) && n > 0) assignedIds.add(n);
          }
        }
      }

      if (assignedIds.size) {
        const idsArr = Array.from(assignedIds);
        const placeholders = idsArr.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT id, field_key
           FROM user_info_field_definitions
           WHERE id IN (${placeholders})`,
          idsArr
        );
        for (const r of rows || []) {
          const k = String(r?.field_key || '').trim();
          if (k) assignedFieldKeys.add(k);
        }
      }
    } catch {
      // If we can’t compute assignments, still fall back to "hasValue".
    }

    const filtered = (summary || []).filter((f) => {
      if (f?.hasValue) return true;
      const k = String(f?.field_key || '').trim();
      if (!k) return false;
      return assignedFieldKeys.has(k);
    });

    res.json(filtered);
  } catch (error) {
    next(error);
  }
};

export const updateUserInfo = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    
    const { userId } = req.params;
    const { values } = req.body; // Array of { fieldDefinitionId, value }
    
    // Users can update their own info, admins can update any
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    if (!Array.isArray(values)) {
      return res.status(400).json({ error: { message: 'Values must be an array' } });
    }
    
    // Enforce some profile fields as staff-managed (view-only) for self-service users.
    let effectiveValues = values;
    const isSelf = parseInt(userId) === req.user.id;
    const SELF_READONLY_CATEGORY_KEYS = new Set(['gear_tracking']);
    if (isSelf && Array.isArray(values) && values.length) {
      try {
        const ids = values
          .map((v) => Number(v?.fieldDefinitionId))
          .filter((n) => Number.isInteger(n) && n > 0);
        if (ids.length) {
          const placeholders = ids.map(() => '?').join(',');
          const [defs] = await pool.execute(
            `SELECT id, category_key
             FROM user_info_field_definitions
             WHERE id IN (${placeholders})`,
            ids
          );
          const readonlyIds = new Set(
            (defs || [])
              .filter((d) => d?.category_key && SELF_READONLY_CATEGORY_KEYS.has(String(d.category_key)))
              .map((d) => Number(d.id))
          );
          if (readonlyIds.size) {
            effectiveValues = values.filter((v) => !readonlyIds.has(Number(v?.fieldDefinitionId)));
          }
        }
      } catch {
        // Fail open: do not block the save if the lookup fails.
      }
    }

    const results = await UserInfoValue.bulkUpdate(parseInt(userId), effectiveValues);
    
    res.json({ message: 'User information updated successfully', results });
  } catch (error) {
    next(error);
  }
};

export const updateUserInfoField = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    
    const { userId, fieldId } = req.params;
    const { value } = req.body;
    
    // Users can update their own info, admins can update any
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    // Block self-service edits of staff-managed categories.
    const isSelf = parseInt(userId) === req.user.id;
    const SELF_READONLY_CATEGORY_KEYS = new Set(['gear_tracking']);
    if (isSelf) {
      try {
        const [rows] = await pool.execute(
          'SELECT category_key FROM user_info_field_definitions WHERE id = ? LIMIT 1',
          [parseInt(fieldId)]
        );
        const cat = rows?.[0]?.category_key ? String(rows[0].category_key) : '';
        if (cat && SELF_READONLY_CATEGORY_KEYS.has(cat)) {
          return res.status(403).json({ error: { message: 'This section is managed by staff.' } });
        }
      } catch {
        // ignore
      }
    }

    const result = await UserInfoValue.createOrUpdate(parseInt(userId), parseInt(fieldId), value);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const deleteUserInfoField = async (req, res, next) => {
  try {
    const { userId, fieldId } = req.params;
    
    // Users can delete their own info, admins can delete any
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const deleted = await UserInfoValue.delete(parseInt(userId), parseInt(fieldId));
    if (!deleted) {
      return res.status(404).json({ error: { message: 'User info field not found' } });
    }
    
    res.json({ message: 'User info field deleted successfully' });
  } catch (error) {
    next(error);
  }
};


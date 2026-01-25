import pool from '../config/database.js';
import User from './User.model.js';
import { parseUsAddressLoose } from '../utils/addressParsing.js';
import { formOptionSources } from '../config/formOptionSources.js';

class UserInfoValue {
  static async _getFieldKeyForDefinitionId(fieldDefinitionId) {
    const id = Number(fieldDefinitionId);
    if (!Number.isInteger(id) || id <= 0) return '';
    const [rows] = await pool.execute(
      'SELECT field_key FROM user_info_field_definitions WHERE id = ? LIMIT 1',
      [id]
    );
    return String(rows?.[0]?.field_key || '').trim();
  }

  static async _dedupeByFieldKeyKeepDefinition({ userId, fieldKey, keepFieldDefinitionId }) {
    const uid = Number(userId);
    const keepId = Number(keepFieldDefinitionId);
    const fk = String(fieldKey || '').trim();
    if (!Number.isInteger(uid) || uid <= 0) return;
    if (!fk) return;
    if (!Number.isInteger(keepId) || keepId <= 0) return;

    // Enforce: at most one value per (user_id, field_key).
    // Keep the row for keepFieldDefinitionId, delete any others for the same field_key.
    await pool.execute(
      `DELETE uiv
       FROM user_info_values uiv
       JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
       WHERE uiv.user_id = ?
         AND uifd.field_key = ?
         AND uiv.field_definition_id <> ?`,
      [uid, fk, keepId]
    );
  }

  static async findByUserId(userId, agencyId = null) {
    let query = `
      SELECT 
        uiv.*,
        uifd.field_key,
        uifd.field_label,
        uifd.field_type,
        uifd.options,
        uifd.is_required,
        uifd.is_platform_template,
        uifd.agency_id,
        uifd.order_index
      FROM user_info_values uiv
      JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
      WHERE uiv.user_id = ?
    `;
    const params = [userId];

    if (agencyId !== null) {
      query += ' AND (uifd.agency_id = ? OR uifd.agency_id IS NULL)';
      params.push(agencyId);
    }

    query += ' ORDER BY uifd.is_platform_template DESC, uifd.agency_id IS NULL DESC, uifd.order_index ASC';
    
    const [rows] = await pool.execute(query, params);
    
    const parseOptions = (raw) => {
      if (!raw) return null;
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'object') return raw;
      const s = String(raw || '').trim();
      if (!s) return null;
      // JSON encoded options (preferred)
      if (s.startsWith('[') || s.startsWith('{')) {
        try {
          return JSON.parse(s);
        } catch {
          return null;
        }
      }
      // Legacy: sometimes options were stored as a simple comma/newline separated string.
      const parts = s.split(/[,;\n]/).map((x) => String(x || '').trim()).filter(Boolean);
      return parts.length ? parts : null;
    };

    // Parse options safely (never throw on bad legacy data)
    return rows.map(row => ({
      ...row,
      options: parseOptions(row.options)
    }));
  }

  static async findByUserAndField(userId, fieldDefinitionId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_info_values WHERE user_id = ? AND field_definition_id = ?',
      [userId, fieldDefinitionId]
    );
    return rows[0] || null;
  }

  static async findByUserAndFieldIds(userId, fieldDefinitionIds) {
    if (!fieldDefinitionIds || fieldDefinitionIds.length === 0) return [];
    const placeholders = fieldDefinitionIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT * FROM user_info_values WHERE user_id = ? AND field_definition_id IN (${placeholders})`,
      [userId, ...fieldDefinitionIds]
    );
    return rows;
  }

  static async createOrUpdate(userId, fieldDefinitionId, value) {
    const fk = await this._getFieldKeyForDefinitionId(fieldDefinitionId);

    // Check if value exists
    const existing = await this.findByUserAndField(userId, fieldDefinitionId);
    
    if (existing) {
      // Update
      await pool.execute(
        'UPDATE user_info_values SET value = ? WHERE user_id = ? AND field_definition_id = ?',
        [value, userId, fieldDefinitionId]
      );
      // Ensure we don't retain duplicate values for the same logical field_key.
      await this._dedupeByFieldKeyKeepDefinition({ userId, fieldKey: fk, keepFieldDefinitionId: fieldDefinitionId });
      return this.findByUserAndField(userId, fieldDefinitionId);
    } else {
      // Create
      const [result] = await pool.execute(
        'INSERT INTO user_info_values (user_id, field_definition_id, value) VALUES (?, ?, ?)',
        [userId, fieldDefinitionId, value]
      );
      
      // Ensure we don't retain duplicate values for the same logical field_key.
      await this._dedupeByFieldKeyKeepDefinition({ userId, fieldKey: fk, keepFieldDefinitionId: fieldDefinitionId });

      const [rows] = await pool.execute(
        'SELECT * FROM user_info_values WHERE id = ?',
        [result.insertId]
      );
      return rows[0];
    }
  }

  static async delete(userId, fieldDefinitionId) {
    const [result] = await pool.execute(
      'DELETE FROM user_info_values WHERE user_id = ? AND field_definition_id = ?',
      [userId, fieldDefinitionId]
    );
    return result.affectedRows > 0;
  }

  static async getUserInfoSummary(userId, agencyId = null) {
    // Get all field definitions for user's agencies
    const User = (await import('./User.model.js')).default;
    const UserInfoFieldDefinition = (await import('./UserInfoFieldDefinition.model.js')).default;
    
    let fieldDefinitions = [];
    
    if (agencyId) {
      const agencyFields = await UserInfoFieldDefinition.findByAgency(agencyId);
      fieldDefinitions = agencyFields.allFields;
    } else {
      // Get all agencies user belongs to
      const userAgencies = await User.getAgencies(userId);
      
      // Get platform templates
      const platformTemplates = await UserInfoFieldDefinition.findPlatformTemplates();
      fieldDefinitions = [...platformTemplates];
      
      // Get agency-specific fields for each agency
      for (const agency of userAgencies) {
        const agencyFields = await UserInfoFieldDefinition.findAll({ agencyId: agency.id });
        // Add agency name to each field
        const fieldsWithAgency = agencyFields.map(f => ({
          ...f,
          agency_name: agency.name
        }));
        fieldDefinitions = [...fieldDefinitions, ...fieldsWithAgency];
      }
    }
    
    // Get all values for user (may include multiple field_definition_ids for the same field_key).
    // IMPORTANT: we resolve values by field_key so duplicates never cause "missing" data in the UI.
    const values = await this.findByUserId(userId, agencyId);
    const valueByFieldKey = new Map();
    for (const v of values || []) {
      const k = String(v.field_key || '').trim();
      if (!k) continue;
      // Prefer the latest non-empty value if duplicates exist.
      const incoming = v.value ?? null;
      const existing = valueByFieldKey.get(k);
      if (existing === undefined) {
        valueByFieldKey.set(k, incoming);
      } else {
        const a = String(existing || '').trim();
        const b = String(incoming || '').trim();
        if (!a && b) valueByFieldKey.set(k, incoming);
      }
    }

    // Dedupe field definitions by field_key (prefer platform template, then lowest id).
    const bestDefByKey = new Map();
    for (const f of fieldDefinitions || []) {
      const k = String(f.field_key || '').trim();
      if (!k) continue;
      const cur = bestDefByKey.get(k);
      if (!cur) {
        bestDefByKey.set(k, f);
        continue;
      }
      const curPlat = cur.is_platform_template === 1 || cur.is_platform_template === true;
      const nextPlat = f.is_platform_template === 1 || f.is_platform_template === true;
      const curAgencyNull = cur.agency_id === null || cur.agency_id === undefined;
      const nextAgencyNull = f.agency_id === null || f.agency_id === undefined;
      if (!curPlat && nextPlat) {
        bestDefByKey.set(k, f);
        continue;
      }
      if (curPlat === nextPlat && !curAgencyNull && nextAgencyNull) {
        bestDefByKey.set(k, f);
        continue;
      }
      if (curPlat === nextPlat && curAgencyNull === nextAgencyNull) {
        const curId = Number(cur.id || 0);
        const nextId = Number(f.id || 0);
        if (nextId && (!curId || nextId < curId)) bestDefByKey.set(k, f);
      }
    }

    // Combine best definitions with values and parse options
    return Array.from(bestDefByKey.values()).map(field => {
      const fk = String(field.field_key || '').trim();
      const rawValue = valueByFieldKey.has(fk) ? valueByFieldKey.get(fk) : null;

      const isMeaningful = (val, fieldType) => {
        if (val === null || val === undefined) return false;
        const t = String(fieldType || '').toLowerCase();
        const s = typeof val === 'string' ? val.trim() : val;
        if (typeof s === 'string' && !s) return false;
        if (typeof s === 'string' && (s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined')) return false;
        if (t === 'multi_select' && typeof s === 'string') {
          if (s === '[]') return false;
          try {
            const parsed = JSON.parse(s);
            if (Array.isArray(parsed)) return parsed.length > 0;
          } catch {
            // fall through (treat non-empty string as meaningful)
          }
        }
        // For boolean fields stored as 'true'/'false', both are meaningful.
        return true;
      };

      const fieldWithValue = {
        ...field,
        value: rawValue,
        hasValue: isMeaningful(rawValue, field.field_type)
      };
      
      // Parse JSON options if present
      if (fieldWithValue.options && typeof fieldWithValue.options === 'string') {
        try {
          fieldWithValue.options = JSON.parse(fieldWithValue.options);
        } catch (e) {
          fieldWithValue.options = null;
        }
      }

      // Default options for legacy provider matching keys (so checkboxes render even if the schema
      // was created by older imports that left options NULL).
      if ((!fieldWithValue.options || (Array.isArray(fieldWithValue.options) && fieldWithValue.options.length === 0))) {
        if (fk === 'age_specialty') {
          fieldWithValue.options = formOptionSources?.psych_today_age_specialty || [
            'Toddler (0-5)',
            'Children (6-10)',
            'Preteen (11-13)',
            'Teen (14-18)',
            'Adults (18+)',
            'Seniors (65+)'
          ];
        } else if (fk === 'treatment_prefs_max15') {
          fieldWithValue.options = formOptionSources?.psych_today_modalities_list || null;
        }
      }
      
      return fieldWithValue;
    });
  }

  static async bulkUpdate(userId, values) {
    // values is an array of { fieldDefinitionId, value }
    const results = [];
    const touchedFieldKeys = new Set();
    
    for (const item of values) {
      const fk = await this._getFieldKeyForDefinitionId(item.fieldDefinitionId);
      if (fk) touchedFieldKeys.add(fk);
      const result = await this.createOrUpdate(userId, item.fieldDefinitionId, item.value);
      results.push(result);
    }

    // Final safety pass: if the same field_key was written via multiple definition ids in this batch,
    // keep only the newest updated row for that field_key.
    try {
      const uid = Number(userId);
      const keys = Array.from(touchedFieldKeys);
      if (Number.isInteger(uid) && uid > 0 && keys.length) {
        const placeholders = keys.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT uiv.field_definition_id, uifd.field_key
           FROM user_info_values uiv
           JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
           WHERE uiv.user_id = ?
             AND uifd.field_key IN (${placeholders})
           ORDER BY uifd.field_key ASC, uiv.updated_at DESC, uiv.id DESC`,
          [uid, ...keys]
        );
        const keepDefByKey = new Map();
        for (const r of rows || []) {
          const k = String(r.field_key || '').trim();
          if (!k || keepDefByKey.has(k)) continue;
          keepDefByKey.set(k, Number(r.field_definition_id));
        }
        for (const [k, keepId] of keepDefByKey.entries()) {
          await this._dedupeByFieldKeyKeepDefinition({ userId: uid, fieldKey: k, keepFieldDefinitionId: keepId });
        }
      }
    } catch {
      // ignore (best-effort)
    }

    // Best-effort: also sync certain canonical profile keys into core `users` columns.
    // This keeps existing UI/search features working (mileage uses home_* fields).
    try {
      const ids = (values || [])
        .map((v) => Number(v?.fieldDefinitionId))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        const [defs] = await pool.execute(
          `SELECT id, field_key
           FROM user_info_field_definitions
           WHERE id IN (${placeholders})`,
          ids
        );
        const keyById = new Map((defs || []).map((d) => [Number(d.id), String(d.field_key || '')]));
        const incoming = new Map((values || []).map((v) => [Number(v.fieldDefinitionId), v?.value ?? null]));

        const getValByKey = (k) => {
          for (const [id, key] of keyById.entries()) {
            if (key === k) return incoming.get(id);
          }
          return null;
        };

        const mailing = getValByKey('mailing_address');
        if (mailing) {
          const parsed = parseUsAddressLoose(mailing);
          if (parsed) {
            await User.update(userId, {
              homeStreetAddress: parsed.street || null,
              homeCity: parsed.city || null,
              homeState: parsed.state || null,
              homePostalCode: parsed.postalCode || null
            });
          }
        }

        const cell = getValByKey('cell_number');
        if (cell) {
          await User.update(userId, { personalPhone: User.normalizePhone(cell) });
        }
      }
    } catch {
      // Non-blocking; profile writes should still succeed even if core sync fails.
    }
    
    return results;
  }
}

export default UserInfoValue;


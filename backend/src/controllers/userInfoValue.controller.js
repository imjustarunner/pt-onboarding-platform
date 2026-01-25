import UserInfoValue from '../models/UserInfoValue.model.js';
import { validationResult } from 'express-validator';
import Task from '../models/Task.model.js';
import ModuleContent from '../models/ModuleContent.model.js';
import pool from '../config/database.js';
import ProviderSearchIndex from '../models/ProviderSearchIndex.model.js';

// When credentialing/profile data is stored under legacy/alias keys, we still want all views
// (Provider Info tab + Credentialing grid) to stay consistent. This maps alias keys to the
// canonical provider_* keys and mirrors writes accordingly.
const CREDENTIALING_ALIAS_TO_CANONICAL = new Map([
  ['npi_number', 'provider_identity_npi_number'],
  ['taxonomy_code', 'provider_identity_taxonomy_code'],
  ['license_type_number', 'provider_credential_license_type_number'],
  ['license_type_and_number', 'provider_credential_license_type_number'],
  ['license_issued', 'provider_credential_license_issued_date'],
  ['license_issued_date', 'provider_credential_license_issued_date'],
  ['license_expires', 'provider_credential_license_expiration_date'],
  ['license_expiration_date', 'provider_credential_license_expiration_date'],
  ['medicaid_location_id', 'provider_credential_medicaid_location_id'],
  ['medicaid_revalidation', 'provider_credential_medicaid_revalidation_date'],
  ['medicaid_revalidation_date', 'provider_credential_medicaid_revalidation_date'],
  ['caqh_provider_id', 'provider_credential_caqh_provider_id'],
  ['caqh_id', 'provider_credential_caqh_provider_id']
]);

async function resolveBestFieldDefinitionIdForKey({ fieldKey, agencyId }) {
  const key = String(fieldKey || '').trim();
  if (!key) return null;
  const aid = agencyId ? Number(agencyId) : null;
  const params = [];
  let where = 'field_key = ?';
  params.push(key);
  if (Number.isInteger(aid) && aid > 0) {
    where += ' AND (agency_id = ? OR agency_id IS NULL)';
    params.push(aid);
  }
  const [rows] = await pool.execute(
    `SELECT id
     FROM user_info_field_definitions
     WHERE ${where}
     ORDER BY
       ${Number.isInteger(aid) && aid > 0 ? '(agency_id = ?) DESC,' : ''}
       (is_platform_template = TRUE) DESC,
       (agency_id IS NULL) DESC,
       id ASC
     LIMIT 1`,
    Number.isInteger(aid) && aid > 0 ? [...params, aid] : params
  );
  const id = Number(rows?.[0]?.id || 0);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function mirrorAliasCredentialingWrites({ userId, agencyId, changedKeyValues, allowCleanup }) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return;
  const aid = agencyId ? Number(agencyId) : null;

  for (const [rawKey, rawVal] of changedKeyValues.entries()) {
    const k = String(rawKey || '').trim();
    if (!k) continue;
    const canonical = CREDENTIALING_ALIAS_TO_CANONICAL.get(k);
    if (!canonical) continue;
    const canonicalDefId = await resolveBestFieldDefinitionIdForKey({ fieldKey: canonical, agencyId: aid });
    if (!canonicalDefId) continue;

    await UserInfoValue.createOrUpdate(uid, canonicalDefId, rawVal ?? null);

    if (allowCleanup) {
      // Best-effort: delete the alias value so we don't keep duplicates around.
      try {
        await pool.execute(
          `DELETE uiv
           FROM user_info_values uiv
           JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
           WHERE uiv.user_id = ? AND uifd.field_key = ?`,
          [uid, k]
        );
      } catch {
        // ignore
      }
    }
  }
}

export const getUserInfo = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { agencyId } = req.query;
    const assignedOrHasValueOnly = String(req.query.assignedOrHasValueOnly || '').toLowerCase() === 'true';
    
    // Users can view their own info, admins/support/staff can view any
    if (
      parseInt(userId) !== req.user.id &&
      req.user.role !== 'admin' &&
      req.user.role !== 'super_admin' &&
      req.user.role !== 'support' &&
      req.user.role !== 'staff'
    ) {
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
    
    // Users can update their own info, admins/support/staff can update any
    if (
      parseInt(userId) !== req.user.id &&
      req.user.role !== 'admin' &&
      req.user.role !== 'super_admin' &&
      req.user.role !== 'support' &&
      req.user.role !== 'staff'
    ) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    if (!Array.isArray(values)) {
      return res.status(400).json({ error: { message: 'Values must be an array' } });
    }
    
    // Enforce some profile fields as staff-managed (view-only) for self-service users.
    let effectiveValues = values;
    const isSelf = parseInt(userId) === req.user.id;
    const SELF_READONLY_CATEGORY_KEYS = new Set(['gear_tracking']);
    const SELF_PROVIDER_LOCKED_KEYS = new Set([
      'provider_status',
      'provider_accepts_commercial',
      'provider_accepts_medicaid',
      'provider_accepts_tricare',
      'provider_background_check_date',
      'provider_background_check_status',
      'provider_background_check_notes',
      'provider_cleared_to_start',
      'provider_clinician_notes',
      'provider_credential',
      'provider_display_name',
      'provider_risk_high_behavioral_needs',
      'provider_risk_skills',
      'provider_risk_substance_use',
      'provider_risk_suicidal',
      'provider_risk_trauma'
    ]);
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

    // Also drop any locked field keys for provider self-service edits (do not overwrite staff-managed ITSCO fields).
    const isProviderSelf = isSelf && (req.user.role === 'provider' || req.user.role === 'clinician');
    if (isProviderSelf && Array.isArray(effectiveValues) && effectiveValues.length) {
      try {
        const ids = effectiveValues
          .map((v) => Number(v?.fieldDefinitionId))
          .filter((n) => Number.isInteger(n) && n > 0);
        if (ids.length) {
          const placeholders = ids.map(() => '?').join(',');
          const [defs] = await pool.execute(
            `SELECT id, field_key FROM user_info_field_definitions WHERE id IN (${placeholders})`,
            ids
          );
          const lockedIds = new Set(
            (defs || [])
              .filter((d) => SELF_PROVIDER_LOCKED_KEYS.has(String(d?.field_key || '').trim()))
              .map((d) => Number(d.id))
          );
          if (lockedIds.size) {
            effectiveValues = effectiveValues.filter((v) => !lockedIds.has(Number(v?.fieldDefinitionId)));
          }
        }
      } catch {
        // ignore
      }
    }

    const uid = parseInt(userId);
    const results = await UserInfoValue.bulkUpdate(uid, effectiveValues);

    // Mirror alias credentialing fields into canonical provider_* keys so Provider Info edits
    // appear in the Credentialing grid (and vice-versa), without requiring manual cleanup.
    try {
      const agencyIdRaw = req.body?.agencyId ?? req.query?.agencyId ?? null;
      const agencyId = agencyIdRaw ? parseInt(String(agencyIdRaw), 10) : null;
      const isAdminLike = ['admin', 'super_admin', 'support', 'staff'].includes(String(req.user?.role || '').toLowerCase());

      const ids = (effectiveValues || [])
        .map((v) => Number(v?.fieldDefinitionId))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        const [defs] = await pool.execute(
          `SELECT id, field_key FROM user_info_field_definitions WHERE id IN (${placeholders})`,
          ids
        );
        const keyById = new Map((defs || []).map((d) => [Number(d.id), String(d.field_key || '').trim()]));
        const valueByKey = new Map();
        for (const ev of effectiveValues || []) {
          const k = keyById.get(Number(ev?.fieldDefinitionId));
          if (!k) continue;
          valueByKey.set(k, ev?.value ?? null);
        }
        await mirrorAliasCredentialingWrites({
          userId: uid,
          agencyId,
          changedKeyValues: valueByKey,
          allowCleanup: isAdminLike
        });
      }
    } catch {
      // ignore (best-effort)
    }

    // Keep provider_search_index fresh (best-effort). This enables fast and accurate matching
    // for multi_select fields like age specialties and treatment modalities.
    try {
      const agencyIdRaw = req.body?.agencyId ?? req.query?.agencyId ?? null;
      const agencyId = agencyIdRaw ? parseInt(String(agencyIdRaw), 10) : null;

      // Determine which field_keys were updated so we only reindex what changed.
      let changedKeys = [];
      try {
        const ids = (effectiveValues || [])
          .map((v) => Number(v?.fieldDefinitionId))
          .filter((n) => Number.isInteger(n) && n > 0);
        if (ids.length) {
          const placeholders = ids.map(() => '?').join(',');
          const [defs] = await pool.execute(
            `SELECT field_key FROM user_info_field_definitions WHERE id IN (${placeholders})`,
            ids
          );
          changedKeys = Array.from(new Set((defs || []).map((d) => String(d.field_key || '').trim()).filter(Boolean)));
        }
      } catch {
        changedKeys = [];
      }

      let agencyIds = [];
      if (Number.isInteger(agencyId) && agencyId > 0) {
        agencyIds = [agencyId];
      } else {
        const [rows] = await pool.execute(
          `SELECT DISTINCT agency_id FROM user_agencies WHERE user_id = ?`,
          [uid]
        );
        agencyIds = (rows || []).map((r) => Number(r.agency_id)).filter((n) => Number.isInteger(n) && n > 0);
      }

      for (const aid of agencyIds.slice(0, 20)) {
        await ProviderSearchIndex.upsertForUserInAgency({ userId: uid, agencyId: aid, fieldKeys: changedKeys.length ? changedKeys : null });
      }
    } catch {
      // ignore (index is best-effort)
    }
    
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
    
    // Users can update their own info, admins/support/staff can update any
    if (
      parseInt(userId) !== req.user.id &&
      req.user.role !== 'admin' &&
      req.user.role !== 'super_admin' &&
      req.user.role !== 'support' &&
      req.user.role !== 'staff'
    ) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    // Block self-service edits of staff-managed categories / keys.
    const isSelf = parseInt(userId) === req.user.id;
    const SELF_READONLY_CATEGORY_KEYS = new Set(['gear_tracking']);
    if (isSelf) {
      try {
        const [rows] = await pool.execute(
          'SELECT category_key, field_key FROM user_info_field_definitions WHERE id = ? LIMIT 1',
          [parseInt(fieldId)]
        );
        const cat = rows?.[0]?.category_key ? String(rows[0].category_key) : '';
        const fk = rows?.[0]?.field_key ? String(rows[0].field_key).trim() : '';
        const SELF_PROVIDER_LOCKED_KEYS = new Set([
          'provider_status',
          'provider_accepts_commercial',
          'provider_accepts_medicaid',
          'provider_accepts_tricare',
          'provider_background_check_date',
          'provider_background_check_status',
          'provider_background_check_notes',
          'provider_cleared_to_start',
          'provider_clinician_notes',
          'provider_credential',
          'provider_display_name',
          'provider_risk_high_behavioral_needs',
          'provider_risk_skills',
          'provider_risk_substance_use',
          'provider_risk_suicidal',
          'provider_risk_trauma'
        ]);
        if (cat && SELF_READONLY_CATEGORY_KEYS.has(cat)) {
          return res.status(403).json({ error: { message: 'This section is managed by staff.' } });
        }
        if ((req.user.role === 'provider' || req.user.role === 'clinician') && fk && SELF_PROVIDER_LOCKED_KEYS.has(fk)) {
          return res.status(403).json({ error: { message: 'This section is managed by staff.' } });
        }
      } catch {
        // ignore
      }
    }

    const result = await UserInfoValue.createOrUpdate(parseInt(userId), parseInt(fieldId), value);

    // Mirror alias credentialing writes into canonical provider_* keys (best-effort).
    try {
      const agencyIdRaw = req.body?.agencyId ?? req.query?.agencyId ?? null;
      const agencyId = agencyIdRaw ? parseInt(String(agencyIdRaw), 10) : null;
      const isAdminLike = ['admin', 'super_admin', 'support', 'staff'].includes(String(req.user?.role || '').toLowerCase());
      const [rows] = await pool.execute(
        'SELECT field_key FROM user_info_field_definitions WHERE id = ? LIMIT 1',
        [parseInt(fieldId)]
      );
      const fk = String(rows?.[0]?.field_key || '').trim();
      if (fk) {
        const map = new Map([[fk, value ?? null]]);
        await mirrorAliasCredentialingWrites({
          userId: parseInt(userId),
          agencyId,
          changedKeyValues: map,
          allowCleanup: isAdminLike
        });
      }
    } catch {
      // ignore
    }

    // Best-effort index refresh for provider matching/search.
    try {
      const uid = parseInt(userId);
      const agencyIdRaw = req.body?.agencyId ?? req.query?.agencyId ?? null;
      const agencyId = agencyIdRaw ? parseInt(String(agencyIdRaw), 10) : null;
      let fieldKey = '';
      try {
        const [rows] = await pool.execute(
          'SELECT field_key FROM user_info_field_definitions WHERE id = ? LIMIT 1',
          [parseInt(fieldId)]
        );
        fieldKey = String(rows?.[0]?.field_key || '').trim();
      } catch {
        fieldKey = '';
      }
      if (Number.isInteger(agencyId) && agencyId > 0) {
        await ProviderSearchIndex.upsertForUserInAgency({ userId: uid, agencyId, fieldKeys: fieldKey ? [fieldKey] : null });
      } else {
        const [rows] = await pool.execute(
          `SELECT DISTINCT agency_id FROM user_agencies WHERE user_id = ?`,
          [uid]
        );
        const agencyIds = (rows || []).map((r) => Number(r.agency_id)).filter((n) => Number.isInteger(n) && n > 0);
        for (const aid of agencyIds.slice(0, 20)) {
          await ProviderSearchIndex.upsertForUserInAgency({ userId: uid, agencyId: aid, fieldKeys: fieldKey ? [fieldKey] : null });
        }
      }
    } catch {
      // ignore
    }
    
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const deleteUserInfoField = async (req, res, next) => {
  try {
    const { userId, fieldId } = req.params;
    
    // Only admin/support/staff can delete values entirely.
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support' && req.user.role !== 'staff') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const uid = parseInt(userId);
    const fid = parseInt(fieldId);
    let deleted = await UserInfoValue.delete(uid, fid);

    // If no row was deleted, it can be because the displayed "best" field definition id
    // differs from the one that actually holds the saved value (duplicate definitions per agency/template).
    // In that case, delete by canonical field_key for this user.
    if (!deleted) {
      try {
        const [rows] = await pool.execute(
          'SELECT field_key FROM user_info_field_definitions WHERE id = ? LIMIT 1',
          [fid]
        );
        const fieldKey = String(rows?.[0]?.field_key || '').trim();
        if (fieldKey) {
          const [result] = await pool.execute(
            `DELETE uiv
             FROM user_info_values uiv
             JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
             WHERE uiv.user_id = ? AND uifd.field_key = ?`,
            [uid, fieldKey]
          );
          deleted = (result?.affectedRows || 0) > 0;
        }
      } catch {
        // ignore
      }
    }

    if (!deleted) {
      return res.status(404).json({ error: { message: 'User info field not found' } });
    }

    // Best-effort index refresh for provider matching/search (remove deleted field from index).
    try {
      const uid = parseInt(userId);
      const agencyIdRaw = req.body?.agencyId ?? req.query?.agencyId ?? null;
      const agencyId = agencyIdRaw ? parseInt(String(agencyIdRaw), 10) : null;

      let fieldKey = '';
      try {
        const [rows] = await pool.execute(
          'SELECT field_key FROM user_info_field_definitions WHERE id = ? LIMIT 1',
          [parseInt(fieldId)]
        );
        fieldKey = String(rows?.[0]?.field_key || '').trim();
      } catch {
        fieldKey = '';
      }

      if (Number.isInteger(agencyId) && agencyId > 0) {
        await ProviderSearchIndex.upsertForUserInAgency({ userId: uid, agencyId, fieldKeys: fieldKey ? [fieldKey] : null });
      } else {
        const [rows] = await pool.execute(
          `SELECT DISTINCT agency_id FROM user_agencies WHERE user_id = ?`,
          [uid]
        );
        const agencyIds = (rows || []).map((r) => Number(r.agency_id)).filter((n) => Number.isInteger(n) && n > 0);
        for (const aid of agencyIds.slice(0, 20)) {
          await ProviderSearchIndex.upsertForUserInAgency({ userId: uid, agencyId: aid, fieldKeys: fieldKey ? [fieldKey] : null });
        }
      }
    } catch {
      // ignore
    }
    
    res.json({ message: 'User info field deleted successfully' });
  } catch (error) {
    next(error);
  }
};


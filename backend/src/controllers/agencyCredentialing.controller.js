import pool from '../config/database.js';
import User from '../models/User.model.js';
import UserInfoValue from '../models/UserInfoValue.model.js';
import InsuranceCredentialingDefinition from '../models/InsuranceCredentialingDefinition.model.js';
import UserInsuranceCredentialing from '../models/UserInsuranceCredentialing.model.js';
import CredentialingChangeLog from '../models/CredentialingChangeLog.model.js';
import { encryptChatText, decryptChatText } from '../services/chatEncryption.service.js';
import { validationResult } from 'express-validator';
import crypto from 'crypto';

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

const ACTIVE_STATUSES = new Set(['ACTIVE_EMPLOYEE', 'ACTIVE']);
const PROVIDER_ROLES = new Set(['provider', 'provider_plus', 'clinical_practice_assistant', 'super_admin', 'admin']);

function isMeaningfulValue(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (!s) return false;
  if (s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return false;
  // Treat empty multi-select JSON as blank.
  if (s === '[]') return false;
  return true;
}

function firstMeaningfulFromKeys(fieldsObj, keys) {
  for (const k of keys || []) {
    const v = fieldsObj?.[k];
    if (isMeaningfulValue(v)) return v;
  }
  return null;
}

function firstMeaningfulKey(fieldsObj, keys) {
  for (const k of keys || []) {
    const v = fieldsObj?.[k];
    if (isMeaningfulValue(v)) return String(k);
  }
  return '';
}

// Requested column names (export + UI), mapped to our canonical storage.
export const CREDENTIALING_COLUMNS = [
  { key: 'first_name', label: 'first_name', kind: 'users', usersCol: 'first_name' },
  { key: 'last_name', label: 'last_name', kind: 'users', usersCol: 'last_name' },
  { key: 'date_of_birth', label: 'date_of_birth', kind: 'uiv', fieldKey: 'date_of_birth', readFieldKeys: ['date_of_birth', 'dob', 'birthdate', 'birth_date'] },
  { key: 'first_client_date', label: 'first_client_date', kind: 'uiv', fieldKey: 'first_client_date', readFieldKeys: ['first_client_date', 'first_client_start_date', 'start_date_first_client'] },
  {
    key: 'npi_number',
    label: 'npi_number',
    kind: 'uiv',
    fieldKey: 'provider_identity_npi_number',
    readFieldKeys: ['provider_identity_npi_number', 'npi_number', 'provider_npi_number', 'provider_npi', 'npi']
  },
  { key: 'npi_id', label: 'npi_id', kind: 'uiv', fieldKey: 'npi_id', readFieldKeys: ['npi_id', 'provider_npi_id'] },
  {
    key: 'taxonomy_code',
    label: 'taxonomy_code',
    kind: 'uiv',
    fieldKey: 'provider_identity_taxonomy_code',
    readFieldKeys: ['provider_identity_taxonomy_code', 'taxonomy_code', 'taxonomy']
  },
  { key: 'zipcode', label: 'zipcode', kind: 'uiv', fieldKey: 'zipcode', readFieldKeys: ['zipcode', 'zip', 'postal_code', 'home_zip'] },
  {
    key: 'license_type_number',
    label: 'license_type_number',
    kind: 'uiv',
    fieldKey: 'provider_credential_license_type_number',
    readFieldKeys: [
      'provider_credential_license_type_number',
      'license_type_number',
      'license_type_and_number',
      'license_number',
      'provider_license_type_number'
    ]
  },
  {
    key: 'license_issued',
    label: 'license_issued',
    kind: 'uiv',
    fieldKey: 'provider_credential_license_issued_date',
    readFieldKeys: ['provider_credential_license_issued_date', 'license_issued', 'license_issued_date']
  },
  {
    key: 'license_expires',
    label: 'license_expires',
    kind: 'uiv',
    fieldKey: 'provider_credential_license_expiration_date',
    readFieldKeys: ['provider_credential_license_expiration_date', 'license_expires', 'license_expiration_date', 'license_expires_date']
  },
  { key: 'medicaid_provider_type', label: 'medicaid_provider_type', kind: 'uiv', fieldKey: 'medicaid_provider_type', readFieldKeys: ['medicaid_provider_type'] },
  { key: 'tax_id', label: 'tax_id', kind: 'uiv', fieldKey: 'tax_id', readFieldKeys: ['tax_id', 'ein'] },
  {
    key: 'medicaid_location_id',
    label: 'medicaid_location_id',
    kind: 'uiv',
    fieldKey: 'provider_credential_medicaid_location_id',
    readFieldKeys: ['provider_credential_medicaid_location_id', 'medicaid_location_id']
  },
  {
    key: 'medicaid_effective_date',
    label: 'medicaid_effective_date',
    kind: 'uiv',
    fieldKey: 'medicaid_effective_date',
    readFieldKeys: ['medicaid_effective_date', 'medicaid_effective']
  },
  {
    key: 'medicaid_revalidation',
    label: 'medicaid_revalidation',
    kind: 'uiv',
    fieldKey: 'provider_credential_medicaid_revalidation_date',
    readFieldKeys: ['provider_credential_medicaid_revalidation_date', 'medicaid_revalidation', 'medicaid_revalidation_date']
  },
  { key: 'medicare_number', label: 'medicare_number', kind: 'uiv', fieldKey: 'medicare_number', readFieldKeys: ['medicare_number', 'medicare_id'] },
  {
    key: 'caqh_provider_id',
    label: 'caqh_provider_id',
    kind: 'uiv',
    fieldKey: 'provider_credential_caqh_provider_id',
    readFieldKeys: ['provider_credential_caqh_provider_id', 'caqh_provider_id', 'caqh_id']
  },
  { key: 'personal_email', label: 'personal_email', kind: 'users', usersCol: 'personal_email' },
  { key: 'cell_number', label: 'cell_number', kind: 'users', usersCol: 'personal_phone' }
];

// Best-effort typing for auto-created field definitions (when migrations haven't been run yet).
// These are the storage keys that the credentialing grid actually writes to.
const CREDENTIALING_FIELD_TYPE_BY_KEY = new Map([
  ['date_of_birth', 'date'],
  ['first_client_date', 'date'],
  ['medicaid_effective_date', 'date'],
  ['provider_credential_license_issued_date', 'date'],
  ['provider_credential_license_expiration_date', 'date'],
  ['provider_credential_medicaid_revalidation_date', 'date']
]);

function labelizeFieldKey(k) {
  return String(k || '')
    .trim()
    .split('_')
    .filter(Boolean)
    .map((p) => p[0]?.toUpperCase() + p.slice(1))
    .join(' ')
    .trim();
}

async function ensureAgencyFieldDefinitions({ agencyId, fieldKeys, createdByUserId = null }) {
  const keys = Array.from(new Set((fieldKeys || []).map((k) => String(k || '').trim()).filter(Boolean)));
  if (!keys.length) return;

  // Check what already exists (agency-scoped or platform).
  const placeholders = keys.map(() => '?').join(',');
  const [existing] = await pool.execute(
    `SELECT DISTINCT field_key
     FROM user_info_field_definitions
     WHERE field_key IN (${placeholders})
       AND (agency_id = ? OR agency_id IS NULL)`,
    [...keys, agencyId]
  );
  const have = new Set((existing || []).map((r) => String(r.field_key || '').trim()).filter(Boolean));
  const missing = keys.filter((k) => !have.has(k));
  if (!missing.length) return;

  // Create missing as agency-scoped defs so we don't create NULL-agency duplicates.
  const chunkSize = 200;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    const valuesSql = chunk.map(() => '(?, ?, ?, NULL, FALSE, FALSE, ?, NULL, \'credentialing\', 0, ?)').join(',');
    const params = [];
    for (const k of chunk) {
      const type = CREDENTIALING_FIELD_TYPE_BY_KEY.get(k) || 'text';
      params.push(k, labelizeFieldKey(k) || k, type, agencyId, createdByUserId);
    }
    await pool.execute(
      `INSERT INTO user_info_field_definitions
        (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, category_key, order_index, created_by_user_id)
       VALUES ${valuesSql}
       ON DUPLICATE KEY UPDATE field_key = field_key`,
      params
    );
  }
}

const UIV_READ_FIELD_KEYS = Array.from(
  new Set(
    CREDENTIALING_COLUMNS
      .filter((c) => c.kind === 'uiv')
      .flatMap((c) => (Array.isArray(c.readFieldKeys) && c.readFieldKeys.length ? c.readFieldKeys : [c.fieldKey]))
  )
);

const CANONICAL_UICOL_BY_STORAGE_KEY = new Map(
  CREDENTIALING_COLUMNS.filter((c) => c.kind === 'uiv').map((c) => [String(c.fieldKey), c])
);

function normalizeRowFieldsToCanonical(row) {
  const fields = row?.fields || {};
  const sources = row?.sources && typeof row.sources === 'object' ? row.sources : {};
  for (const col of CREDENTIALING_COLUMNS) {
    if (col.kind !== 'uiv') continue;
    const readKeys = Array.isArray(col.readFieldKeys) && col.readFieldKeys.length ? col.readFieldKeys : [col.fieldKey];
    const v = firstMeaningfulFromKeys(fields, readKeys);
    const sourceKey = firstMeaningfulKey(fields, readKeys);
    sources[col.key] = sourceKey || '';
    if (v !== null && v !== undefined && !isMeaningfulValue(fields[col.fieldKey])) {
      fields[col.fieldKey] = v;
    }
  }
  row.fields = fields;
  row.sources = sources;
  return row;
}

async function assertAgencyAccess(req, agencyId) {
  if (req.user.role === 'super_admin') return;
  const role = String(req.user.role || '').toLowerCase();
  if (!['admin', 'support', 'staff'].includes(role)) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }
  const agencies = await User.getAgencies(req.user.id);
  const ok = (agencies || []).some((a) => Number(a.id) === Number(agencyId));
  if (!ok) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }
}

/** Require credential management privilege for the agency. Super_admin always passes. */
async function assertCredentialPrivilege(req, agencyId) {
  if (req.user.role === 'super_admin') return;
  const role = String(req.user.role || '').toLowerCase();
  if (!['admin', 'support', 'staff'].includes(role)) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    throw err;
  }
  const credAgencyIds = await User.listCredentialingAgencyIds(req.user.id);
  if (credAgencyIds.includes(Number(agencyId))) return;
  const err = new Error('Access denied');
  err.statusCode = 403;
  throw err;
}

function isActiveUserRow(u) {
  const st = String(u?.status || '').toUpperCase();
  return ACTIVE_STATUSES.has(st);
}

function isProviderRow(u) {
  const r = String(u?.role || '').toLowerCase();
  return PROVIDER_ROLES.has(r);
}

export const listAgencyProvidersCredentialing = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!Number.isInteger(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }

    await assertCredentialPrivilege(req, agencyId);
    const includeDebug = String(req.query.debug || '').toLowerCase() === 'true';

    const [users] = await pool.execute(
      `SELECT u.id AS userId, u.first_name, u.last_name, u.role, u.status, u.personal_email, u.personal_phone
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE UPPER(COALESCE(u.status,'')) IN ('ACTIVE_EMPLOYEE','ACTIVE')
         AND (
           LOWER(COALESCE(u.role,'')) IN ('provider','provider_plus','clinical_practice_assistant','super_admin')
           OR (
             LOWER(COALESCE(u.role,'')) = 'admin'
             AND (
               EXISTS (
                 SELECT 1 FROM supervisor_assignments sa
                 WHERE sa.supervisor_id = u.id AND sa.agency_id = ?
                 AND (
                   EXISTS (SELECT 1 FROM client_provider_assignments cpa
                     WHERE cpa.provider_user_id = sa.supervisee_id AND cpa.organization_id = ? AND cpa.is_active = 1)
                   OR EXISTS (SELECT 1 FROM clients c
                     WHERE c.provider_id = sa.supervisee_id AND c.organization_id = ?)
                 )
               )
               OR EXISTS (SELECT 1 FROM client_provider_assignments cpa
                 WHERE cpa.provider_user_id = u.id AND cpa.organization_id = ? AND cpa.is_active = 1)
               OR EXISTS (SELECT 1 FROM clients c
                 WHERE c.provider_id = u.id AND c.organization_id = ?)
             )
           )
         )
       ORDER BY COALESCE(u.last_name,''), COALESCE(u.first_name,''), u.id`,
      [agencyId, agencyId, agencyId, agencyId, agencyId, agencyId]
    );

    const userIds = (users || []).map((u) => Number(u.userId)).filter((n) => Number.isInteger(n) && n > 0);
    const rowsByUserId = new Map();
    for (const u of users || []) {
      rowsByUserId.set(Number(u.userId), {
        userId: Number(u.userId),
        first_name: u.first_name || '',
        last_name: u.last_name || '',
        status: u.status || '',
        role: u.role || '',
        personal_email: u.personal_email || '',
        cell_number: u.personal_phone || '',
        fields: {},
        ...(includeDebug ? { debug: {} } : null)
      });
    }

    if (userIds.length) {
      const placeholders = userIds.map(() => '?').join(',');
      const fieldPlaceholders = UIV_READ_FIELD_KEYS.map(() => '?').join(',');
      const params = [agencyId, ...userIds, ...UIV_READ_FIELD_KEYS];
      const [vals] = await pool.execute(
        `SELECT uiv.user_id, uifd.field_key, uiv.value, uiv.updated_at, uiv.id, uiv.field_definition_id
         FROM user_info_values uiv
         JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
         JOIN user_agencies ua ON ua.user_id = uiv.user_id AND ua.agency_id = ?
         WHERE uiv.user_id IN (${placeholders})
           AND uifd.field_key IN (${fieldPlaceholders})
         ORDER BY uiv.user_id ASC, uifd.field_key ASC, uiv.updated_at DESC, uiv.id DESC`,
        params
      );

      for (const v of vals || []) {
        const uid = Number(v.user_id);
        const row = rowsByUserId.get(uid);
        if (!row) continue;
        const k = String(v.field_key || '').trim();
        if (!k) continue;
        if (includeDebug) {
          const list = Array.isArray(row.debug?.[k]) ? row.debug[k] : [];
          list.push({
            fieldDefinitionId: Number(v.field_definition_id || 0) || null,
            value: v.value ?? null,
            updatedAt: v.updated_at ? new Date(v.updated_at).toISOString() : null
          });
          row.debug[k] = list;
        }
        if (row.fields[k] !== undefined) continue;
        row.fields[k] = v.value ?? null;
      }

      const [insRows] = await pool.execute(
        `SELECT uic.user_id, icd.name AS insurance_name
         FROM user_insurance_credentialing uic
         JOIN insurance_credentialing_definitions icd ON icd.id = uic.insurance_credentialing_definition_id
         WHERE icd.agency_id = ? AND uic.user_id IN (${placeholders})`,
        [agencyId, ...userIds]
      );
      const inNetworkByUser = new Map();
      for (const ir of insRows || []) {
        const uid = Number(ir.user_id);
        const name = String(ir.insurance_name || '').trim();
        if (!uid || !name) continue;
        if (!inNetworkByUser.has(uid)) inNetworkByUser.set(uid, []);
        inNetworkByUser.get(uid).push(name);
      }
      for (const [uid, row] of rowsByUserId) {
        row.in_network = inNetworkByUser.get(uid) || [];
      }
    }

    res.json({
      agencyId,
      columns: CREDENTIALING_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
      rows: Array.from(rowsByUserId.values()).map((r) => normalizeRowFieldsToCanonical(r))
    });
  } catch (e) {
    next(e);
  }
};

async function resolveBestDefinitionIdsForAgency({ agencyId, fieldKeys }) {
  if (!fieldKeys.length) return new Map();
  const keys = Array.from(new Set(fieldKeys.map((k) => String(k || '').trim()).filter(Boolean)));

  // Ensure missing keys exist as definitions (best-effort) so PATCH never silently "does nothing".
  try {
    await ensureAgencyFieldDefinitions({ agencyId, fieldKeys: keys, createdByUserId: null });
  } catch {
    // ignore; we'll still attempt to resolve whatever exists
  }

  const placeholders = keys.map(() => '?').join(',');
  const [defs] = await pool.execute(
    `SELECT id, field_key, agency_id, is_platform_template
     FROM user_info_field_definitions
     WHERE field_key IN (${placeholders})
       AND (agency_id = ? OR agency_id IS NULL)
     ORDER BY
       (agency_id = ?) DESC,
       (is_platform_template = TRUE) DESC,
       (agency_id IS NULL) DESC,
       id ASC`,
    [...keys, agencyId, agencyId]
  );

  const best = new Map();
  for (const d of defs || []) {
    const k = String(d.field_key || '').trim();
    if (!k || best.has(k)) continue;
    best.set(k, Number(d.id));
  }
  return best;
}

export const patchAgencyProvidersCredentialing = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!Number.isInteger(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }
    await assertCredentialPrivilege(req, agencyId);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const updates = Array.isArray(req.body?.updates) ? req.body.updates : null;
    if (!updates) {
      return res.status(400).json({ error: { message: 'updates must be an array' } });
    }

    // Verify all target users are active providers in this agency (prevent cross-agency writes).
    const uniqueUserIds = Array.from(
      new Set(updates.map((u) => Number(u?.userId)).filter((n) => Number.isInteger(n) && n > 0))
    );
    if (uniqueUserIds.length === 0) return res.json({ ok: true, updated: 0 });

    const placeholders = uniqueUserIds.map(() => '?').join(',');
    const [allowedUsers] = await pool.execute(
      `SELECT u.id AS userId, u.role, u.status
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE u.id IN (${placeholders})`,
      [agencyId, ...uniqueUserIds]
    );
    const allowed = new Set(
      (allowedUsers || [])
        .filter((u) => isProviderRow(u) && isActiveUserRow(u))
        .map((u) => Number(u.userId))
    );

    // Normalize updates: only accept known keys.
    const allowedUpdateKeys = new Set(CREDENTIALING_COLUMNS.map((c) => c.key));
    const normalized = updates
      .map((u) => ({
        userId: Number(u?.userId),
        fieldKey: String(u?.fieldKey || '').trim(),
        value: u?.value ?? null
      }))
      .filter((u) => Number.isInteger(u.userId) && u.userId > 0 && u.fieldKey && allowedUpdateKeys.has(u.fieldKey))
      .filter((u) => allowed.has(u.userId));

    if (normalized.length === 0) return res.json({ ok: true, updated: 0 });

    // Update core users columns first (personal_email, cell_number).
    const coreUpdates = normalized.filter((u) => u.fieldKey === 'personal_email' || u.fieldKey === 'cell_number');
    for (const u of coreUpdates) {
      if (u.fieldKey === 'personal_email') {
        const email = String(u.value ?? '').trim() || null;
        await pool.execute('UPDATE users SET personal_email = ? WHERE id = ? LIMIT 1', [email, u.userId]);
      } else if (u.fieldKey === 'cell_number') {
        const phone = u.value ? User.normalizePhone(u.value) : null;
        await pool.execute('UPDATE users SET personal_phone = ? WHERE id = ? LIMIT 1', [phone, u.userId]);
      }
    }

    // User-info updates
    const uivUpdates = normalized
      .filter((u) => !['personal_email', 'cell_number'].includes(u.fieldKey))
      .map((u) => {
        const col = CREDENTIALING_COLUMNS.find((c) => c.key === u.fieldKey);
        return {
          ...u,
          storageKey: col?.fieldKey || null,
          aliasKeysToClear: (col?.readFieldKeys || []).filter((k) => String(k) !== String(col?.fieldKey || ''))
        };
      })
      .filter((u) => !!u.storageKey);

    const storageKeys = Array.from(new Set(uivUpdates.map((u) => String(u.storageKey))));
    // Ensure defs exist (if migrations weren't run yet) so edits actually persist.
    await ensureAgencyFieldDefinitions({ agencyId, fieldKeys: storageKeys, createdByUserId: req.user?.id || null });
    const defIdByFieldKey = await resolveBestDefinitionIdsForAgency({ agencyId, fieldKeys: storageKeys });

    const stillMissing = storageKeys.filter((k) => !defIdByFieldKey.get(String(k)));
    if (stillMissing.length) {
      return res.status(500).json({
        error: {
          message: 'Credentialing fields are missing definitions; cannot save changes.',
          missingFieldKeys: stillMissing
        }
      });
    }

    let updatedCount = coreUpdates.length;
    for (const u of uivUpdates) {
      const defId = defIdByFieldKey.get(String(u.storageKey));
      if (!defId) continue;
      const [oldRows] = await pool.execute(
        'SELECT uiv.value FROM user_info_values uiv WHERE uiv.user_id = ? AND uiv.field_definition_id = ? LIMIT 1',
        [u.userId, defId]
      );
      const oldVal = oldRows?.[0]?.value ?? null;
      await UserInfoValue.createOrUpdate(u.userId, defId, u.value);
      try {
        await CredentialingChangeLog.create({
          userId: u.userId,
          agencyId,
          fieldChanged: u.fieldKey,
          oldValue: oldVal != null ? String(oldVal) : null,
          newValue: u.value != null ? String(u.value) : null,
          changedByUserId: req.user?.id || null,
          insuranceCredentialingDefinitionId: null
        });
      } catch {
        // best-effort; don't fail the main update
      }
      // Cleanup: if the value used to live under an alias field_key, clear those alias values
      // so Provider Info and Credentialing stop showing duplicates for this user.
      if (Array.isArray(u.aliasKeysToClear) && u.aliasKeysToClear.length) {
        try {
          const ph = u.aliasKeysToClear.map(() => '?').join(',');
          await pool.execute(
            `DELETE uiv
             FROM user_info_values uiv
             JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
             WHERE uiv.user_id = ? AND uifd.field_key IN (${ph})`,
            [u.userId, ...u.aliasKeysToClear]
          );
        } catch {
          // ignore (best-effort)
        }
      }
      updatedCount += 1;
    }

    res.json({ ok: true, updated: updatedCount });
  } catch (e) {
    // Give a stable error id for admins to report.
    const errorId = crypto.randomUUID?.() || crypto.randomBytes(8).toString('hex');
    console.error('patchAgencyProvidersCredentialing error', errorId, e);
    next(e);
  }
};

export const downloadAgencyProvidersCredentialingCsv = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!Number.isInteger(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }
    await assertCredentialPrivilege(req, agencyId);

    // Reuse the JSON method but avoid extra work in response formatting.
    const [users] = await pool.execute(
      `SELECT u.id AS userId, u.first_name, u.last_name, u.role, u.status, u.personal_email, u.personal_phone
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE UPPER(COALESCE(u.status,'')) IN ('ACTIVE_EMPLOYEE','ACTIVE')
         AND (
           LOWER(COALESCE(u.role,'')) IN ('provider','provider_plus','clinical_practice_assistant','super_admin')
           OR (
             LOWER(COALESCE(u.role,'')) = 'admin'
             AND (
               EXISTS (
                 SELECT 1 FROM supervisor_assignments sa
                 WHERE sa.supervisor_id = u.id AND sa.agency_id = ?
                 AND (
                   EXISTS (SELECT 1 FROM client_provider_assignments cpa
                     WHERE cpa.provider_user_id = sa.supervisee_id AND cpa.organization_id = ? AND cpa.is_active = 1)
                   OR EXISTS (SELECT 1 FROM clients c
                     WHERE c.provider_id = sa.supervisee_id AND c.organization_id = ?)
                 )
               )
               OR EXISTS (SELECT 1 FROM client_provider_assignments cpa
                 WHERE cpa.provider_user_id = u.id AND cpa.organization_id = ? AND cpa.is_active = 1)
               OR EXISTS (SELECT 1 FROM clients c
                 WHERE c.provider_id = u.id AND c.organization_id = ?)
             )
           )
         )
       ORDER BY COALESCE(u.last_name,''), COALESCE(u.first_name,''), u.id`,
      [agencyId, agencyId, agencyId, agencyId, agencyId, agencyId]
    );

    const userIds = (users || []).map((u) => Number(u.userId)).filter((n) => Number.isInteger(n) && n > 0);
    const fieldsByUserId = new Map();
    for (const uid of userIds) fieldsByUserId.set(uid, {});

    if (userIds.length) {
      const placeholders = userIds.map(() => '?').join(',');
      const fieldPlaceholders = UIV_READ_FIELD_KEYS.map(() => '?').join(',');
      const params = [agencyId, ...userIds, ...UIV_READ_FIELD_KEYS];
      const [vals] = await pool.execute(
        `SELECT uiv.user_id, uifd.field_key, uiv.value, uiv.updated_at, uiv.id
         FROM user_info_values uiv
         JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
         JOIN user_agencies ua ON ua.user_id = uiv.user_id AND ua.agency_id = ?
         WHERE uiv.user_id IN (${placeholders})
           AND uifd.field_key IN (${fieldPlaceholders})
         ORDER BY uiv.user_id ASC, uifd.field_key ASC, uiv.updated_at DESC, uiv.id DESC`,
        params
      );
      for (const v of vals || []) {
        const uid = Number(v.user_id);
        const map = fieldsByUserId.get(uid);
        if (!map) continue;
        const k = String(v.field_key || '').trim();
        if (!k) continue;
        if (map[k] !== undefined) continue;
        map[k] = v.value ?? null;
      }
    }

    const columnsParam = String(req.query.columns || '').trim();
    const selectedKeys = columnsParam
      ? columnsParam.split(',').map((k) => String(k).trim()).filter(Boolean)
      : null;
    const exportColumns = selectedKeys?.length
      ? CREDENTIALING_COLUMNS.filter((c) => selectedKeys.includes(c.key))
      : CREDENTIALING_COLUMNS;
    if (!exportColumns.length) {
      return res.status(400).json({ error: { message: 'No valid columns selected' } });
    }

    const header = exportColumns.map((c) => c.label);
    const lines = [header.join(',')];
    for (const u of users || []) {
      const uid = Number(u.userId);
      const f = fieldsByUserId.get(uid) || {};
      for (const col of CREDENTIALING_COLUMNS) {
        if (col.kind !== 'uiv') continue;
        const readKeys = Array.isArray(col.readFieldKeys) && col.readFieldKeys.length ? col.readFieldKeys : [col.fieldKey];
        const v = firstMeaningfulFromKeys(f, readKeys);
        if (v !== null && v !== undefined && !isMeaningfulValue(f[col.fieldKey])) {
          f[col.fieldKey] = v;
        }
      }
      const row = exportColumns.map((c) => {
        if (c.kind === 'users') {
          if (c.usersCol === 'personal_phone') return csvEscape(u.personal_phone || '');
          return csvEscape(u[c.usersCol] || '');
        }
        return csvEscape(f[c.fieldKey] ?? '');
      });
      lines.push(row.join(','));
    }

    const filename = `agency-${agencyId}-credentialing-providers.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(lines.join('\n'));
  } catch (e) {
    next(e);
  }
};

// Optional: purge stored values for a given field key across this agency's providers.
export const deleteAgencyProvidersCredentialingField = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const fieldKey = String(req.params.fieldKey || '').trim();
    if (!Number.isInteger(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }
    if (!fieldKey) {
      return res.status(400).json({ error: { message: 'fieldKey required' } });
    }
    await assertCredentialPrivilege(req, agencyId);

    const [result] = await pool.execute(
      `DELETE uiv
       FROM user_info_values uiv
       JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
       JOIN user_agencies ua ON ua.user_id = uiv.user_id AND ua.agency_id = ?
       JOIN users u ON u.id = uiv.user_id
       WHERE uifd.field_key = ?
         AND (
           LOWER(COALESCE(u.role,'')) IN ('provider','provider_plus','clinical_practice_assistant','super_admin')
           OR (
             LOWER(COALESCE(u.role,'')) = 'admin'
             AND (
               EXISTS (
                 SELECT 1 FROM supervisor_assignments sa
                 WHERE sa.supervisor_id = u.id AND sa.agency_id = ?
                 AND (
                   EXISTS (SELECT 1 FROM client_provider_assignments cpa
                     WHERE cpa.provider_user_id = sa.supervisee_id AND cpa.organization_id = ? AND cpa.is_active = 1)
                   OR EXISTS (SELECT 1 FROM clients c WHERE c.provider_id = sa.supervisee_id AND c.organization_id = ?)
                 )
               )
               OR EXISTS (SELECT 1 FROM client_provider_assignments cpa
                 WHERE cpa.provider_user_id = u.id AND cpa.organization_id = ? AND cpa.is_active = 1)
               OR EXISTS (SELECT 1 FROM clients c WHERE c.provider_id = u.id AND c.organization_id = ?)
             )
           )
         )`,
      [agencyId, fieldKey, agencyId, agencyId, agencyId, agencyId, agencyId]
    );

    res.json({ ok: true, deleted: Number(result?.affectedRows || 0) });
  } catch (e) {
    next(e);
  }
};

// --- Insurance definitions CRUD ---
export const listInsuranceDefinitions = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!Number.isInteger(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    const list = await InsuranceCredentialingDefinition.listByAgencyId(agencyId);
    // Return without raw ciphertext for list; frontend uses masked display
    const safe = (list || []).map((r) => ({
      id: r.id,
      agency_id: r.agency_id,
      name: r.name,
      parent_id: r.parent_id,
      contact_phone: r.contact_phone,
      contact_email: r.contact_email,
      reminder_notes: r.reminder_notes,
      sort_order: r.sort_order,
      created_at: r.created_at,
      updated_at: r.updated_at,
      has_login_credentials: !!(r.login_username_ciphertext || r.login_password_ciphertext)
    }));
    res.json({ insurances: safe });
  } catch (e) {
    next(e);
  }
};

export const createInsuranceDefinition = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!Number.isInteger(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    const { name, parentId, contactPhone, contactEmail, reminderNotes, sortOrder } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: { message: 'name required' } });
    }
    const created = await InsuranceCredentialingDefinition.create({
      agencyId,
      name: String(name).trim(),
      parentId: parentId ? parseInt(parentId, 10) : null,
      contactPhone: contactPhone ? String(contactPhone).trim() : null,
      contactEmail: contactEmail ? String(contactEmail).trim() : null,
      reminderNotes: reminderNotes ? String(reminderNotes).trim() : null,
      sortOrder: sortOrder != null ? parseInt(sortOrder, 10) : 0
    });
    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
};

export const getInsuranceDefinition = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(agencyId) || agencyId <= 0 || !Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId or id' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    const def = await InsuranceCredentialingDefinition.findById(id);
    if (!def || Number(def.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Insurance definition not found' } });
    }
    const safe = {
      ...def,
      login_username_ciphertext: undefined,
      login_password_ciphertext: undefined,
      has_login_credentials: !!(def.login_username_ciphertext || def.login_password_ciphertext)
    };
    res.json(safe);
  } catch (e) {
    next(e);
  }
};

export const updateInsuranceDefinition = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(agencyId) || agencyId <= 0 || !Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId or id' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    const def = await InsuranceCredentialingDefinition.findById(id);
    if (!def || Number(def.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Insurance definition not found' } });
    }
    const body = req.body || {};
    const updates = {};
    if (body.name != null) updates.name = String(body.name).trim();
    if (body.parentId != null) updates.parent_id = body.parentId ? parseInt(body.parentId, 10) : null;
    if (body.contactPhone != null) updates.contact_phone = body.contactPhone ? String(body.contactPhone).trim() : null;
    if (body.contactEmail != null) updates.contact_email = body.contactEmail ? String(body.contactEmail).trim() : null;
    if (body.reminderNotes != null) updates.reminder_notes = body.reminderNotes ? String(body.reminderNotes).trim() : null;
    if (body.sortOrder != null) updates.sort_order = parseInt(body.sortOrder, 10);
    if (body.loginUsername != null && body.loginUsername !== '') {
      const enc = encryptChatText(body.loginUsername);
      updates.login_username_ciphertext = enc.ciphertextB64;
      updates.login_username_iv = enc.ivB64;
      updates.login_username_auth_tag = enc.authTagB64;
      updates.login_username_key_id = enc.keyId;
    }
    if (body.loginPassword != null && body.loginPassword !== '') {
      const enc = encryptChatText(body.loginPassword);
      updates.login_password_ciphertext = enc.ciphertextB64;
      updates.login_password_iv = enc.ivB64;
      updates.login_password_auth_tag = enc.authTagB64;
      updates.login_password_key_id = enc.keyId;
    }
    const updated = await InsuranceCredentialingDefinition.update(id, updates);
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const deleteInsuranceDefinition = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(agencyId) || agencyId <= 0 || !Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId or id' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    const def = await InsuranceCredentialingDefinition.findById(id);
    if (!def || Number(def.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Insurance definition not found' } });
    }
    await InsuranceCredentialingDefinition.delete(id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

// --- User insurance credentialing ---
export const listCredentialingByInsurance = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!Number.isInteger(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    const insurances = await InsuranceCredentialingDefinition.listByAgencyId(agencyId);
    const result = [];
    for (const ins of insurances || []) {
      const rows = await UserInsuranceCredentialing.listByInsuranceId(ins.id);
      result.push({
        insurance: { id: ins.id, name: ins.name, parent_id: ins.parent_id },
        providers: (rows || []).map((r) => ({
          id: r.id,
          user_id: r.user_id,
          first_name: r.first_name,
          last_name: r.last_name,
          role: r.role,
          effective_date: r.effective_date,
          submitted_date: r.submitted_date,
          resubmitted_date: r.resubmitted_date,
          pin_or_reference: r.pin_or_reference,
          notes: r.notes,
          has_user_credentials: !!(r.user_level_username_ciphertext || r.user_level_password_ciphertext)
        }))
      });
    }
    res.json({ byInsurance: result });
  } catch (e) {
    next(e);
  }
};

export const listUserCredentialing = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isInteger(agencyId) || agencyId <= 0 || !Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId or userId' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    const rows = await UserInsuranceCredentialing.listByUserId(userId);
    const byAgency = await InsuranceCredentialingDefinition.listByAgencyId(agencyId);
    const agencyInsIds = new Set((byAgency || []).map((i) => i.id));
    const filtered = (rows || []).filter((r) => agencyInsIds.has(r.insurance_credentialing_definition_id));
    const safe = filtered.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      insurance_credentialing_definition_id: r.insurance_credentialing_definition_id,
      insurance_name: r.insurance_name,
      effective_date: r.effective_date,
      submitted_date: r.submitted_date,
      resubmitted_date: r.resubmitted_date,
      pin_or_reference: r.pin_or_reference,
      notes: r.notes,
      has_user_credentials: !!(r.user_level_username_ciphertext || r.user_level_password_ciphertext)
    }));
    res.json({ credentialing: safe });
  } catch (e) {
    next(e);
  }
};

export const upsertUserInsuranceCredentialing = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!Number.isInteger(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    const { userId, insuranceCredentialingDefinitionId, effectiveDate, submittedDate, resubmittedDate, pinOrReference, notes } = req.body || {};
    if (!userId || !insuranceCredentialingDefinitionId) {
      return res.status(400).json({ error: { message: 'userId and insuranceCredentialingDefinitionId required' } });
    }
    const def = await InsuranceCredentialingDefinition.findById(parseInt(insuranceCredentialingDefinitionId, 10));
    if (!def || Number(def.agency_id) !== agencyId) {
      return res.status(400).json({ error: { message: 'Insurance definition not found or wrong agency' } });
    }
    const created = await UserInsuranceCredentialing.upsert({
      userId: parseInt(userId, 10),
      insuranceCredentialingDefinitionId: parseInt(insuranceCredentialingDefinitionId, 10),
      effectiveDate: effectiveDate || null,
      submittedDate: submittedDate || null,
      resubmittedDate: resubmittedDate || null,
      pinOrReference: pinOrReference ? String(pinOrReference).trim() : null,
      notes: notes ? String(notes).trim() : null,
      updatedByUserId: req.user.id
    });
    res.json(created);
  } catch (e) {
    next(e);
  }
};

export const updateUserInsuranceCredentialing = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(agencyId) || agencyId <= 0 || !Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId or id' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    const [rows] = await pool.execute(
      `SELECT uic.*, icd.agency_id FROM user_insurance_credentialing uic
       JOIN insurance_credentialing_definitions icd ON icd.id = uic.insurance_credentialing_definition_id
       WHERE uic.id = ?`,
      [id]
    );
    const row = rows?.[0];
    if (!row || Number(row.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'User insurance credentialing not found' } });
    }
    const body = req.body || {};
    const updates = {};
    if (body.effectiveDate != null) updates.effective_date = body.effectiveDate || null;
    if (body.submittedDate != null) updates.submitted_date = body.submittedDate || null;
    if (body.resubmittedDate != null) updates.resubmitted_date = body.resubmittedDate || null;
    if (body.pinOrReference != null) updates.pin_or_reference = body.pinOrReference ? String(body.pinOrReference).trim() : null;
    if (body.notes != null) updates.notes = body.notes ? String(body.notes).trim() : null;
    if (Object.keys(updates).length) {
      const setClauses = Object.keys(updates).map((k) => `${k} = ?`);
      const vals = Object.values(updates);
      vals.push(req.user.id, id);
      await pool.execute(
        `UPDATE user_insurance_credentialing SET ${setClauses.join(', ')}, updated_by_user_id = ? WHERE id = ?`,
        vals
      );
    }
    if (body.loginUsername != null && body.loginUsername !== '' || body.loginPassword != null && body.loginPassword !== '') {
      const usernameEnc = body.loginUsername != null && body.loginUsername !== ''
        ? encryptChatText(body.loginUsername)
        : null;
      const passwordEnc = body.loginPassword != null && body.loginPassword !== ''
        ? encryptChatText(body.loginPassword)
        : null;
      await UserInsuranceCredentialing.updateCredentials(id, { usernameEnc, passwordEnc }, req.user.id);
    }
    const updated = await UserInsuranceCredentialing.findByUserAndInsurance(row.user_id, row.insurance_credentialing_definition_id);
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const deleteUserInsuranceCredentialing = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const { userId, insuranceCredentialingDefinitionId } = req.body || req.query;
    if (!userId || !insuranceCredentialingDefinitionId) {
      return res.status(400).json({ error: { message: 'userId and insuranceCredentialingDefinitionId required' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    const def = await InsuranceCredentialingDefinition.findById(parseInt(insuranceCredentialingDefinitionId, 10));
    if (!def || Number(def.agency_id) !== agencyId) {
      return res.status(400).json({ error: { message: 'Insurance definition not found or wrong agency' } });
    }
    await UserInsuranceCredentialing.delete(parseInt(userId, 10), parseInt(insuranceCredentialingDefinitionId, 10));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

// --- Credential reveal (decrypt and return; audit recommended) ---
export const revealCredential = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!Number.isInteger(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    const { type, id, insuranceDefinitionId } = req.body || {};
    if (!type || !['insurance_login', 'user_level'].includes(type)) {
      return res.status(400).json({ error: { message: 'type must be insurance_login or user_level' } });
    }
    let plaintext = null;
    if (type === 'insurance_login') {
      const def = await InsuranceCredentialingDefinition.findById(parseInt(insuranceDefinitionId || id, 10));
      if (!def || Number(def.agency_id) !== agencyId) {
        return res.status(404).json({ error: { message: 'Insurance definition not found' } });
      }
      const field = req.body.field === 'password' ? 'password' : 'username';
      const cipher = field === 'password'
        ? (def.login_password_ciphertext && { ciphertextB64: def.login_password_ciphertext, ivB64: def.login_password_iv, authTagB64: def.login_password_auth_tag, keyId: def.login_password_key_id })
        : (def.login_username_ciphertext && { ciphertextB64: def.login_username_ciphertext, ivB64: def.login_username_iv, authTagB64: def.login_username_auth_tag, keyId: def.login_username_key_id });
      if (!cipher) {
        return res.status(404).json({ error: { message: 'No stored credential' } });
      }
      plaintext = decryptChatText(cipher);
    } else if (type === 'user_level') {
      const uicId = parseInt(id, 10);
      const [rows] = await pool.execute(
        `SELECT uic.*, icd.agency_id FROM user_insurance_credentialing uic
         JOIN insurance_credentialing_definitions icd ON icd.id = uic.insurance_credentialing_definition_id
         WHERE uic.id = ?`,
        [uicId]
      );
      const row = rows?.[0];
      if (!row || Number(row.agency_id) !== agencyId) {
        return res.status(404).json({ error: { message: 'User insurance credentialing not found' } });
      }
      const field = req.body.field === 'password' ? 'password' : 'username';
      const cipher = field === 'password'
        ? (row.user_level_password_ciphertext && { ciphertextB64: row.user_level_password_ciphertext, ivB64: row.user_level_password_iv, authTagB64: row.user_level_password_auth_tag, keyId: row.user_level_password_key_id })
        : (row.user_level_username_ciphertext && { ciphertextB64: row.user_level_username_ciphertext, ivB64: row.user_level_username_iv, authTagB64: row.user_level_username_auth_tag, keyId: row.user_level_username_key_id });
      if (!cipher) {
        return res.status(404).json({ error: { message: 'No stored credential' } });
      }
      plaintext = decryptChatText(cipher);
    }
    res.json({ value: plaintext });
  } catch (e) {
    next(e);
  }
};

// --- Timeline ---
export const listCredentialingTimeline = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;
    if (!Number.isInteger(agencyId) || agencyId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    }
    await assertCredentialPrivilege(req, agencyId);
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const rows = userId
      ? await CredentialingChangeLog.listByUserId(userId, limit)
      : await CredentialingChangeLog.listByAgencyId(agencyId, limit);
    res.json({ timeline: rows || [] });
  } catch (e) {
    next(e);
  }
};


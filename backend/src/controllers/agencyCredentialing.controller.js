import pool from '../config/database.js';
import User from '../models/User.model.js';
import UserInfoValue from '../models/UserInfoValue.model.js';
import { validationResult } from 'express-validator';
import crypto from 'crypto';

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

const ACTIVE_STATUSES = new Set(['ACTIVE_EMPLOYEE', 'ACTIVE']);
const PROVIDER_ROLES = new Set(['provider', 'clinician']);

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

    await assertAgencyAccess(req, agencyId);

    const [users] = await pool.execute(
      `SELECT u.id AS userId, u.first_name, u.last_name, u.role, u.status, u.personal_email, u.personal_phone
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND LOWER(COALESCE(u.role,'')) IN ('provider','clinician')
         AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE_EMPLOYEE','ACTIVE')
       ORDER BY COALESCE(u.last_name,''), COALESCE(u.first_name,''), u.id`,
      [agencyId]
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
        fields: {}
      });
    }

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
        const row = rowsByUserId.get(uid);
        if (!row) continue;
        const k = String(v.field_key || '').trim();
        if (!k) continue;
        if (row.fields[k] !== undefined) continue;
        row.fields[k] = v.value ?? null;
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
  const placeholders = fieldKeys.map(() => '?').join(',');
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
    [...fieldKeys, agencyId, agencyId]
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
    await assertAgencyAccess(req, agencyId);

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
    const defIdByFieldKey = await resolveBestDefinitionIdsForAgency({ agencyId, fieldKeys: storageKeys });

    let updatedCount = coreUpdates.length;
    for (const u of uivUpdates) {
      const defId = defIdByFieldKey.get(String(u.storageKey));
      if (!defId) continue;
      await UserInfoValue.createOrUpdate(u.userId, defId, u.value);
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
    await assertAgencyAccess(req, agencyId);

    // Reuse the JSON method but avoid extra work in response formatting.
    const [users] = await pool.execute(
      `SELECT u.id AS userId, u.first_name, u.last_name, u.role, u.status, u.personal_email, u.personal_phone
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND LOWER(COALESCE(u.role,'')) IN ('provider','clinician')
         AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE_EMPLOYEE','ACTIVE')
       ORDER BY COALESCE(u.last_name,''), COALESCE(u.first_name,''), u.id`,
      [agencyId]
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

    const header = CREDENTIALING_COLUMNS.map((c) => c.label);
    const lines = [header.join(',')];
    for (const u of users || []) {
      const uid = Number(u.userId);
      const f = fieldsByUserId.get(uid) || {};
      // Normalize to canonical keys for export.
      for (const col of CREDENTIALING_COLUMNS) {
        if (col.kind !== 'uiv') continue;
        const readKeys = Array.isArray(col.readFieldKeys) && col.readFieldKeys.length ? col.readFieldKeys : [col.fieldKey];
        const v = firstMeaningfulFromKeys(f, readKeys);
        if (v !== null && v !== undefined && !isMeaningfulValue(f[col.fieldKey])) {
          f[col.fieldKey] = v;
        }
      }
      const row = CREDENTIALING_COLUMNS.map((c) => {
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
    await assertAgencyAccess(req, agencyId);

    const [result] = await pool.execute(
      `DELETE uiv
       FROM user_info_values uiv
       JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
       JOIN user_agencies ua ON ua.user_id = uiv.user_id AND ua.agency_id = ?
       JOIN users u ON u.id = uiv.user_id
       WHERE uifd.field_key = ?
         AND LOWER(COALESCE(u.role,'')) IN ('provider','clinician')`,
      [agencyId, fieldKey]
    );

    res.json({ ok: true, deleted: Number(result?.affectedRows || 0) });
  } catch (e) {
    next(e);
  }
};


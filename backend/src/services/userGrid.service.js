import pool from '../config/database.js';
import User from '../models/User.model.js';
import PayrollCompensationLevel from '../models/PayrollCompensationLevel.model.js';
import UserAdminDoc from '../models/UserAdminDoc.model.js';
import StorageService from './storage.service.js';
import { saveMilestoneDates } from './lifecycle.service.js';
import { sanitizePsychologyTodayUrl } from '../utils/psychologyTodayUrl.js';
import {
  USER_GRID_FIELDS,
  getUserGridField,
  parseUserGridFieldKeys,
  defaultUserGridFieldKeys
} from '../constants/userGridFields.js';

const BACKOFFICE = new Set(['admin', 'super_admin', 'support']);
const MAX_BULK = 200;

const USER_COL_BY_KEY = {
  email: 'email',
  preferred_name: 'preferred_name',
  title: 'title',
  credential: 'credential',
  service_focus: 'service_focus',
  languages_spoken: 'languages_spoken',
  personal_email: 'personal_email',
  personal_phone: 'personal_phone',
  work_phone: 'work_phone',
  psychology_today_url: 'psychology_today_url',
  status: 'status',
  role: 'role',
  provider_start_date: 'provider_start_date',
  employment_type: 'employment_type',
  department: 'department',
  termination_date: 'termination_date',
  created_at: 'created_at',
  has_hiring_access: 'has_hiring_access',
  has_outreach_access: 'has_outreach_access',
  has_games_access: 'has_games_access',
  has_supervisor_privileges: 'has_supervisor_privileges',
  has_provider_access: 'has_provider_access',
  company_card_enabled: 'company_card_enabled',
  skill_builder_eligible: 'skill_builder_eligible',
  provider_accepting_new_clients: 'provider_accepting_new_clients',
  is_hourly_worker: 'is_hourly_worker',
  medcancel_rate_schedule: 'medcancel_rate_schedule'
};

function toYmd(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function toBoolDisplay(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function assertGridAccess(reqUser) {
  const role = String(reqUser?.role || '').toLowerCase();
  if (!BACKOFFICE.has(role)) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
}

async function accessibleAgencyIds(reqUser) {
  const role = String(reqUser?.role || '').toLowerCase();
  if (role === 'super_admin') return null;
  const agencies = await User.getAgencies(reqUser.id);
  return (agencies || []).map((a) => Number(a.id)).filter(Boolean);
}

async function resolveScopeAgencyIds(reqUser, { agencyId, organizationId }) {
  const accessible = await accessibleAgencyIds(reqUser);
  const requestedOrgId = parseInt(organizationId, 10);
  const requestedAgencyId = parseInt(agencyId, 10);

  if (accessible && accessible.length === 0) return [];

  const allowed = accessible ? new Set(accessible) : null;
  const isAllowed = (id) => !allowed || allowed.has(Number(id));

  if (Number.isFinite(requestedOrgId) && requestedOrgId > 0) {
    return isAllowed(requestedOrgId) ? [requestedOrgId] : [];
  }
  if (Number.isFinite(requestedAgencyId) && requestedAgencyId > 0) {
    if (!isAllowed(requestedAgencyId)) return [];
    const scope = new Set([requestedAgencyId]);
    try {
      const [children] = await pool.execute(
        `SELECT organization_id FROM organization_affiliations
          WHERE is_active = TRUE AND agency_id = ?`,
        [requestedAgencyId]
      );
      for (const row of children || []) {
        const childId = Number(row.organization_id);
        if (childId && isAllowed(childId)) scope.add(childId);
      }
    } catch {
      /* ignore */
    }
    return [...scope];
  }
  return accessible;
}

function personaSql(persona) {
  const p = String(persona || 'employees');
  if (p === 'school_staff') return ` AND u.role = 'school_staff'`;
  if (p === 'guardians') return ` AND u.role = 'client_guardian'`;
  return ` AND u.role NOT IN ('school_staff', 'kiosk', 'client_guardian')`;
}

async function listBaseUsers({ reqUser, agencyId, organizationId, persona, includeArchived, roleFilter }) {
  const scopeIds = await resolveScopeAgencyIds(reqUser, { agencyId, organizationId });
  if (Array.isArray(scopeIds) && scopeIds.length === 0) return [];

  const params = [];
  let sql = `
    SELECT
      u.id, u.first_name, u.last_name, u.email, u.role, u.status, u.is_active, u.created_at,
      u.has_supervisor_privileges,
      GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') AS agencies,
      GROUP_CONCAT(DISTINCT a.id ORDER BY a.id SEPARATOR ',') AS agency_ids
    FROM users u
    LEFT JOIN user_agencies ua ON ua.user_id = u.id
    LEFT JOIN agencies a ON a.id = ua.agency_id
    WHERE 1=1
  `;
  if (!includeArchived) {
    sql += ` AND (u.is_archived = FALSE OR u.is_archived IS NULL)`;
  }
  sql += personaSql(persona);

  const requestedRole = String(roleFilter || '').trim().toLowerCase();
  if (requestedRole && requestedRole !== 'school_staff' && requestedRole !== 'client_guardian') {
    sql += ` AND u.role = ?`;
    params.push(requestedRole);
  }

  if (Array.isArray(scopeIds)) {
    sql += ` AND EXISTS (
      SELECT 1 FROM user_agencies ua_scope
      WHERE ua_scope.user_id = u.id AND ua_scope.agency_id IN (${scopeIds.map(() => '?').join(',')})
    )`;
    params.push(...scopeIds);
  }

  sql += ` GROUP BY u.id, u.first_name, u.last_name, u.email, u.role, u.status, u.is_active, u.created_at, u.has_supervisor_privileges
           ORDER BY u.last_name ASC, u.first_name ASC, u.id ASC`;

  const [rows] = await pool.execute(sql, params);
  return rows || [];
}

async function loadMapInChunks(ids, loader) {
  const map = new Map();
  for (const group of chunk(ids, 400)) {
    await loader(group, map);
  }
  return map;
}

async function enrichRows(rows, fields, { agencyId }) {
  const ids = rows.map((r) => Number(r.id)).filter(Boolean);
  if (!ids.length) return rows;

  const needUserCols = fields.filter((f) => USER_COL_BY_KEY[f.key] && f.key !== 'email' && f.key !== 'status' && f.key !== 'role' && f.key !== 'created_at');
  const needInfo = fields.filter((f) => f.source === 'info' || f.source === 'lifecycle');
  const needLogin = fields.some((f) => f.key === 'last_login');
  const needSchools = fields.some((f) => f.key === 'schools' || f.key === 'districts');
  const needPayrollAccess = fields.some((f) => f.source === 'agency_flag');
  const needPayroll = fields.some((f) => f.source === 'payroll' || f.source === 'payroll_flag');
  const needContract = fields.some((f) => f.key === 'admin_doc_contract');

  const extraByUser = new Map();
  const ensure = (id) => {
    if (!extraByUser.has(id)) extraByUser.set(id, {});
    return extraByUser.get(id);
  };

  if (needUserCols.length) {
    const cols = [...new Set(needUserCols.map((f) => USER_COL_BY_KEY[f.key]))];
    await loadMapInChunks(ids, async (group, _map) => {
      const [extra] = await pool.execute(
        `SELECT id, ${cols.map((c) => `\`${c}\``).join(', ')} FROM users WHERE id IN (${group.map(() => '?').join(',')})`,
        group
      );
      for (const row of extra || []) {
        const bag = ensure(Number(row.id));
        for (const f of needUserCols) {
          const col = USER_COL_BY_KEY[f.key];
          let val = row[col];
          if (f.type === 'boolean') val = toBoolDisplay(val);
          else if (f.type === 'date') val = toYmd(val);
          else val = val == null ? '' : String(val);
          bag[f.key] = val;
        }
      }
    });
  }

  if (needInfo.length) {
    const infoKeys = [...new Set(needInfo.map((f) => f.infoKey).filter(Boolean))];
    const dobFallback = infoKeys.includes('date_of_birth');
    const keys = dobFallback ? [...infoKeys, 'provider_birthdate'] : infoKeys;
    await loadMapInChunks(ids, async (group) => {
      const [vals] = await pool.execute(
        `SELECT uiv.user_id, uifd.field_key, uiv.value, uiv.updated_at
           FROM user_info_values uiv
           JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
          WHERE uiv.user_id IN (${group.map(() => '?').join(',')})
            AND uifd.field_key IN (${keys.map(() => '?').join(',')})`,
        [...group, ...keys]
      );
      const latest = new Map();
      for (const row of vals || []) {
        const k = `${row.user_id}:${row.field_key}`;
        const prev = latest.get(k);
        if (!prev || new Date(row.updated_at) > new Date(prev.updated_at)) latest.set(k, row);
      }
      for (const f of needInfo) {
        for (const uid of group) {
          const bag = ensure(uid);
          let row = latest.get(`${uid}:${f.infoKey}`);
          if (!row && f.key === 'date_of_birth') row = latest.get(`${uid}:provider_birthdate`);
          bag[f.key] = toYmd(row?.value || '');
        }
      }
    });
  }

  if (needLogin) {
    await loadMapInChunks(ids, async (group) => {
      const [logins] = await pool.execute(
        `SELECT user_id, MAX(created_at) AS last_login
           FROM user_activity_log
          WHERE action_type = 'login' AND user_id IN (${group.map(() => '?').join(',')})
          GROUP BY user_id`,
        group
      );
      for (const row of logins || []) {
        ensure(Number(row.user_id)).last_login = row.last_login || '';
      }
    });
  }

  if (needSchools) {
    await loadMapInChunks(ids, async (group) => {
      const [orgs] = await pool.execute(
        `SELECT ua.user_id, a.name, LOWER(COALESCE(a.organization_type, '')) AS organization_type
           FROM user_agencies ua
           JOIN agencies a ON a.id = ua.agency_id
          WHERE ua.user_id IN (${group.map(() => '?').join(',')})`,
        group
      );
      const schools = new Map();
      const districts = new Map();
      const push = (map, uid, name) => {
        if (!name) return;
        if (!map.has(uid)) map.set(uid, []);
        map.get(uid).push(name);
      };
      for (const row of orgs || []) {
        const uid = Number(row.user_id);
        const t = String(row.organization_type || '');
        if (t === 'school') push(schools, uid, row.name);
        if (t === 'district' || t === 'school_district') push(districts, uid, row.name);
      }
      for (const uid of group) {
        const bag = ensure(uid);
        bag.schools = (schools.get(uid) || []).join(', ');
        bag.districts = (districts.get(uid) || []).join(', ');
      }
    });
  }

  if (needPayrollAccess) {
    await loadMapInChunks(ids, async (group) => {
      const aid = parseInt(agencyId, 10);
      let sql = `SELECT user_id,
                        MAX(COALESCE(has_payroll_access, 0)) AS has_payroll_access,
                        MAX(COALESCE(has_billing_access, 0)) AS has_billing_access,
                        MAX(COALESCE(can_manage_credentialing, 0)) AS has_credentialing_access
                   FROM user_agencies
                  WHERE user_id IN (${group.map(() => '?').join(',')})`;
      const params = [...group];
      if (Number.isFinite(aid) && aid > 0) {
        sql += ` AND agency_id = ?`;
        params.push(aid);
      }
      sql += ` GROUP BY user_id`;
      const [flags] = await pool.execute(sql, params).catch(() => [[]]);
      for (const row of flags || []) {
        const bag = ensure(Number(row.user_id));
        bag.has_payroll_access = toBoolDisplay(row.has_payroll_access);
        bag.has_billing_access = toBoolDisplay(row.has_billing_access);
        bag.has_credentialing_access = toBoolDisplay(row.has_credentialing_access);
      }
    });
  }

  const payrollAgencyId = parseInt(agencyId, 10);
  if (needPayroll && Number.isFinite(payrollAgencyId) && payrollAgencyId > 0) {
    const [payRows] = await pool.execute(
      `SELECT user_id, category, level, bypass, pay_system_enabled, waive_probation, spanish_bonus_eligible
         FROM payroll_user_compensation_levels
        WHERE agency_id = ? AND user_id IN (${ids.map(() => '?').join(',')})`,
      [payrollAgencyId, ...ids]
    ).catch(() => [[]]);
    const byUser = new Map((payRows || []).map((r) => [Number(r.user_id), r]));
    for (const uid of ids) {
      const bag = ensure(uid);
      const r = byUser.get(uid);
      if (!r) {
        bag.comp_level = '';
        bag.pay_system_enabled = false;
        bag.waive_probation = false;
        bag.spanish_bonus_eligible = false;
        continue;
      }
      bag.comp_level = r.bypass ? `${r.category}:bypass` : `${r.category}:${r.level || ''}`;
      bag.pay_system_enabled = toBoolDisplay(r.pay_system_enabled);
      bag.waive_probation = toBoolDisplay(r.waive_probation);
      bag.spanish_bonus_eligible = toBoolDisplay(r.spanish_bonus_eligible);
    }
  }

  if (needContract) {
    await loadMapInChunks(ids, async (group) => {
      const [docs] = await pool.execute(
        `SELECT d.user_id, d.id, d.original_name, d.title, d.created_at
           FROM user_admin_docs d
          WHERE d.user_id IN (${group.map(() => '?').join(',')})
            AND (d.is_deleted = 0 OR d.is_deleted IS NULL)
            AND (LOWER(COALESCE(d.doc_type, '')) = 'contract' OR LOWER(d.title) LIKE '%contract%')
          ORDER BY d.created_at DESC, d.id DESC`,
        group
      ).catch(() => [[]]);
      const seen = new Set();
      for (const row of docs || []) {
        const uid = Number(row.user_id);
        if (seen.has(uid)) continue;
        seen.add(uid);
        ensure(uid).admin_doc_contract = {
          id: row.id,
          name: row.original_name || row.title || 'Contract'
        };
      }
    });
  }

  return rows.map((r) => {
    const bag = extraByUser.get(Number(r.id)) || {};
    const values = {};
    for (const f of fields) {
      if (f.key === 'agencies') values.agencies = r.agencies || '';
      else if (f.key === 'email') values.email = r.email || '';
      else if (f.key === 'status') values.status = r.status || '';
      else if (f.key === 'role') values.role = r.role || '';
      else if (f.key === 'created_at') values.created_at = r.created_at || '';
      else if (bag[f.key] !== undefined) values[f.key] = bag[f.key];
      else if (f.type === 'boolean') values[f.key] = false;
      else if (f.type === 'file') values[f.key] = null;
      else values[f.key] = '';
    }
    return {
      id: r.id,
      first_name: r.first_name || '',
      last_name: r.last_name || '',
      email: r.email || '',
      role: r.role || '',
      status: r.status || '',
      agencies: r.agencies || '',
      has_supervisor_privileges: toBoolDisplay(r.has_supervisor_privileges),
      values
    };
  });
}

async function compensationOptions(agencyId) {
  const id = parseInt(agencyId, 10);
  if (!Number.isFinite(id) || id <= 0) return [];
  try {
    const levels = await PayrollCompensationLevel.listForAgency(id);
    const labels = await PayrollCompensationLevel.getCategoryLabels(id);
    const out = [{ value: '', label: '—' }];
    for (const row of levels || []) {
      const catLabel = labels[row.category] || (row.category === 1 ? 'Unlicensed' : row.category === 2 ? 'Pre-licensed' : 'Licensed');
      const levelLabel = row.label || `Level ${row.level}`;
      out.push({ value: `${row.category}:${row.level}`, label: `${catLabel} · ${levelLabel}` });
      if (!out.find((o) => o.value === `${row.category}:bypass`)) {
        out.push({ value: `${row.category}:bypass`, label: `${catLabel} · bypass` });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function listUserGrid({ reqUser, agencyId, organizationId, persona, includeArchived, roleFilter, fieldsRaw }) {
  assertGridAccess(reqUser);
  const fieldKeys = parseUserGridFieldKeys(fieldsRaw).length
    ? parseUserGridFieldKeys(fieldsRaw)
    : defaultUserGridFieldKeys(persona);
  const fields = fieldKeys.map((k) => getUserGridField(k)).filter(Boolean);
  const rows = await listBaseUsers({ reqUser, agencyId, organizationId, persona, includeArchived, roleFilter });
  const enriched = await enrichRows(rows, fields, { agencyId });
  const meta = {
    fields: USER_GRID_FIELDS,
    selected: fieldKeys,
    compensationOptions: fields.some((f) => f.key === 'comp_level') ? await compensationOptions(agencyId) : []
  };
  return { rows: enriched, meta };
}

async function upsertInfoValue(userId, fieldKey, raw) {
  const value = raw == null || String(raw).trim() === '' ? null : String(raw).trim();
  const [defRows] = await pool.execute(
    `SELECT id FROM user_info_field_definitions
      WHERE field_key = ? AND agency_id IS NULL
      LIMIT 1`,
    [fieldKey]
  );
  const defId = defRows?.[0]?.id;
  if (!defId) {
    throw Object.assign(new Error(`Unknown profile field: ${fieldKey}`), { status: 400 });
  }
  if (value) {
    await pool.execute(
      `INSERT INTO user_info_values (user_id, field_definition_id, value)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`,
      [userId, defId, value]
    );
  } else {
    await pool.execute(
      `DELETE FROM user_info_values WHERE user_id = ? AND field_definition_id = ?`,
      [userId, defId]
    );
  }
}

async function actorCanEditUser(reqUser, userId) {
  const role = String(reqUser?.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  const scope = await accessibleAgencyIds(reqUser);
  if (!scope?.length) return false;
  const [rows] = await pool.execute(
    `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id IN (${scope.map(() => '?').join(',')}) LIMIT 1`,
    [userId, ...scope]
  );
  return !!(rows && rows[0]);
}

async function applyCell({ reqUser, userId, fieldKey, value, agencyId }) {
  const field = getUserGridField(fieldKey);
  if (!field) throw Object.assign(new Error('Unknown field'), { status: 400 });
  if (field.editable === false) throw Object.assign(new Error('That column is not editable'), { status: 400 });
  if (!(await actorCanEditUser(reqUser, userId))) {
    throw Object.assign(new Error('Access denied for this user'), { status: 403 });
  }

  if (field.source === 'user') {
    if (fieldKey === 'psychology_today_url') {
      await User.update(userId, { psychologyTodayUrl: sanitizePsychologyTodayUrl(value) });
      return;
    }
    if (fieldKey === 'status') {
      const next = String(value || '').trim().toUpperCase() || null;
      await pool.execute(`UPDATE users SET status = ? WHERE id = ? LIMIT 1`, [next, userId]);
      return;
    }
    if (fieldKey === 'role') {
      const actorRole = String(reqUser?.role || '').toLowerCase();
      if (actorRole !== 'admin' && actorRole !== 'super_admin' && actorRole !== 'support') {
        throw Object.assign(new Error('Only admins can change roles'), { status: 403 });
      }
      await User.update(userId, { role: String(value || '').trim() || null });
      return;
    }
    const payload = {};
    const camel = field.userField;
    if (field.type === 'boolean') payload[camel] = !!value && value !== 'false' && value !== '0';
    else payload[camel] = value == null || String(value).trim() === '' ? null : String(value).trim();
    await User.update(userId, payload);
    return;
  }

  if (field.source === 'user_col' && fieldKey === 'termination_date') {
    await pool.execute(
      `UPDATE users SET termination_date = ? WHERE id = ? LIMIT 1`,
      [toYmd(value) || null, userId]
    );
    return;
  }

  if (field.source === 'info') {
    await upsertInfoValue(userId, field.infoKey, toYmd(value));
    return;
  }

  if (field.source === 'lifecycle') {
    await saveMilestoneDates(userId, { [field.infoKey]: toYmd(value) || null });
    return;
  }

  if (field.source === 'agency_flag') {
    const enabled = !!value && value !== 'false' && value !== '0';
    const aid = parseInt(agencyId, 10);
    const scoped = Number.isFinite(aid) && aid > 0;
    if (field.key === 'has_payroll_access') {
      if (scoped) await User.setAgencyPayrollAccess(userId, aid, enabled);
      else await User.setPayrollAccessForAllAgencies(userId, enabled);
      return;
    }
    if (field.key === 'has_billing_access') {
      if (scoped) await User.setAgencyBillingAccess(userId, aid, enabled);
      else await User.setBillingAccessForAllAgencies(userId, enabled);
      return;
    }
    if (field.key === 'has_credentialing_access') {
      if (scoped) await User.setAgencyCredentialingAccess(userId, aid, enabled);
      else {
        await pool.execute(
          'UPDATE user_agencies SET can_manage_credentialing = ? WHERE user_id = ?',
          [enabled ? 1 : 0, userId]
        );
      }
      return;
    }
    throw Object.assign(new Error('Unknown permission column'), { status: 400 });
  }

  if (field.source === 'payroll' || field.source === 'payroll_flag') {
    const aid = parseInt(agencyId, 10);
    if (!Number.isFinite(aid) || aid <= 0) {
      throw Object.assign(new Error('Select an agency to edit payroll columns'), { status: 400 });
    }
    if (fieldKey === 'comp_level') {
      const raw = String(value || '').trim();
      if (!raw) {
        await PayrollCompensationLevel.removeFromUser(aid, userId);
        return;
      }
      const [catRaw, rest] = raw.split(':');
      const category = parseInt(catRaw, 10);
      const bypass = rest === 'bypass';
      const level = bypass ? null : parseInt(rest, 10);
      await PayrollCompensationLevel.assignToUser(aid, userId, category, Number.isFinite(level) ? level : null, reqUser.id, bypass);
      return;
    }
    const flags = {};
    if (fieldKey === 'pay_system_enabled') flags.paySystemEnabled = !!value && value !== 'false' && value !== '0';
    if (fieldKey === 'waive_probation') flags.waiveProbation = !!value && value !== 'false' && value !== '0';
    if (fieldKey === 'spanish_bonus_eligible') flags.spanishBonusEligible = !!value && value !== 'false' && value !== '0';
    await PayrollCompensationLevel.updatePaySystemFlags(aid, userId, flags);
    return;
  }

  throw Object.assign(new Error('That column cannot be saved this way'), { status: 400 });
}

export async function saveUserGridCells({ reqUser, updates, agencyId }) {
  assertGridAccess(reqUser);
  if (!Array.isArray(updates) || !updates.length) {
    throw Object.assign(new Error('No updates provided'), { status: 400 });
  }
  if (updates.length > MAX_BULK) {
    throw Object.assign(new Error(`At most ${MAX_BULK} cell updates at once`), { status: 400 });
  }
  const errors = [];
  let saved = 0;
  for (const item of updates) {
    const userId = parseInt(item?.userId, 10);
    const field = String(item?.field || '').trim();
    if (!userId || !field) {
      errors.push({ userId, field, message: 'Invalid update' });
      continue;
    }
    try {
      await applyCell({ reqUser, userId, fieldKey: field, value: item.value, agencyId });
      saved += 1;
    } catch (err) {
      errors.push({ userId, field, message: err.message || 'Save failed' });
    }
  }
  return { saved, errors };
}

export async function bulkSetUserGridField({ reqUser, userIds, fieldKey, value, agencyId }) {
  assertGridAccess(reqUser);
  const ids = (userIds || []).map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) throw Object.assign(new Error('No users selected'), { status: 400 });
  if (ids.length > MAX_BULK) throw Object.assign(new Error(`Select at most ${MAX_BULK} people`), { status: 400 });
  const updates = ids.map((userId) => ({ userId, field: fieldKey, value }));
  return saveUserGridCells({ reqUser, updates, agencyId });
}

export async function bulkArchiveUsers({ reqUser, userIds }) {
  assertGridAccess(reqUser);
  if (String(reqUser.role || '').toLowerCase() !== 'super_admin') {
    throw Object.assign(new Error('Only super administrators can archive accounts'), { status: 403 });
  }
  const ids = (userIds || []).map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) throw Object.assign(new Error('No users selected'), { status: 400 });
  if (ids.length > MAX_BULK) throw Object.assign(new Error(`Select at most ${MAX_BULK} people`), { status: 400 });
  let archived = 0;
  const errors = [];
  for (const id of ids) {
    try {
      const ok = await User.archive(id, reqUser.id, null);
      if (ok) archived += 1;
      else errors.push({ userId: id, message: 'Not found' });
    } catch (err) {
      errors.push({ userId: id, message: err.message || 'Archive failed' });
    }
  }
  return { archived, errors };
}

export async function bulkDeleteUsers({ reqUser, userIds }) {
  assertGridAccess(reqUser);
  if (String(reqUser.role || '').toLowerCase() !== 'super_admin') {
    throw Object.assign(new Error('Only super administrators can permanently delete users'), { status: 403 });
  }
  const ids = (userIds || []).map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) throw Object.assign(new Error('No users selected'), { status: 400 });
  if (ids.length > MAX_BULK) throw Object.assign(new Error(`Select at most ${MAX_BULK} people`), { status: 400 });
  let deleted = 0;
  const errors = [];
  for (const id of ids) {
    try {
      await User.archive(id, reqUser.id, null);
      const ok = await User.delete(id, []);
      if (ok) deleted += 1;
      else errors.push({ userId: id, message: 'Could not delete (archive first if needed)' });
    } catch (err) {
      errors.push({ userId: id, message: err.message || 'Delete failed' });
    }
  }
  return { deleted, errors };
}

export async function uploadUserGridFile({ reqUser, userId, fieldKey, file }) {
  assertGridAccess(reqUser);
  if (fieldKey !== 'admin_doc_contract') {
    throw Object.assign(new Error('That column does not accept files'), { status: 400 });
  }
  if (!(await actorCanEditUser(reqUser, userId))) {
    throw Object.assign(new Error('Access denied for this user'), { status: 403 });
  }
  if (!file?.buffer) throw Object.assign(new Error('File is required'), { status: 400 });
  const originalName = file.originalname || 'contract.pdf';
  const mimeType = file.mimetype || 'application/octet-stream';
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const safeExt = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
  const filename = `admin-doc-${userId}-${uniqueSuffix}${safeExt}`;
  const storageResult = await StorageService.saveAdminDoc(file.buffer, filename, mimeType);
  const created = await UserAdminDoc.create({
    userId,
    title: 'Contract',
    docType: 'contract',
    noteText: null,
    storagePath: storageResult.relativePath,
    originalName,
    mimeType,
    createdByUserId: reqUser.id
  });
  return { id: created.id, name: originalName };
}

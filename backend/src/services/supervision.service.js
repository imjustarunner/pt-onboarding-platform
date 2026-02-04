import pool from '../config/database.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import UserInfoFieldDefinition from '../models/UserInfoFieldDefinition.model.js';
import NotificationService from './notification.service.js';

const DEFAULT_SUPERVISION_POLICY = {
  enabled: false,
  // UserInfo field key that contains license type text like "LPCC #123" or "LMFT #..."
  licenseFieldKey: 'provider_credential_license_type_number',
  // Credential codes that mark a provider as pre-licensed / supervision-tracked (editable per agency)
  eligibleCredentialCodes: ['LPCC', 'LMFT', 'MFTC', 'LSW', 'SWC'],
  // Requirements
  requiredIndividualHours: 50,
  requiredGroupHours: 50,
  // Schedule after 50 individual hours
  after50Individual: { cadenceWeeks: 2, minutes: 30 },
  // Tier-based schedule guidance before 50 individual hours (editable per agency)
  tierRules: {
    1: { cadenceWeeks: 1, minutes: 30 },
    2: { cadenceWeeks: 2, minutes: 30 },
    3: { cadenceWeeks: 2, minutes: 30 }
  }
};

function parseJson(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

function clampHours(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.round(x * 100) / 100);
}

function normalizeCode(s) {
  return String(s || '').trim().toUpperCase();
}

function extractCredentialCode(licenseText) {
  const t = String(licenseText || '').trim().toUpperCase();
  // grab leading token like LPCC, LMFT, LSW, SWC, MFTC
  const m = /^([A-Z]{2,6})\b/.exec(t);
  return m?.[1] || '';
}

function progressTotal({ individualHours, groupHours, requiredIndividualHours, requiredGroupHours }) {
  const iReq = Number(requiredIndividualHours || 50);
  const gReq = Number(requiredGroupHours || 50);
  const i = Math.min(Math.max(0, Number(individualHours || 0)), iReq);
  const g = Math.min(Math.max(0, Number(groupHours || 0)), gReq);
  return Math.round((i + g) * 100) / 100;
}

async function getAgencyRow(agencyId) {
  const [rows] = await pool.execute(
    `SELECT id, organization_type, supervision_enabled, supervision_policy_json
     FROM agencies
     WHERE id = ?
     LIMIT 1`,
    [agencyId]
  );
  return rows?.[0] || null;
}

export async function getAgencySupervisionPolicy({ agencyId }) {
  const a = await getAgencyRow(agencyId);
  const orgType = String(a?.organization_type || 'agency').toLowerCase();
  const fromDb = parseJson(a?.supervision_policy_json) || {};
  const enabled = a?.supervision_enabled === 1 || a?.supervision_enabled === true || String(a?.supervision_enabled || '') === '1';
  const merged = { ...DEFAULT_SUPERVISION_POLICY, ...(fromDb || {}) };
  merged.enabled = enabled === true;
  merged.eligibleCredentialCodes = Array.isArray(merged.eligibleCredentialCodes) ? merged.eligibleCredentialCodes.map(normalizeCode).filter(Boolean) : [];
  return { agencyId, organizationType: orgType, policy: merged };
}

export async function upsertAgencySupervisionPolicy({ agencyId, enabled, policy }) {
  const current = await getAgencySupervisionPolicy({ agencyId });
  const next = { ...DEFAULT_SUPERVISION_POLICY, ...(policy || {}) };
  next.eligibleCredentialCodes = Array.isArray(next.eligibleCredentialCodes) ? next.eligibleCredentialCodes.map(normalizeCode).filter(Boolean) : [];
  next.enabled = enabled === true;

  // Store enabled as a column; keep json for config.
  await pool.execute(
    `UPDATE agencies
     SET supervision_enabled = ?,
         supervision_policy_json = ?
     WHERE id = ?
     LIMIT 1`,
    [next.enabled ? 1 : 0, JSON.stringify(next), agencyId]
  );

  return getAgencySupervisionPolicy({ agencyId });
}

async function getTierLevelForUser({ agencyId, userId, payrollPeriodId }) {
  const [rows] = await pool.execute(
    `SELECT breakdown
     FROM payroll_summaries
     WHERE agency_id = ? AND user_id = ? AND payroll_period_id = ?
     LIMIT 1`,
    [agencyId, userId, payrollPeriodId]
  );
  const bRaw = rows?.[0]?.breakdown || null;
  let b = bRaw;
  if (typeof bRaw === 'string' && bRaw.trim()) {
    try { b = JSON.parse(bRaw); } catch { b = null; }
  }
  const tier = b?.__tier || null;
  const lvl = Number(tier?.tierLevel || 0);
  return Number.isFinite(lvl) ? lvl : 0;
}

async function getLicenseTextForUser({ agencyId, userId, fieldKey }) {
  const key = String(fieldKey || '').trim();
  if (!key) return '';
  // Find the relevant field definition IDs (platform template + any agency override).
  const [defs] = await pool.execute(
    `SELECT id
     FROM user_info_field_definitions
     WHERE field_key = ?
       AND (agency_id = ? OR agency_id IS NULL)
     ORDER BY (agency_id IS NULL) ASC, is_platform_template DESC
     LIMIT 5`,
    [key, agencyId]
  );
  const ids = (defs || []).map((d) => Number(d.id)).filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) return '';
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT value, field_definition_id
     FROM user_info_values
     WHERE user_id = ?
       AND field_definition_id IN (${placeholders})
     ORDER BY FIELD(field_definition_id, ${placeholders})`,
    [userId, ...ids, ...ids]
  );
  const v = rows?.[0]?.value || '';
  return String(v || '');
}

async function recomputeAccount({ agencyId, userId }) {
  const [rows] = await pool.execute(
    `SELECT
       COALESCE(SUM(individual_hours), 0) AS individualHours,
       COALESCE(SUM(group_hours), 0) AS groupHours
     FROM supervision_period_entries
     WHERE agency_id = ? AND user_id = ?`,
    [agencyId, userId]
  );
  let individualHours = clampHours(rows?.[0]?.individualHours || 0);
  let groupHours = clampHours(rows?.[0]?.groupHours || 0);

  // Baseline hours for prelicensed providers (best-effort; column may not exist yet).
  try {
    const [uaRows] = await pool.execute(
      `SELECT supervision_is_prelicensed, supervision_start_individual_hours, supervision_start_group_hours
       FROM user_agencies
       WHERE agency_id = ? AND user_id = ?
       LIMIT 1`,
      [agencyId, userId]
    );
    const ua = uaRows?.[0] || null;
    const isPre = ua?.supervision_is_prelicensed === 1 || ua?.supervision_is_prelicensed === true || String(ua?.supervision_is_prelicensed || '') === '1';
    if (isPre) {
      individualHours += clampHours(ua?.supervision_start_individual_hours || 0);
      groupHours += clampHours(ua?.supervision_start_group_hours || 0);
    }
  } catch {
    // ignore
  }

  await pool.execute(
    `INSERT INTO supervision_accounts (agency_id, user_id, individual_hours, group_hours)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       individual_hours = VALUES(individual_hours),
       group_hours = VALUES(group_hours),
       updated_at = CURRENT_TIMESTAMP`,
    [agencyId, userId, individualHours, groupHours]
  );
  const [acctRows] = await pool.execute(
    `SELECT *
     FROM supervision_accounts
     WHERE agency_id = ? AND user_id = ?
     LIMIT 1`,
    [agencyId, userId]
  );
  return acctRows?.[0] || null;
}

export async function recomputeSupervisionAccountForUser({ agencyId, userId }) {
  return recomputeAccount({ agencyId, userId });
}

export async function accruePrelicensedSupervisionFromPayroll({ agencyId, payrollPeriodId, uploadedByUserId }) {
  const agencyIdNum = Number(agencyId);
  const periodIdNum = Number(payrollPeriodId);
  if (!agencyIdNum || !periodIdNum) return { ok: false, reason: 'missing_ids' };

  // Fetch policy for notifications; accrual should still happen for prelicensed users.
  const { policy } = await getAgencySupervisionPolicy({ agencyId: agencyIdNum });

  // Latest import for this pay period
  const [impRows] = await pool.execute(
    `SELECT id
     FROM payroll_imports
     WHERE payroll_period_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [periodIdNum]
  );
  const latestImportId = impRows?.[0]?.id || null;
  if (!latestImportId) return { ok: true, skipped: true, reason: 'no_payroll_import' };

  // Pull prelicensed users and accrue supervision codes by DOS >= start_date.
  // Assumes payroll_import_rows.unit_count stores minutes for 99414/99416.
  const [rows] = await pool.execute(
    `SELECT
       pir.user_id,
       SUM(CASE WHEN UPPER(TRIM(pir.service_code)) = '99414' THEN pir.unit_count ELSE 0 END) AS individual_minutes,
       SUM(CASE WHEN UPPER(TRIM(pir.service_code)) = '99416' THEN pir.unit_count ELSE 0 END) AS group_minutes
     FROM payroll_import_rows pir
     JOIN user_agencies ua
       ON ua.agency_id = pir.agency_id
      AND ua.user_id = pir.user_id
     WHERE pir.agency_id = ?
       AND pir.payroll_period_id = ?
       AND pir.payroll_import_id = ?
      AND ua.supervision_is_prelicensed = 1
      AND UPPER(TRIM(pir.service_code)) IN ('99414','99416')
     GROUP BY pir.user_id`,
    [agencyIdNum, periodIdNum, latestImportId]
  );

  const touchedUserIds = new Set();
  for (const r of rows || []) {
    const uid = Number(r.user_id || 0);
    if (!uid) continue;
    const indHours = clampHours(Number(r.individual_minutes || 0) / 60);
    const grpHours = clampHours(Number(r.group_minutes || 0) / 60);
    if (indHours <= 0 && grpHours <= 0) continue;

    await pool.execute(
      `INSERT INTO supervision_period_entries
       (agency_id, payroll_period_id, user_id, individual_hours, group_hours, source_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         individual_hours = VALUES(individual_hours),
         group_hours = VALUES(group_hours),
         source_json = VALUES(source_json),
         created_by_user_id = VALUES(created_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyIdNum,
        periodIdNum,
        uid,
        indHours,
        grpHours,
        JSON.stringify({ source: 'payroll', payrollImportId: latestImportId }),
        uploadedByUserId || null
      ]
    );
    touchedUserIds.add(uid);
  }

  // Recompute totals + trigger notifications for touched users.
  const updatedAccounts = [];
  for (const uid of Array.from(touchedUserIds)) {
    const [prevRows] = await pool.execute(
      `SELECT * FROM supervision_accounts WHERE agency_id = ? AND user_id = ? LIMIT 1`,
      [agencyIdNum, uid]
    );
    const prev = prevRows?.[0] || null;
    const next = await recomputeAccount({ agencyId: agencyIdNum, userId: uid });
    if (next) {
      if (policy?.enabled) {
        await notifyThresholds({ agencyId: agencyIdNum, userId: uid, payrollPeriodId: periodIdNum, prevAcct: prev, nextAcct: next, policy });
      }
      updatedAccounts.push(next);
    }
  }

  return { ok: true, agencyId: agencyIdNum, payrollPeriodId: periodIdNum, updatedUsers: updatedAccounts.length };
}

async function notifyThresholds({
  agencyId,
  userId,
  payrollPeriodId,
  prevAcct,
  nextAcct,
  policy
}) {
  const requiredIndividual = Number(policy.requiredIndividualHours ?? 50);
  const requiredGroup = Number(policy.requiredGroupHours ?? 50);
  const prevInd = Number(prevAcct?.individual_hours || 0);
  const prevGrp = Number(prevAcct?.group_hours || 0);
  const nextInd = Number(nextAcct?.individual_hours || 0);
  const nextGrp = Number(nextAcct?.group_hours || 0);

  const prevTotalProgress = progressTotal({
    individualHours: prevInd,
    groupHours: prevGrp,
    requiredIndividualHours: requiredIndividual,
    requiredGroupHours: requiredGroup
  });
  const nextTotalProgress = progressTotal({
    individualHours: nextInd,
    groupHours: nextGrp,
    requiredIndividualHours: requiredIndividual,
    requiredGroupHours: requiredGroup
  });

  const prevHit50 = prevInd >= requiredIndividual - 1e-9;
  const nextHit50 = nextInd >= requiredIndividual - 1e-9;
  const hit100Prev = prevInd >= requiredIndividual - 1e-9 && prevGrp >= requiredGroup - 1e-9;
  const hit100Next = nextInd >= requiredIndividual - 1e-9 && nextGrp >= requiredGroup - 1e-9;

  const tierLevel = await getTierLevelForUser({ agencyId, userId, payrollPeriodId });
  const tierRule = policy?.tierRules?.[String(tierLevel)] || policy?.tierRules?.[tierLevel] || null;
  const before50 = tierRule || { cadenceWeeks: 2, minutes: 30 };
  const after50 = policy?.after50Individual || { cadenceWeeks: 2, minutes: 30 };

  // 50 individual hours threshold
  if (!prevHit50 && nextHit50 && !nextAcct?.last_notified_individual_50_at) {
    await NotificationService.createSupervisionIndividual50Notification({
      agencyId,
      userId,
      tierLevel,
      recommended: after50,
      totals: { individual: nextInd, group: nextGrp, progress: nextTotalProgress }
    });
    await pool.execute(
      `UPDATE supervision_accounts
       SET last_notified_individual_50_at = CURRENT_TIMESTAMP
       WHERE agency_id = ? AND user_id = ?
       LIMIT 1`,
      [agencyId, userId]
    );
  }

  // 100 total (requires both 50 individual and 50 group)
  if (!hit100Prev && hit100Next && !nextAcct?.last_notified_total_100_at) {
    await NotificationService.createSupervisionTotal100Notification({
      agencyId,
      userId,
      tierLevel,
      recommendedBefore50: before50,
      recommendedAfter50: after50,
      totals: { individual: nextInd, group: nextGrp, progress: nextTotalProgress }
    });

    // Notify supervisors and payroll admins in the agency.
    const supervisorIds = await SupervisorAssignment.getSupervisorIds(userId, agencyId);
    const unique = Array.from(new Set((supervisorIds || []).filter(Boolean)));
    for (const sid of unique) {
      await NotificationService.createSupervisionSuperviseeCompletedNotification({
        agencyId,
        supervisorUserId: sid,
        superviseeUserId: userId,
        totals: { individual: nextInd, group: nextGrp, progress: nextTotalProgress }
      });
    }
    await pool.execute(
      `UPDATE supervision_accounts
       SET last_notified_total_100_at = CURRENT_TIMESTAMP
       WHERE agency_id = ? AND user_id = ?
       LIMIT 1`,
      [agencyId, userId]
    );
  }
}

export function parseSupervisionCsv(buffer) {
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idxEmail = header.indexOf('email');
  const idxUserId = header.indexOf('user_id');
  const idxInd = header.indexOf('individual_hours');
  const idxGrp = header.indexOf('group_hours');
  if (idxEmail < 0 && idxUserId < 0) throw new Error('CSV must include email or user_id column');
  if (idxInd < 0 || idxGrp < 0) throw new Error('CSV must include individual_hours and group_hours columns');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const email = idxEmail >= 0 ? String(cols[idxEmail] || '').trim().toLowerCase() : '';
    const userId = idxUserId >= 0 ? Number(cols[idxUserId] || 0) : 0;
    const individualHours = clampHours(cols[idxInd]);
    const groupHours = clampHours(cols[idxGrp]);
    if (!email && !(userId > 0)) continue;
    rows.push({ email, userId: userId > 0 ? userId : null, individualHours, groupHours, raw: cols });
  }
  return rows;
}

export async function importSupervisionForPeriod({
  agencyId,
  payrollPeriodId,
  uploadedByUserId,
  fileBuffer,
  originalName
}) {
  const { policy } = await getAgencySupervisionPolicy({ agencyId });
  if (!policy.enabled) {
    return { ok: false, status: 409, error: 'Supervision tracking is disabled for this agency.' };
  }

  // Ensure period belongs to agency.
  const [pRows] = await pool.execute(
    `SELECT id, agency_id, period_start, period_end
     FROM payroll_periods
     WHERE id = ?
     LIMIT 1`,
    [payrollPeriodId]
  );
  const p = pRows?.[0] || null;
  if (!p || Number(p.agency_id) !== Number(agencyId)) {
    return { ok: false, status: 404, error: 'Payroll period not found for this agency.' };
  }

  const parsed = parseSupervisionCsv(fileBuffer);

  // Build maps for users in agency
  const [userRows] = await pool.execute(
    `SELECT DISTINCT u.id, u.email, u.username, u.work_email
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id
     WHERE ua.agency_id = ?`,
    [agencyId]
  );
  const byEmail = new Map();
  const byId = new Map();
  for (const u of userRows || []) {
    const id = Number(u.id);
    if (id) byId.set(id, id);
    const e1 = String(u.email || '').trim().toLowerCase();
    const e2 = String(u.username || '').trim().toLowerCase();
    const e3 = String(u.work_email || '').trim().toLowerCase();
    for (const e of [e1, e2, e3]) {
      if (e) byEmail.set(e, id);
    }
  }

  const results = [];
  const touchedUserIds = new Set();
  for (const r of parsed) {
    const uid = r.userId ? byId.get(Number(r.userId)) : byEmail.get(r.email);
    if (!uid) {
      results.push({ row: r, ok: false, reason: 'user_not_found_in_agency' });
      continue;
    }
    // Check credential eligibility (best-effort; if missing license text, still allow but mark).
    const licenseText = await getLicenseTextForUser({ agencyId, userId: uid, fieldKey: policy.licenseFieldKey });
    const code = extractCredentialCode(licenseText);
    const eligibleSet = new Set((policy.eligibleCredentialCodes || []).map(normalizeCode));
    const eligible = code ? eligibleSet.has(code) : false;
    if (!eligible) {
      results.push({ row: r, ok: false, userId: uid, reason: 'not_eligible_credential', credentialCode: code, licenseText });
      continue;
    }

    await pool.execute(
      `INSERT INTO supervision_period_entries
       (agency_id, payroll_period_id, user_id, individual_hours, group_hours, source_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         individual_hours = VALUES(individual_hours),
         group_hours = VALUES(group_hours),
         source_json = VALUES(source_json),
         created_by_user_id = VALUES(created_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        payrollPeriodId,
        uid,
        clampHours(r.individualHours),
        clampHours(r.groupHours),
        JSON.stringify({ originalName, row: r }),
        uploadedByUserId || null
      ]
    );
    touchedUserIds.add(uid);
    results.push({ row: r, ok: true, userId: uid, credentialCode: code });
  }

  // Recompute totals + trigger notifications for touched users.
  const updatedAccounts = [];
  for (const uid of Array.from(touchedUserIds)) {
    const [prevRows] = await pool.execute(
      `SELECT * FROM supervision_accounts WHERE agency_id = ? AND user_id = ? LIMIT 1`,
      [agencyId, uid]
    );
    const prev = prevRows?.[0] || null;
    const next = await recomputeAccount({ agencyId, userId: uid });
    if (next) {
      await notifyThresholds({ agencyId, userId: uid, payrollPeriodId, prevAcct: prev, nextAcct: next, policy });
      updatedAccounts.push(next);
    }
  }

  return {
    ok: true,
    agencyId,
    payrollPeriodId,
    period: { id: p.id, periodStart: String(p.period_start).slice(0, 10), periodEnd: String(p.period_end).slice(0, 10) },
    counts: {
      rows: parsed.length,
      ok: results.filter((x) => x.ok).length,
      skipped: results.filter((x) => !x.ok).length,
      updatedUsers: updatedAccounts.length
    },
    results: results.slice(0, 200) // avoid huge payloads
  };
}

export async function listSupervisionAccounts({ agencyId, limit = 500 }) {
  const lim = Math.max(1, Math.min(2000, Number(limit || 500)));
  const [rows] = await pool.execute(
    `SELECT sa.*, u.first_name, u.last_name, u.email
     FROM supervision_accounts sa
     JOIN users u ON u.id = sa.user_id
     WHERE sa.agency_id = ?
     ORDER BY u.last_name ASC, u.first_name ASC
     LIMIT ${lim}`,
    [agencyId]
  );
  return rows || [];
}


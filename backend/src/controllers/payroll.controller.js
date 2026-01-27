import multer from 'multer';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import crypto from 'crypto';
import config from '../config/config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import PayrollPeriod from '../models/PayrollPeriod.model.js';
import PayrollRate from '../models/PayrollRate.model.js';
import PayrollImport from '../models/PayrollImport.model.js';
import PayrollImportRow from '../models/PayrollImportRow.model.js';
import PayrollStagingOverride from '../models/PayrollStagingOverride.model.js';
import PayrollStageCarryover from '../models/PayrollStageCarryover.model.js';
import PayrollStagePriorUnpaid from '../models/PayrollStagePriorUnpaid.model.js';
import PayrollAdjustment from '../models/PayrollAdjustment.model.js';
import PayrollManualPayLine from '../models/PayrollManualPayLine.model.js';
import PayrollImportMissedAppointment from '../models/PayrollImportMissedAppointment.model.js';
import PayrollTodoTemplate from '../models/PayrollTodoTemplate.model.js';
import PayrollPeriodTodo from '../models/PayrollPeriodTodo.model.js';
import PayrollWizardProgress from '../models/PayrollWizardProgress.model.js';
import PayrollSalaryPosition from '../models/PayrollSalaryPosition.model.js';
import PayrollRateCard from '../models/PayrollRateCard.model.js';
import PayrollServiceCodeRule from '../models/PayrollServiceCodeRule.model.js';
import PayrollSummary from '../models/PayrollSummary.model.js';
import PayrollAdpExportJob from '../models/PayrollAdpExportJob.model.js';
import PayrollPeriodRun from '../models/PayrollPeriodRun.model.js';
import PayrollPeriodRunRow from '../models/PayrollPeriodRunRow.model.js';
import PayrollRateTemplate from '../models/PayrollRateTemplate.model.js';
import PayrollRateTemplateRate from '../models/PayrollRateTemplateRate.model.js';
import Notification from '../models/Notification.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencyMileageRate from '../models/AgencyMileageRate.model.js';
import PayrollMileageClaim from '../models/PayrollMileageClaim.model.js';
import PayrollMedcancelClaim from '../models/PayrollMedcancelClaim.model.js';
import PayrollMedcancelClaimItem from '../models/PayrollMedcancelClaimItem.model.js';
import PayrollReimbursementClaim from '../models/PayrollReimbursementClaim.model.js';
import PayrollCompanyCardExpense from '../models/PayrollCompanyCardExpense.model.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import PayrollPtoAccount from '../models/PayrollPtoAccount.model.js';
import PayrollPtoLedger from '../models/PayrollPtoLedger.model.js';
import PayrollPtoRequest from '../models/PayrollPtoRequest.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import pool from '../config/database.js';
import AdpPayrollService from '../services/adpPayroll.service.js';
import StorageService from '../services/storage.service.js';
import { accruePrelicensedSupervisionFromPayroll } from '../services/supervision.service.js';
import { getUserCompensationForAgency } from '../models/PayrollCompensation.service.js';
import { payrollDefaultsForCode } from '../services/payrollServiceCodeDefaults.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import { getDrivingDistanceMeters, metersToMiles } from '../services/googleDistance.service.js';
import NotificationService from '../services/notification.service.js';
import PayrollNotesAgingService from '../services/payrollNotesAging.service.js';
import { OfficeScheduleReviewService } from '../services/officeScheduleReview.service.js';
import {
  getAgencySupervisionPolicy,
  upsertAgencySupervisionPolicy,
  recomputeSupervisionAccountForUser,
  importSupervisionForPeriod,
  listSupervisionAccounts
} from '../services/supervision.service.js';
import {
  CLAIM_DEADLINE_ERROR_MESSAGE,
  computeSubmissionWindow,
  resolveClaimTimeZone
} from '../utils/payrollSubmissionWindow.js';
import {
  getAgencyPtoPolicy,
  upsertAgencyPtoPolicy,
  ensurePtoAccount,
  getPtoBalances,
  applyStartingBalances,
  computePtoPolicyWarnings,
  approvePtoRequestAndPostToPayroll,
  runPtoAccrualForPostedPeriod
} from '../services/payrollPto.service.js';

const TIER_WINDOW_PERIODS = 6; // 6 pay periods (~90 days)

const DEFAULT_TIER_THRESHOLDS = {
  tier1MinWeekly: 6,
  tier2MinWeekly: 13,
  tier3MinWeekly: 25
};

function coerceDate(v) {
  const d = v instanceof Date ? v : new Date(v || Date.now());
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function parseBool(v) {
  return v === true || v === 1 || v === '1' || String(v || '').toLowerCase() === 'true';
}

function isEffectivelyPostedOrFinalized(period) {
  const st = String(period?.status || '').toLowerCase();
  return (
    st === 'posted' ||
    st === 'finalized' ||
    !!period?.posted_at ||
    !!period?.finalized_at ||
    !!period?.posted_by_user_id ||
    !!period?.finalized_by_user_id
  );
}

async function enforceTargetPeriodDeadline({
  req,
  res,
  agencyId,
  effectiveDateYmd,
  submittedAt,
  targetPayrollPeriodId,
  targetPeriodRow = null,
  officeLocationId = null,
  hardStopPolicy = '60_days'
}) {
  const overrideDeadline = parseBool(req.body?.overrideDeadline);
  if (overrideDeadline && !isAdminRole(req.user?.role)) {
    res.status(403).json({ error: { message: 'overrideDeadline requires admin role' } });
    return { ok: false };
  }

  // Determine timezone (mileage uses office location timezone when available).
  let officeTz = null;
  try {
    if (officeLocationId) {
      const loc = await OfficeLocation.findById(officeLocationId);
      officeTz = loc?.timezone || null;
    }
  } catch { /* best-effort */ }
  const timeZone = resolveClaimTimeZone({ officeLocationTimeZone: officeTz });

  const target = targetPeriodRow || (await PayrollPeriod.findById(targetPayrollPeriodId));
  if (!target) {
    res.status(404).json({ error: { message: 'Target pay period not found' } });
    return { ok: false };
  }
  if (Number(target.agency_id) !== Number(agencyId)) {
    res.status(400).json({ error: { message: 'Target pay period does not belong to this agency' } });
    return { ok: false };
  }

  if (overrideDeadline) return { ok: true, overrideDeadline: true, timeZone, target };

  const win = await computeSubmissionWindow({
    agencyId,
    effectiveDateYmd: String(effectiveDateYmd || '').slice(0, 10),
    submittedAt: coerceDate(submittedAt),
    timeZone,
    hardStopPolicy
  });
  if (!win.ok) {
    res.status(win.status || 409).json({ error: { message: win.errorMessage || CLAIM_DEADLINE_ERROR_MESSAGE } });
    return { ok: false };
  }

  const minStart = String(win.eligibleMinPeriod?.period_start || '').slice(0, 10);
  const targetStart = String(target.period_start || '').slice(0, 10);
  if (minStart && targetStart && targetStart < minStart) {
    res.status(409).json({ error: { message: 'This claim was submitted after the deadline and cannot be added to an earlier pay period.' } });
    return { ok: false };
  }

  return { ok: true, overrideDeadline: false, timeZone, target, win };
}

function normalizeTierThresholds(raw) {
  let obj = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { obj = JSON.parse(raw); } catch { obj = null; }
  }
  const t1 = Number(obj?.tier1MinWeekly ?? DEFAULT_TIER_THRESHOLDS.tier1MinWeekly);
  const t2 = Number(obj?.tier2MinWeekly ?? DEFAULT_TIER_THRESHOLDS.tier2MinWeekly);
  const t3 = Number(obj?.tier3MinWeekly ?? DEFAULT_TIER_THRESHOLDS.tier3MinWeekly);
  if (![t1, t2, t3].every((n) => Number.isFinite(n) && n >= 0)) return { ...DEFAULT_TIER_THRESHOLDS };
  // enforce monotonic
  const a = Math.min(t1, t2, t3);
  const b = Math.max(a, Math.min(t2, t3));
  const c = Math.max(b, t3);
  return { tier1MinWeekly: a, tier2MinWeekly: b, tier3MinWeekly: c };
}

async function getAgencyTierSettings(agencyId) {
  const fallback = { enabled: true, thresholds: { ...DEFAULT_TIER_THRESHOLDS } };
  if (!agencyId) return fallback;
  try {
    const [rows] = await pool.execute(
      `SELECT tier_system_enabled, tier_thresholds_json
       FROM agencies
       WHERE id = ?
       LIMIT 1`,
      [agencyId]
    );
    const r = rows?.[0] || null;
    if (!r) return fallback;
    const enabledRaw = r.tier_system_enabled;
    const enabled =
      enabledRaw === true || enabledRaw === 1 || enabledRaw === '1' || String(enabledRaw).toLowerCase() === 'true';
    const thresholds = normalizeTierThresholds(r.tier_thresholds_json);
    return { enabled, thresholds };
  } catch (e) {
    // Allow older DBs that don't have the new columns yet.
    if (e?.code === 'ER_BAD_FIELD_ERROR') return fallback;
    throw e;
  }
}

async function getEffectiveOtherRateTitles({ agencyId, userId }) {
  const base = { title1: 'Other 1', title2: 'Other 2', title3: 'Other 3' };
  if (!agencyId) return base;
  let agencyRow = null;
  let userRow = null;
  try {
    const [aRows] = await pool.execute(
      `SELECT title_1, title_2, title_3
       FROM payroll_other_rate_titles
       WHERE agency_id = ?
       LIMIT 1`,
      [agencyId]
    );
    agencyRow = aRows?.[0] || null;
  } catch { /* ignore */ }

  if (userId) {
    try {
      const [uRows] = await pool.execute(
        `SELECT title_1, title_2, title_3
         FROM payroll_user_other_rate_titles
         WHERE agency_id = ? AND user_id = ?
         LIMIT 1`,
        [agencyId, userId]
      );
      userRow = uRows?.[0] || null;
    } catch { /* ignore */ }
  }

  const agencyTitles = {
    title1: String(agencyRow?.title_1 || '').trim() || base.title1,
    title2: String(agencyRow?.title_2 || '').trim() || base.title2,
    title3: String(agencyRow?.title_3 || '').trim() || base.title3
  };
  const userOverride = {
    title1: String(userRow?.title_1 || '').trim(),
    title2: String(userRow?.title_2 || '').trim(),
    title3: String(userRow?.title_3 || '').trim()
  };
  return {
    title1: userOverride.title1 || agencyTitles.title1,
    title2: userOverride.title2 || agencyTitles.title2,
    title3: userOverride.title3 || agencyTitles.title3
  };
}

function tierLevelFromWeeklyAvg(weeklyAvg, thresholds = DEFAULT_TIER_THRESHOLDS) {
  const w = Number(weeklyAvg || 0);
  if (!Number.isFinite(w) || w <= 0) return 0;
  const t1 = Number(thresholds?.tier1MinWeekly ?? DEFAULT_TIER_THRESHOLDS.tier1MinWeekly);
  const t2 = Number(thresholds?.tier2MinWeekly ?? DEFAULT_TIER_THRESHOLDS.tier2MinWeekly);
  const t3 = Number(thresholds?.tier3MinWeekly ?? DEFAULT_TIER_THRESHOLDS.tier3MinWeekly);
  if (w >= t3) return 3;
  if (w >= t2) return 2;
  if (w >= t1) return 1;
  return 0;
}

function tierStatusLabel({ tierLevel, prevTierLevel }) {
  // If user was compliant last period, allow grace even if current tier drops to 0.
  if (!tierLevel) return prevTierLevel ? 'Grace' : 'Out of Compliance';
  if (prevTierLevel && tierLevel < prevTierLevel) return 'Grace';
  return 'Current';
}

function fmtTierLabel({ tierLevel, biWeeklyAvg, weeklyAvg, sum }) {
  if (!tierLevel && (!sum || sum <= 0)) return '';
  const name = tierLevel ? `Tier ${tierLevel}` : 'Out of Compliance';
  return `${name} (${Number(biWeeklyAvg || 0).toFixed(1)} bi-wk avg; ${Number(weeklyAvg || 0).toFixed(1)}/wk; sum ${Number(sum || 0).toFixed(1)})`;
}

function fmtTierLabelCurrentPeriod({ tierLevel, biWeeklyTotal, weeklyAvg }) {
  const total = Number(biWeeklyTotal || 0);
  if (!tierLevel && total <= 0) return '';
  const name = tierLevel ? `Tier ${tierLevel}` : 'Out of Compliance';
  return `${name} (${Number(total).toFixed(1)} bi-wk total; ${Number(weeklyAvg || 0).toFixed(1)}/wk)`;
}

async function getImmediatePriorPeriodWeeklyAvg({ agencyId, userId, periodStart, defaultWeeklyAvg }) {
  const fallback = Number(defaultWeeklyAvg || 0);
  const safeFallback = Number.isFinite(fallback) ? fallback : 0;
  if (!agencyId || !userId || !periodStart) return safeFallback;

  // "Prior period" means the bi-weekly period immediately before this one:
  // prior.period_end = current.period_start - 1 day
  const [rows] = await pool.execute(
    `SELECT ps.tier_credits_current
     FROM payroll_periods pp
     LEFT JOIN payroll_summaries ps
       ON ps.payroll_period_id = pp.id
      AND ps.agency_id = ?
      AND ps.user_id = ?
     WHERE pp.agency_id = ?
       AND pp.period_end = DATE_SUB(?, INTERVAL 1 DAY)
     LIMIT 1`,
    [agencyId, userId, agencyId, periodStart]
  );

  const biWeekly = Number(rows?.[0]?.tier_credits_current || 0);
  if (!Number.isFinite(biWeekly) || biWeekly <= 0) return safeFallback;
  return biWeekly / 2;
}

async function getImmediatePriorPeriodTierStats({ agencyId, userId, periodStart, thresholds, defaultBiWeeklyTotal = 0 }) {
  const fallbackBi = Number(defaultBiWeeklyTotal || 0);
  const safeFallbackBi = Number.isFinite(fallbackBi) ? fallbackBi : 0;
  if (!agencyId || !userId || !periodStart) {
    const wk = safeFallbackBi / 2;
    return { biWeeklyTotal: safeFallbackBi, weeklyAvg: wk, tierLevel: tierLevelFromWeeklyAvg(wk, thresholds) };
  }

  const [rows] = await pool.execute(
    `SELECT
        COALESCE(ps.tier_credits_final, ps.tier_credits_current, 0) AS tier_credits_biweekly
     FROM payroll_periods pp
     LEFT JOIN payroll_summaries ps
       ON ps.payroll_period_id = pp.id
      AND ps.agency_id = ?
      AND ps.user_id = ?
     WHERE pp.agency_id = ?
       AND pp.period_end = DATE_SUB(?, INTERVAL 1 DAY)
     LIMIT 1`,
    [agencyId, userId, agencyId, periodStart]
  );

  const biWeekly = Number(rows?.[0]?.tier_credits_biweekly || 0);
  const safeBiWeekly = Number.isFinite(biWeekly) ? biWeekly : safeFallbackBi;
  const weeklyAvg = safeBiWeekly / 2;
  return {
    biWeeklyTotal: safeBiWeekly,
    weeklyAvg,
    tierLevel: tierLevelFromWeeklyAvg(weeklyAvg, thresholds)
  };
}

async function getTierHistorySum({ agencyId, userId, periodEnd, limit }) {
  const lim = Math.max(0, Math.min(24, Number(limit || 0)));
  if (!lim) return { sum: 0, count: 0 };
  const [rows] = await pool.execute(
    `SELECT ps.tier_credits_current
     FROM payroll_summaries ps
     JOIN payroll_periods pp ON ps.payroll_period_id = pp.id
     WHERE ps.agency_id = ?
       AND ps.user_id = ?
       AND pp.status IN ('posted','finalized')
       AND pp.period_end < ?
     ORDER BY pp.period_end DESC
     LIMIT ${lim}`,
    [agencyId, userId, periodEnd]
  );
  const vals = (rows || []).map((r) => Number(r.tier_credits_current || 0)).filter((n) => Number.isFinite(n));
  const sum = vals.reduce((a, b) => a + b, 0);
  return { sum, count: vals.length };
}

function computeEligibleMilesForClaim(claim) {
  if (!claim) return null;
  const type = String(claim.claim_type || '').toLowerCase();
  if (type !== 'school_travel') return null;
  const hs = Number(claim.home_school_roundtrip_miles);
  const ho = Number(claim.home_office_roundtrip_miles);
  if (Number.isFinite(hs) && Number.isFinite(ho)) {
    return Math.round(Math.max(0, hs - ho) * 100) / 100;
  }
  return null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = file.originalname?.toLowerCase?.() || '';
    if (file.mimetype === 'text/csv' || name.endsWith('.csv')) return cb(null, true);
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      name.endsWith('.xlsx') ||
      name.endsWith('.xls')
    ) return cb(null, true);
    cb(new Error('Invalid file type. Only CSV/XLSX files are allowed.'), false);
  }
});

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = file.originalname?.toLowerCase?.() || '';
    const allowedMimes = new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/webp'
    ]);
    if (allowedMimes.has(file.mimetype)) return cb(null, true);
    if (name.endsWith('.pdf') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.gif') || name.endsWith('.webp')) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type. Only PDF or image files are allowed for receipts.'), false);
  }
});

const isAdminRole = (role) => role === 'admin' || role === 'super_admin';

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
}

async function isAgencyFeatureEnabled(agencyId, key, defaultValue = true) {
  try {
    const agency = await Agency.findById(agencyId);
    const flags = parseFeatureFlags(agency?.feature_flags);
    const val = flags?.[key];
    if (val === undefined || val === null) return !!defaultValue;
    return val === true || val === 1 || val === '1' || String(val).toLowerCase() === 'true';
  } catch {
    return !!defaultValue;
  }
}

async function canManagePayrollForAgency({ userId, role, agencyId }) {
  if (!agencyId) return false;
  if (isAdminRole(role)) return true;
  if (role !== 'staff') return false;

  const [rows] = await pool.execute(
    'SELECT has_payroll_access FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
    [userId, agencyId]
  );
  if (!rows || rows.length === 0) return false;
  return rows[0].has_payroll_access === 1 || rows[0].has_payroll_access === true || rows[0].has_payroll_access === '1';
}

async function resolvePayrollAgencyId(agencyIdOrOrgId) {
  const id = agencyIdOrOrgId ? parseInt(agencyIdOrOrgId, 10) : null;
  if (!id) return null;
  try {
    const [rows] = await pool.execute('SELECT id, organization_type FROM agencies WHERE id = ? LIMIT 1', [id]);
    const org = rows?.[0] || null;
    if (!org) return null;
    const t = String(org.organization_type || 'agency').toLowerCase();
    if (t === 'agency') return id;
    const parent = await OrganizationAffiliation.getActiveAgencyIdForOrganization(id);
    return parent ? parseInt(parent, 10) : null;
  } catch {
    return id; // fallback best-effort (older DBs)
  }
}

async function requirePayrollAccess(req, res, agencyIdOrOrgId) {
  const resolvedAgencyId = await resolvePayrollAgencyId(agencyIdOrOrgId);
  if (!resolvedAgencyId) {
    res.status(400).json({ error: { message: 'agencyId is required' } });
    return null;
  }
  const ok = await canManagePayrollForAgency({
    userId: req.user?.id,
    role: req.user?.role,
    agencyId: resolvedAgencyId
  });
  if (!ok) {
    res.status(403).json({ error: { message: 'Payroll access required' } });
    return null;
  }
  return resolvedAgencyId;
}

async function requireTargetUserInAgency({ res, agencyId, targetUserId }) {
  if (!targetUserId) {
    res.status(400).json({ error: { message: 'userId is required' } });
    return false;
  }
  const [rows] = await pool.execute(
    'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
    [targetUserId, agencyId]
  );
  if (!rows || rows.length === 0) {
    res.status(404).json({ error: { message: 'User is not in this organization' } });
    return false;
  }
  return true;
}

function requireSuperAdmin(req, res) {
  if (req.user?.role !== 'super_admin') {
    res.status(403).json({ error: { message: 'Super admin required' } });
    return false;
  }
  return true;
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z\\s]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function parseHumanNameToFirstLast(raw) {
  const s = String(raw || '').trim();
  if (!s) return { first: '', last: '' };
  // Handle "Last, First" (optionally with middle names)
  if (s.includes(',')) {
    const [lastPart, firstPart] = s.split(',').map((x) => String(x || '').trim());
    const firstTokens = normalizeName(firstPart).split(' ').filter(Boolean);
    const lastTokens = normalizeName(lastPart).split(' ').filter(Boolean);
    const first = firstTokens[0] || '';
    const last = lastTokens[lastTokens.length - 1] || '';
    return { first, last };
  }
  // Handle "First Middle Last" => use first + last
  const parts = normalizeName(s).split(' ').filter(Boolean);
  if (parts.length < 2) return { first: '', last: '' };
  return { first: parts[0], last: parts[parts.length - 1] };
}

function nameKeyCandidates(raw) {
  const { first, last } = parseHumanNameToFirstLast(raw);
  const out = new Set();
  if (first && last) {
    out.add(normalizeName(`${first} ${last}`));
    out.add(normalizeName(`${last} ${first}`));
  }
  // Also include the fully-normalized raw string (helps if last_name has multiple tokens)
  const full = normalizeName(raw);
  if (full) out.add(full);
  return Array.from(out).filter(Boolean);
}

function addNameKeyToIds(map, key, userId) {
  if (!key || !userId) return;
  const arr = map.get(key) || [];
  if (!arr.includes(userId)) arr.push(userId);
  map.set(key, arr);
}

function resolveUserIdForProviderName(nameToIds, providerName) {
  const keys = nameKeyCandidates(providerName);
  if (!keys.length) return null;
  const ids = new Set();
  for (const k of keys) {
    for (const id of nameToIds.get(k) || []) ids.add(Number(id));
  }
  return ids.size === 1 ? Array.from(ids)[0] : null; // null if none or ambiguous
}

function titleCaseWords(s) {
  return String(s || '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function ensureUserForProviderName({ agencyId, providerName }) {
  const { first: firstRaw, last: lastRaw } = parseHumanNameToFirstLast(providerName);
  if (!firstRaw || !lastRaw) return null;

  // Avoid creating obvious non-person placeholders / footer labels.
  const deny = new Set(['unassigned', 'unknown', 'total', 'grand total', 'summary']);
  const denyKey = normalizeName(providerName);
  if (denyKey && deny.has(denyKey)) return null;

  const first = titleCaseWords(firstRaw);
  const last = titleCaseWords(lastRaw);

  // Try to find an existing user by name first (across agencies), then attach to this agency.
  const existing = await User.findByName(first, last);
  if (Array.isArray(existing) && existing.length > 0) {
    const matchInAgency = existing.find((u) => {
      const ids = String(u.agency_ids || '')
        .split(',')
        .map((x) => parseInt(x, 10))
        .filter((x) => Number.isFinite(x));
      return ids.includes(parseInt(agencyId, 10));
    });
    const chosen = matchInAgency || existing[0];
    await User.assignToAgency(chosen.id, agencyId);
    return { userId: chosen.id, firstName: chosen.first_name || first, lastName: chosen.last_name || last };
  }

  // Create a minimal user (email can be null in this codebase) and attach to the agency.
  const created = await User.create({
    role: 'provider',
    status: 'pending',
    firstName: first,
    lastName: last,
    email: null,
    passwordHash: null
  });
  await User.assignToAgency(created.id, agencyId);
  return { userId: created.id, firstName: created.first_name || first, lastName: created.last_name || last };
}

function normalizeNoteStatus(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return 'NO_NOTE';
  const lower = s.toLowerCase();
  if (lower.includes('draft')) return 'DRAFT';
  if (lower.includes('final') || lower.includes('signed') || lower.includes('complete') || lower.includes('yes')) return 'FINALIZED';
  if (lower.includes('no note') || lower === 'no_note' || lower === 'nonote') return 'NO_NOTE';
  return 'NO_NOTE';
}

function parseServiceDate(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // MM-DD-YY (e.g., 01-20-26). Interpret YY as 20YY.
  const mmddyy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
  if (mmddyy) {
    const mm = mmddyy[1].padStart(2, '0');
    const dd = mmddyy[2].padStart(2, '0');
    const yy = Number(mmddyy[3]);
    const yyyy = 2000 + (Number.isFinite(yy) ? yy : 0);
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // MM/DD/YYYY
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const mm = us[1].padStart(2, '0');
    const dd = us[2].padStart(2, '0');
    const d = new Date(`${us[3]}-${mm}-${dd}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Fallback Date.parse
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatMmDdYy(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (!dt || Number.isNaN(dt.getTime())) return '';
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const yy = String(dt.getUTCFullYear() % 100).padStart(2, '0');
  return `${mm}-${dd}-${yy}`;
}

function formatYmd(d) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function previousFridayOnOrBefore(d) {
  // JS: Sunday=0 ... Friday=5
  const day = d.getUTCDay();
  const diff = (day - 5 + 7) % 7;
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() - diff);
  return out;
}

async function guessExistingPayrollPeriodByMajorityDates({ agencyId, dates }) {
  const safeDates = (dates || []).filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));
  if (!agencyId || safeDates.length === 0) {
    return { period: null, stats: { totalDates: safeDates.length, matchedDates: 0 } };
  }

  const periods = await PayrollPeriod.listByAgency(agencyId, { limit: 500, offset: 0 });
  if (!periods || periods.length === 0) {
    return { period: null, stats: { totalDates: safeDates.length, matchedDates: 0 } };
  }

  const countsById = new Map();
  let matchedDates = 0;
  for (const dt of safeDates) {
    const ymd = formatYmd(dt);
    const p = (periods || []).find((pp) => {
      const start = String(pp?.period_start || '').slice(0, 10);
      const end = String(pp?.period_end || '').slice(0, 10);
      return start && end && start <= ymd && ymd <= end;
    });
    if (!p?.id) continue;
    matchedDates += 1;
    countsById.set(p.id, (countsById.get(p.id) || 0) + 1);
  }

  let best = null;
  let bestCount = 0;
  for (const p of periods || []) {
    const c = countsById.get(p.id) || 0;
    if (c > bestCount) {
      best = p;
      bestCount = c;
    } else if (c === bestCount && c > 0 && best) {
      // Tie-breaker: pick the latest period_end (more recent).
      const a = String(p?.period_end || '').slice(0, 10);
      const b = String(best?.period_end || '').slice(0, 10);
      if (a && b && a > b) best = p;
    }
  }

  return {
    period: bestCount > 0 ? best : null,
    stats: { totalDates: safeDates.length, matchedDates, bestCount }
  };
}

function parsePayrollRows(records, opts = {}) {
  const rowsArr = Array.isArray(records) ? records : [];
  if (!rowsArr.length) return { rows: [], missedAppointmentsPaidInFull: [] };
  const rowNumberBase = Number.isFinite(Number(opts?.rowNumberBase)) ? Number(opts.rowNumberBase) : 2;
  const missedAppointmentsPaidInFull = [];

  const detectedHeaders = Array.from(
    new Set(
      Object.keys(rowsArr[0] || {})
        .map((k) => normalizeHeaderKey(k))
        .filter(Boolean)
    )
  );

  const firstMatchByRegexes = (normalizedRow, regexes) => {
    const entries = Object.entries(normalizedRow || {});
    for (const [k, v] of entries) {
      if (!k) continue;
      for (const rx of regexes || []) {
        if (rx?.test(k)) {
          if (v !== undefined && v !== null && String(v).trim() !== '') return v;
        }
      }
    }
    return '';
  };

  const parsed = rowsArr.map((row, idx) => {
    const normalized = {};
    for (const [k, v] of Object.entries(row || {})) {
      const nk = normalizeHeaderKey(k);
      if (!nk) continue;
      normalized[nk] = v;
    }

    const providerName =
      normalized['provider name'] ||
      normalized['provider'] ||
      normalized['provider full name'] ||
      normalized['rendering provider full name'] ||
      normalized['rendering provider'] ||
      normalized['rendering provider name'] ||
      normalized['clinician'] ||
      normalized['clinician name'] ||
      normalized['clinician_name'] ||
      normalized['rendering clinician'] ||
      normalized['rendering clinician name'] ||
      normalized['therapist'] ||
      normalized['therapist name'] ||
      normalized['employee name'] ||
      normalized['staff name'] ||
      normalized['staff'] ||
      normalized['name'] ||
      firstMatchByRegexes(normalized, [
        /provider.*name/,
        /rendering.*provider/,
        /clinician.*name/,
        /rendering.*clinician/,
        /therapist.*name/,
        /employee.*name/,
        /staff.*name/
      ]) ||
      '';

    // Patient first name column (report header: "First Name").
    const firstNameCol =
      normalized['first name'] ||
      normalized['firstname'] ||
      normalized['first'] ||
      firstMatchByRegexes(normalized, [/^first\\s*name$/]) ||
      '';

    let serviceCode =
      normalized['service code'] ||
      normalized['service'] ||
      normalized['code'] ||
      normalized['cpt'] ||
      normalized['cpt code'] ||
      normalized['hcpcs'] ||
      normalized['hcpcs code'] ||
      normalized['procedure code'] ||
      normalized['procedure'] ||
      firstMatchByRegexes(normalized, [
        /service.*code/,
        /procedure.*code/,
        /hcpcs/,
        /cpt.*code/,
        /\bcode\b/
      ]) ||
      '';

    // Some reports include refunds/payments/etc. We only want appointment rows.
    // If the report has a "Type" column:
    // - allow Type === "Appointment" into payroll rows
    // - capture Type containing "Missed Appointment" as display-only flags when Paid in Full
    const hasTypeCol = Object.prototype.hasOwnProperty.call(normalized, 'type');
    const typeStr = String(hasTypeCol ? normalized['type'] : '').trim().toLowerCase();
    const isMissedType = hasTypeCol && typeStr.includes('missed appointment');
    if (hasTypeCol && typeStr !== 'appointment' && !isMissedType) return null;

    const noteStatusRaw =
      normalized['note status'] ||
      normalized['note_status'] ||
      '';

    const apptType =
      normalized['appt type'] ||
      normalized['appointment type'] ||
      normalized['appointment'] ||
      normalized['appt_type'] ||
      '';

    const paidStatus =
      normalized['patient balance status'] ||
      normalized['patient_balance_status'] ||
      normalized['paid status'] ||
      normalized['paid_status'] ||
      normalized['paid'] ||
      '';

    const amountRaw =
      normalized['patient amount paid'] ||
      normalized['patient_amount_paid'] ||
      normalized['amount'] ||
      normalized['amount collected'] ||
      normalized['amount_collected'] ||
      normalized['collected'] ||
      '';

    // Display-only: "Missed Appointment" rows (Type column), Paid in Full (Patient Balance Status)
    if (isMissedType) {
      // Amount (currency-safe)
      let patientAmountPaid = Number(String(amountRaw).replace(/[$,()]/g, '').trim());
      if (!Number.isFinite(patientAmountPaid)) patientAmountPaid = 0;
      patientAmountPaid = Math.abs(patientAmountPaid);
      const paidStatusStr = String(paidStatus || '');
      if (paidStatusStr.toLowerCase().includes('paid in full') && patientAmountPaid > 0) {
        missedAppointmentsPaidInFull.push({
          clinicianName: String(providerName || '').trim(),
          patientAmountPaid
        });
      }
      return null;
    }

    const serviceDateRaw =
      normalized['date of service'] ||
      normalized['date of service dos'] ||
      normalized['service date'] ||
      normalized['dos'] ||
      normalized['dos date'] ||
      normalized['date of svc'] ||
      normalized['date of service date'] ||
      normalized['date'] ||
      normalized['appointment date'] ||
      normalized['session date'] ||
      firstMatchByRegexes(normalized, [
        /date.*service/,
        /service.*date/,
        /\bdos\b/,
        /appointment.*date/,
        /session.*date/
      ]) ||
      '';

    const unitsRaw =
      normalized['units'] ||
      normalized['unit count'] ||
      normalized['count'] ||
      normalized['qty'] ||
      normalized['quantity'] ||
      normalized['duration'] ||
      normalized['minutes'] ||
      normalized['mins'] ||
      '';

    // Some reports can contain blank/footer rows; ignore rows with no identifying fields at all.
    if (!providerName && !serviceCode) return null;
    // Some exports include intermittent footer/summary rows where one key field is blank.
    // Prefer skipping those instead of failing the entire import.
    if (!providerName || !serviceCode) return null;

    // Sanitize units: default empty/0 to 1.0 (counts the row).
    let unitCount = Number(String(unitsRaw).replace(/[^0-9.\\-]/g, '')) || 0;
    if (!unitCount || unitCount <= 0.0001) unitCount = 1;

    const apptTypeStr = String(apptType || '');
    const noteStatus = normalizeNoteStatus(noteStatusRaw);

    // Extra fields used only for fingerprinting (do NOT persist raw values).
    const clinicianNpi = normalized['clinician npi'] || normalized['npi'] || '';
    const supervisorNpi = normalized['supervisor npi'] || '';
    const billingMethod = normalized['billing method'] || '';
    const paymentType = normalized['payment type'] || '';
    const pos = normalized['pos'] || '';
    const location = normalized['location'] || '';
    const rate = normalized['rate'] || '';
    const documentsCreated = normalized['documents created'] || '';
    const mod1 = normalized['modifier code 1'] || normalized['modifier 1'] || '';
    const mod2 = normalized['modifier code 2'] || normalized['modifier 2'] || '';
    const mod3 = normalized['modifier code 3'] || normalized['modifier 3'] || '';
    const mod4 = normalized['modifier code 4'] || normalized['modifier 4'] || '';

    return {
      providerName: String(providerName).trim(),
      patientFirstName: firstNameCol ? String(firstNameCol).trim() : '',
      serviceCode: String(serviceCode).trim(),
      serviceDate: parseServiceDate(serviceDateRaw),
      unitCount,
      noteStatus,
      // IMPORTANT: Do not persist the raw billing report row or non-essential fields.
      // We only keep a small fingerprintFields object for hashing during import.
      fingerprintFields: {
        apptType: apptTypeStr ? String(apptTypeStr).trim() : '',
        clinicianNpi: String(clinicianNpi || '').trim(),
        supervisorNpi: String(supervisorNpi || '').trim(),
        billingMethod: String(billingMethod || '').trim(),
        paymentType: String(paymentType || '').trim(),
        pos: String(pos || '').trim(),
        location: String(location || '').trim(),
        rate: String(rate || '').trim(),
        documentsCreated: String(documentsCreated || '').trim(),
        modifier1: String(mod1 || '').trim(),
        modifier2: String(mod2 || '').trim(),
        modifier3: String(mod3 || '').trim(),
        modifier4: String(mod4 || '').trim()
      }
    };
  });
  const out = parsed.filter(Boolean);
  if (!out.length) {
    if (missedAppointmentsPaidInFull.length) {
      return { rows: [], missedAppointmentsPaidInFull };
    }
    const hdr = detectedHeaders.slice(0, 40).join(', ');
    const err = new Error(
      `No rows found in report. Detected columns: ${hdr || '(none)'}`
    );
    err.rowNumber = null;
    err.detectedHeaders = detectedHeaders;
    err.exampleExpected = [
      'provider name',
      'clinician name',
      'rendering provider full name',
      'service code',
      'cpt code',
      'hcpcs code',
      'date of service',
      'dos',
      'units'
    ];
    throw err;
  }
  return { rows: out, missedAppointmentsPaidInFull };
}

function ymdOrEmpty(d) {
  if (!d) return '';
  try {
    // Use UTC date to avoid timezone drift.
    const dt = d instanceof Date ? d : new Date(d);
    if (!dt || Number.isNaN(dt.getTime())) return '';
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

// Deterministic, human-readable row key (v4). No hashing/secrets.
// Built only from stable report columns:
// - DOS (MM-DD-YY)
// - Service Code
// - Clinician Name (report column)
// - Patient First Name (report column "First Name"; if missing, best-effort derived from clinician string)
//
// IMPORTANT:
// - Do NOT include volatile fields (units, note status, payable flags, rates, etc.)
// - Do NOT include userId (can change when matching improves)
function computeRowKeyV4({ agencyId, serviceCode, serviceDate, clinicianName, patientFirstName }) {
  const norm = (v) =>
    String(v ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  const normCode = (v) =>
    String(v ?? '')
      .trim()
      .replace(/\s+/g, '')
      .toUpperCase();

  const dos = formatMmDdYy(serviceDate);
  const code = normCode(serviceCode);
  const clin = norm(clinicianName);
  const fn = norm(patientFirstName || parseHumanNameToFirstLast(clinicianName).first);
  return `v4|agency:${agencyId}|dos:${dos}|code:${code}|clin:${clin}|fn:${fn}`;
}

// Backward-compatible alias: legacy code still calls this name.
function computeRowFingerprint({ agencyId, clinicianName, firstName, patientFirstName, serviceCode, serviceDate }) {
  return computeRowKeyV4({
    agencyId,
    serviceCode,
    serviceDate,
    clinicianName,
    patientFirstName: patientFirstName ?? firstName ?? ''
  });
}

function compareToolBucket(noteStatus) {
  const st = String(noteStatus || '').trim().toUpperCase();
  if (st === 'NO_NOTE') return 'NO_NOTE';
  if (st === 'DRAFT') return 'DRAFT';
  return 'FINALIZED';
}

function buildRowKeyAggregateIndex({ agencyId, parsedRows }) {
  const byKey = new Map();
  for (const r of parsedRows || []) {
    if (!r) continue;
    const providerName = String(r.providerName || '').trim();
    const serviceCode = String(r.serviceCode || '').trim();
    const serviceDate = r.serviceDate || null;
    if (!providerName || !serviceCode || !serviceDate) continue;
    const patientFirstName = String(r.patientFirstName || '').trim();
    const rowKey = computeRowKeyV4({
      agencyId,
      serviceCode,
      serviceDate,
      clinicianName: providerName,
      patientFirstName
    });
    const units = Number(r.unitCount || 0);
    if (!Number.isFinite(units) || units <= 0) continue;
    const bucket = compareToolBucket(r.noteStatus);
    if (!byKey.has(rowKey)) {
      byKey.set(rowKey, {
        rowKey,
        providerName,
        patientFirstName,
        serviceCode,
        dos: formatMmDdYy(serviceDate),
        ymd: formatYmd(serviceDate),
        unitsByStatus: { NO_NOTE: 0, DRAFT: 0, FINALIZED: 0 }
      });
    }
    const agg = byKey.get(rowKey);
    agg.unitsByStatus[bucket] = Number((Number(agg.unitsByStatus[bucket] || 0) + units).toFixed(2));
  }
  return byKey;
}

function parsePayrollFile(buffer, originalName) {
  const empty = { rows: [], missedAppointmentsPaidInFull: [] };
  const name = String(originalName || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) return empty;
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

    const scoreHeaderRow = (cells) => {
      const keys = (cells || []).map((c) => normalizeHeaderKey(c)).filter(Boolean);
      const has = (rx) => keys.some((k) => rx.test(k));
      let score = 0;
      if (has(/service.*code/) || has(/cpt.*code/) || has(/hcpcs/)) score += 2;
      if ((has(/provider/) || has(/clinician/) || has(/therapist/) || has(/employee/) || has(/staff/)) && has(/name/)) score += 2;
      if (has(/date.*service/) || has(/\bdos\b/) || has(/service.*date/)) score += 1;
      if (has(/\bunits?\b/) || has(/minutes?/) || has(/duration/) || has(/qty/) || has(/quantity/)) score += 1;
      return score;
    };

    let bestIdx = null;
    let bestScore = -1;
    const maxScan = Math.min(80, Array.isArray(matrix) ? matrix.length : 0);
    for (let i = 0; i < maxScan; i++) {
      const row = matrix[i];
      if (!Array.isArray(row) || row.length < 2) continue;
      const sc = scoreHeaderRow(row);
      if (sc > bestScore) {
        bestScore = sc;
        bestIdx = i;
      }
    }

    // If the sheet has title rows above the real header, locate the best header row
    // and build objects manually.
    if (bestIdx !== null && bestScore >= 3) {
      const headers = (matrix[bestIdx] || []).map((h) => String(h ?? '').trim());
      const records = [];
      for (const row of (matrix || []).slice(bestIdx + 1)) {
        if (!Array.isArray(row)) continue;
        const allBlank = row.every((c) => String(c ?? '').trim() === '');
        if (allBlank) continue;
        const obj = {};
        for (let col = 0; col < headers.length; col++) {
          const key = headers[col];
          if (!key) continue;
          obj[key] = row[col] ?? '';
        }
        records.push(obj);
      }
      return parsePayrollRows(records, { rowNumberBase: bestIdx + 2 });
    }

    // Fallback: treat the first row as headers (default XLSX behavior).
    const records = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    return parsePayrollRows(records, { rowNumberBase: 2 });
  }

  // CSV: some exports include title rows above the real header. Parse as arrays first,
  // find the best header row, then map subsequent rows into objects.
  const parseMatrixWithDelimiter = (delimiter) => {
    try {
      return parse(buffer, {
        columns: false,
        delimiter,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true
      });
    } catch {
      return [];
    }
  };

  // Many payroll exports are TSV (tabs) even when users call them "CSV".
  const candidateDelimiters = [',', '\t', ';', '|'];
  const matrices = candidateDelimiters.map((d) => ({ delimiter: d, rows: parseMatrixWithDelimiter(d) }));

  const scoreHeaderRow = (cells) => {
    const keys = (cells || []).map((c) => normalizeHeaderKey(c)).filter(Boolean);
    const has = (rx) => keys.some((k) => rx.test(k));
    let score = 0;
    if (has(/service.*code/) || has(/cpt.*code/) || has(/hcpcs/)) score += 2;
    if ((has(/provider/) || has(/clinician/) || has(/therapist/) || has(/employee/) || has(/staff/)) && has(/name/)) score += 2;
    if (has(/date.*service/) || has(/\bdos\b/) || has(/service.*date/)) score += 1;
    if (has(/\bunits?\b/) || has(/minutes?/) || has(/duration/) || has(/qty/) || has(/quantity/)) score += 1;
    return score;
  };

  const chooseBestMatrix = () => {
    let best = { delimiter: ',', rows: [] };
    let bestScore = -1;
    let bestAvgCols = 0;
    for (const m of matrices) {
      const rows = Array.isArray(m.rows) ? m.rows : [];
      if (!rows.length) continue;

      // Prefer delimiters that actually split into multiple columns.
      const sample = rows.slice(0, Math.min(25, rows.length)).filter((r) => Array.isArray(r));
      const avgCols = sample.length ? (sample.reduce((acc, r) => acc + (r?.length || 0), 0) / sample.length) : 0;

      // Score the best header row found within this matrix.
      let localBest = -1;
      const maxScan = Math.min(80, rows.length);
      for (let i = 0; i < maxScan; i++) {
        const row = rows[i];
        if (!Array.isArray(row) || row.length < 2) continue;
        localBest = Math.max(localBest, scoreHeaderRow(row));
      }

      // Primary: header score. Secondary: avg column count (helps TSV vs comma).
      if (localBest > bestScore || (localBest === bestScore && avgCols > bestAvgCols)) {
        best = m;
        bestScore = localBest;
        bestAvgCols = avgCols;
      }
    }
    return { ...best, bestScore };
  };

  const picked = chooseBestMatrix();
  const rows = Array.isArray(picked.rows) ? picked.rows : [];

  if (rows.length) {
    let bestIdx = null;
    let bestScore = -1;
    const maxScan = Math.min(80, rows.length);
    for (let i = 0; i < maxScan; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length < 2) continue;
      const sc = scoreHeaderRow(row);
      if (sc > bestScore) {
        bestScore = sc;
        bestIdx = i;
      }
    }
    if (bestIdx !== null && bestScore >= 3) {
      const headers = (rows[bestIdx] || []).map((h) => String(h ?? '').trim());
      const records = [];
      for (const row of rows.slice(bestIdx + 1)) {
        if (!Array.isArray(row)) continue;
        const allBlank = row.every((c) => String(c ?? '').trim() === '');
        if (allBlank) continue;
        const obj = {};
        for (let col = 0; col < headers.length; col++) {
          const key = headers[col];
          if (!key) continue;
          obj[key] = row[col] ?? '';
        }
        records.push(obj);
      }
      return parsePayrollRows(records, { rowNumberBase: bestIdx + 2 });
    }
  }

  // Fallback: standard CSV with header row first.
  const records = parse(buffer, {
    columns: true,
    delimiter: picked?.delimiter || ',',
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true
  });
  return parsePayrollRows(records, { rowNumberBase: 2 });
}

function normalizeHeaderKey(key) {
  return String(key || '')
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .trim()
    .replace(/[_\-]+/g, ' ')
    .replace(/[^a-z0-9 ?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstNonEmpty(normalizedRow, keys) {
  for (const k of keys) {
    const v = normalizedRow[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function parseBoolish(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return false;
  if (['true', 't', 'yes', 'y', '1'].includes(s)) return true;
  if (['false', 'f', 'no', 'n', '0'].includes(s)) return false;
  return false;
}

function toRateNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s.replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function parseRateSheetRows(records, headerMapping = null) {
  const META = new Set([
    'employee name',
    'employee',
    'name',
    'provider name',
    'clinician name',
    'adp file',
    'adp file #',
    'adp file number',
    'adp',
    'status',
    'is variable',
    'is variable?',
    'variable',
    'direct rate',
    'indirect rate'
  ]);

  const serviceCodes = new Set();
  const rows = (records || [])
    .map((row, idx) => {
      const normalized = {};
      for (const [k, v] of Object.entries(row || {})) normalized[normalizeHeaderKey(k)] = v;

      const employeeName = firstNonEmpty(
        normalized,
        [
          headerMapping?.employeeNameHeader,
          'employee name',
          'provider name',
          'clinician name',
          'name'
        ].filter(Boolean)
      );
      if (!employeeName) return null;

      const statusRaw = firstNonEmpty(normalized, [headerMapping?.statusHeader, 'status'].filter(Boolean));
      const status = String(statusRaw || '').trim();
      const isVariable = parseBoolish(
        firstNonEmpty(normalized, [headerMapping?.isVariableHeader, 'is variable?', 'is variable', 'variable'].filter(Boolean))
      );

      const directRate = toRateNum(firstNonEmpty(normalized, [headerMapping?.directRateHeader, 'direct rate'].filter(Boolean)));
      const indirectRate = toRateNum(firstNonEmpty(normalized, [headerMapping?.indirectRateHeader, 'indirect rate'].filter(Boolean)));

      // Capture all service-code headers, even if the cell is blank.
      for (const header of Object.keys(row || {})) {
        const key = normalizeHeaderKey(header);
        if (!key || META.has(key)) continue;
        const serviceCode = String(header || '').trim();
        if (serviceCode) serviceCodes.add(serviceCode);
      }

      const perCodeRates = [];
      for (const [header, value] of Object.entries(row || {})) {
        const key = normalizeHeaderKey(header);
        if (!key || META.has(key)) continue;
        const rateAmount = toRateNum(value);
        if (rateAmount === null) continue;
        const serviceCode = String(header || '').trim();
        if (!serviceCode) continue;
        perCodeRates.push({ serviceCode, rateAmount });
      }

      return {
        rowNumber: idx + 2, // header row is row 1
        employeeName: String(employeeName).trim(),
        status,
        isVariable,
        directRate,
        indirectRate,
        perCodeRates
      };
    })
    .filter(Boolean);

  return { rows, serviceCodes: Array.from(serviceCodes) };
}

async function suggestRateSheetHeaderMapping({ normalizedHeaders }) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) return null;

  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const headers = (normalizedHeaders || []).map((h) => String(h || '').trim()).filter(Boolean);
  if (!headers.length) return null;

  const prompt = `
You are helping map CSV/XLSX pay matrix (rate sheet) headers to our internal fields.

Given this list of normalized headers (lowercase, spaces, no punctuation):
${JSON.stringify(headers)}

Return ONLY valid JSON with these keys:
{
  "employeeNameHeader": string|null,
  "statusHeader": string|null,
  "isVariableHeader": string|null,
  "directRateHeader": string|null,
  "indirectRateHeader": string|null
}

Rules:
- Values must be one of the provided normalized headers, or null.
- Pick the best match; be conservative.
`;

  const r = await model.generateContent(prompt);
  const text = r?.response?.text?.() || r?.response?.text || '';
  const raw = String(text || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const jsonText = raw.slice(start, end + 1);
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object') return null;
  return parsed;
}

function normalizeRateSheetFingerprint({ isVariable, directRate, indirectRate, perCodeRates }) {
  const direct = Number.isFinite(Number(directRate)) ? Number(directRate) : 0;
  const indirect = Number.isFinite(Number(indirectRate)) ? Number(indirectRate) : 0;
  const perCode = perCodeRatesFingerprint(perCodeRates || []);
  const v = isVariable ? 1 : 0;
  return `v=${v}|direct=${direct.toFixed(4)}|indirect=${indirect.toFixed(4)}|rates=${perCode}`;
}

function parseRateSheetFile(buffer, originalName, headerMapping = null) {
  const name = String(originalName || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) return { rows: [], serviceCodes: [] };
    const sheet = wb.Sheets[sheetName];
    const records = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    return parseRateSheetRows(records, headerMapping);
  }

  // CSV: detect delimiter (comma vs semicolon) from first non-empty line
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');
  const firstLine = (text.split(/\r?\n/).find((l) => String(l || '').trim()) || '').trim();
  const delim = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    delimiter: delim
  });
  return parseRateSheetRows(records, headerMapping);
}

function readRateSheetRecords(buffer, originalName) {
  const name = String(originalName || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) return [];
    const sheet = wb.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  }

  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');
  const firstLine = (text.split(/\r?\n/).find((l) => String(l || '').trim()) || '').trim();
  const delim = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    delimiter: delim
  });
  return Array.isArray(records) ? records : [];
}

async function ensureServiceCodeRulesExist({ agencyId, serviceCodes }) {
  const codes = Array.from(new Set((serviceCodes || []).map((c) => String(c || '').trim()).filter(Boolean)));
  if (!codes.length) return;

  // Only insert missing; do not overwrite existing rule configuration.
  const placeholders = codes.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
  const params = [];
  for (const code of codes) {
    const d = payrollDefaultsForCode(code);
    params.push(
      agencyId,
      code,
      String(d?.category || 'direct'),
      Number.isFinite(Number(d?.otherSlot)) ? Number(d.otherSlot) : 1,
      1.0,
      d?.durationMinutes === null || d?.durationMinutes === undefined ? null : Number(d.durationMinutes),
      1,
      Number.isFinite(Number(d?.payDivisor)) ? Number(d.payDivisor) : 1, // pay_divisor
      Number.isFinite(Number(d?.creditValue)) ? Number(d.creditValue) : 0, // credit_value
      1 // show_in_rate_sheet (admins can hide later)
    );
  }
  await pool.execute(
    `INSERT IGNORE INTO payroll_service_code_rules
     (agency_id, service_code, category, other_slot, unit_to_hour_multiplier, duration_minutes, counts_for_tier, pay_divisor, credit_value, show_in_rate_sheet)
     VALUES ${placeholders}`,
    params
  );
}

function perCodeRatesFingerprint(perCodeRates) {
  const norm = (v) => String(v || '').trim();
  const entries = (perCodeRates || [])
    .map((r) => ({
      serviceCode: norm(r.serviceCode ?? r.service_code),
      rateAmount: r.rateAmount ?? r.rate_amount,
      rateUnit: norm(r.rateUnit ?? r.rate_unit) || 'per_unit'
    }))
    .filter((x) => x.serviceCode && Number.isFinite(Number(x.rateAmount)))
    .map((x) => ({
      serviceCode: x.serviceCode,
      rateAmount: Number(x.rateAmount),
      rateUnit: x.rateUnit
    }))
    .sort((a, b) => a.serviceCode.localeCompare(b.serviceCode));

  // Stable string for exact-match comparisons; ignores rate card/template metadata fields.
  return entries.map((x) => `${x.serviceCode}|${x.rateAmount.toFixed(4)}|${x.rateUnit}`).join(';');
}

async function findMatchingRateTemplateByPerCodeRates({ agencyId, perCodeRates }) {
  const desired = perCodeRatesFingerprint(perCodeRates);

  const [templates] = await pool.execute(
    `SELECT id, name
     FROM payroll_rate_templates
     WHERE agency_id = ?`,
    [agencyId]
  );
  if (!templates?.length) return null;

  const [rows] = await pool.execute(
    `SELECT template_id, service_code, rate_amount, rate_unit
     FROM payroll_rate_template_rates
     WHERE agency_id = ?`,
    [agencyId]
  );

  const ratesByTemplate = new Map();
  for (const r of rows || []) {
    const tid = r.template_id;
    const arr = ratesByTemplate.get(tid) || [];
    arr.push({
      serviceCode: r.service_code,
      rateAmount: r.rate_amount,
      rateUnit: r.rate_unit || 'per_unit'
    });
    ratesByTemplate.set(tid, arr);
  }

  for (const t of templates || []) {
    const fp = perCodeRatesFingerprint(ratesByTemplate.get(t.id) || []);
    if (fp === desired) return { id: t.id, name: t.name };
  }

  return null;
}

export const createPayrollPeriod = async (req, res, next) => {
  try {
    const { agencyId, label, periodStart, periodEnd } = req.body || {};
    if (!agencyId || !periodStart || !periodEnd) {
      return res.status(400).json({ error: { message: 'agencyId, periodStart, and periodEnd are required' } });
    }
    const agencyIdNum = parseInt(agencyId);
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyIdNum);
    if (!resolvedAgencyId) return;
    const p = await PayrollPeriod.create({
      agencyId: resolvedAgencyId,
      label: label || `${periodStart} to ${periodEnd}`,
      periodStart,
      periodEnd,
      createdByUserId: req.user.id
    });
    try {
      await PayrollPeriodTodo.ensureMaterializedForPeriod({ payrollPeriodId: p?.id, agencyId: resolvedAgencyId });
    } catch {
      // best-effort
    }
    res.status(201).json(p);
  } catch (e) {
    next(e);
  }
};

export const ensureFuturePayrollPeriods = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : (req.body?.agencyId ? parseInt(req.body.agencyId, 10) : null);
    const monthsRaw = Number(req.body?.months ?? 6);
    const months = Number.isFinite(monthsRaw) && monthsRaw > 0 ? Math.min(24, monthsRaw) : 6;
    const pastRaw = Number(req.body?.pastPeriods ?? 0);
    const pastPeriods = Number.isFinite(pastRaw) && pastRaw > 0 ? Math.min(12, Math.floor(pastRaw)) : 0;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    // Sat→Fri biweekly: end on the most recent Friday on/before today, start 13 days earlier.
    const now = new Date();
    let end = previousFridayOnOrBefore(now);
    let start = new Date(end.getTime());
    start.setUTCDate(start.getUTCDate() - 13);

    // Optionally ensure some past draft periods exist so admins can import historical payroll.
    // We create the N periods immediately before the current period.
    let pastCreated = 0;
    let pastChecked = 0;
    if (pastPeriods > 0) {
      let pEnd = new Date(end.getTime());
      pEnd.setUTCDate(pEnd.getUTCDate() - 14);
      let pStart = new Date(pEnd.getTime());
      pStart.setUTCDate(pStart.getUTCDate() - 13);
      for (let i = 0; i < pastPeriods; i++) {
        pastChecked += 1;
        const periodStart = formatYmd(pStart);
        const periodEnd = formatYmd(pEnd);
        const label = `${periodStart} to ${periodEnd}`;
        const existing = await PayrollPeriod.findByAgencyAndDates({ agencyId, periodStart, periodEnd });
        if (!existing) {
          await PayrollPeriod.create({
            agencyId,
            label,
            periodStart,
            periodEnd,
            createdByUserId: req.user?.id
          });
          pastCreated += 1;
        }
        // Move back one more biweekly period.
        pEnd = new Date(pEnd.getTime());
        pEnd.setUTCDate(pEnd.getUTCDate() - 14);
        pStart = new Date(pEnd.getTime());
        pStart.setUTCDate(pStart.getUTCDate() - 13);
      }
    }

    // Approx horizon: N months ≈ N*31 days forward from current period end.
    const horizonEnd = new Date(end.getTime());
    horizonEnd.setUTCDate(horizonEnd.getUTCDate() + Math.ceil(months * 31));

    let created = 0;
    let checked = 0;
    while (end.getTime() <= horizonEnd.getTime()) {
      checked += 1;
      const periodStart = formatYmd(start);
      const periodEnd = formatYmd(end);
      const label = `${periodStart} to ${periodEnd}`;

      const existing = await PayrollPeriod.findByAgencyAndDates({
        agencyId,
        periodStart,
        periodEnd
      });
      if (!existing) {
        const createdPeriod = await PayrollPeriod.create({
          agencyId,
          label,
          periodStart,
          periodEnd,
          createdByUserId: req.user?.id
        });
        try {
          await PayrollPeriodTodo.ensureMaterializedForPeriod({ payrollPeriodId: createdPeriod?.id, agencyId });
        } catch {
          // best-effort (tables may not exist yet)
        }
        created += 1;
      }

      // Advance one biweekly period.
      start = new Date(start.getTime());
      start.setUTCDate(start.getUTCDate() + 14);
      end = new Date(end.getTime());
      end.setUTCDate(end.getUTCDate() + 14);
    }

    res.json({ ok: true, agencyId, months, pastPeriods, checked, created, pastChecked, pastCreated });
  } catch (e) {
    next(e);
  }
};

export const listPayrollPeriods = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyId);
    if (!resolvedAgencyId) return;
    const rows = await PayrollPeriod.listByAgency(resolvedAgencyId, { limit: 100, offset: 0 });
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const getPayrollPeriod = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(id);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;
    const rows = await PayrollImportRow.listForPeriod(id);
    const summaries = await PayrollSummary.listForPeriod(id);
    let missedAppointmentsPaidInFull = [];
    try {
      missedAppointmentsPaidInFull = await PayrollImportMissedAppointment.listAggregatedForPeriod({
        payrollPeriodId: id,
        agencyId: period.agency_id
      });
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      missedAppointmentsPaidInFull = [];
    }
    res.json({ period, rows, summaries, missedAppointmentsPaidInFull });
  } catch (e) {
    next(e);
  }
};

export const patchPayrollImportRow = async (req, res, next) => {
  try {
    const rowId = parseInt(req.params.rowId);
    const draftPayable = req.body?.draftPayable;
    const unitCount = req.body?.unitCount;
    const processed = req.body?.processed;
    if (!rowId) return res.status(400).json({ error: { message: 'rowId is required' } });
    const wantsDraftPayable = !(draftPayable === undefined || draftPayable === null);
    const wantsUnitCount = !(unitCount === undefined || unitCount === null);
    const wantsProcessed = !(processed === undefined || processed === null);
    if (!wantsDraftPayable && !wantsUnitCount && !wantsProcessed) {
      return res.status(400).json({ error: { message: 'Provide at least one of: draftPayable, unitCount, processed' } });
    }
    const row = await PayrollImportRow.findById(rowId);
    if (!row) return res.status(404).json({ error: { message: 'Import row not found' } });

    const period = await PayrollPeriod.findById(row.payroll_period_id);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;
    const st = String(period.status || '').toLowerCase();
    const isLocked = st === 'finalized' || st === 'posted';
    const allowPostedProcessing =
      isLocked &&
      (wantsUnitCount || wantsProcessed) &&
      String(req.query?.allowPostedProcessing || '').toLowerCase() === 'true';
    if (isLocked && !allowPostedProcessing) {
      return res.status(409).json({ error: { message: 'Pay period is posted/finalized' } });
    }

    // Draft payable toggle (draft rows only)
    if (wantsDraftPayable) {
      if (isLocked) {
        return res.status(409).json({ error: { message: 'Pay period is posted/finalized' } });
      }
      if (String(row.note_status || '').toUpperCase() !== 'DRAFT') {
        return res.status(409).json({ error: { message: 'Only DRAFT rows can be toggled' } });
      }
      await PayrollImportRow.updateDraftPayable({ rowId, draftPayable: !!draftPayable });
    }

    // Minutes + done processing for required rows
    if (wantsUnitCount || wantsProcessed) {
      if (!Number(row.requires_processing)) {
        return res.status(409).json({ error: { message: 'This row does not require processing' } });
      }
      const codeKey = String(row.service_code || '').trim().toUpperCase();
      if (codeKey !== 'H0031' && codeKey !== 'H0032') {
        return res.status(409).json({ error: { message: 'Only H0031/H0032 rows can be processed' } });
      }

      if (wantsUnitCount) {
        const next = Number(unitCount);
        if (!Number.isFinite(next) || next <= 0) {
          return res.status(400).json({ error: { message: 'unitCount must be a positive number (minutes)' } });
        }
        await PayrollImportRow.updateUnitCount({ rowId, unitCount: next });
      }

      if (wantsProcessed) {
        const wantsDone = !!processed;
        await PayrollImportRow.updateProcessed({
          rowId,
          processedAt: wantsDone ? new Date() : null,
          processedByUserId: wantsDone ? req.user.id : null
        });
      }
    }

    // If payroll has already been run, recompute summaries so results stay visible and accurate.
    if (st === 'ran') {
      await recomputeSummariesFromStaging({
        payrollPeriodId: period.id,
        agencyId: period.agency_id,
        periodStart: period.period_start,
        periodEnd: period.period_end
      });
      const updated = await PayrollPeriod.findById(period.id);
      const summaries = await PayrollSummary.listForPeriod(period.id);
      return res.json({ ok: true, period: updated, summaries });
    }

    // If the period is locked (posted/finalized), allow ONLY the H0031/H0032 processing workflow
    // when explicitly requested. Do not change period status or delete summaries.
    if (isLocked) {
      const updated = await PayrollPeriod.findById(period.id);
      return res.json({
        ok: true,
        period: updated,
        warning: 'Updated raw processing on a posted/finalized period; payroll totals/status were not recomputed.'
      });
    }

    // Otherwise mark staged and clear any prior summaries.
    await pool.execute('DELETE FROM payroll_summaries WHERE payroll_period_id = ?', [period.id]);
    await pool.execute(
      `UPDATE payroll_periods
       SET status = 'staged',
           ran_at = NULL,
           ran_by_user_id = NULL
       WHERE id = ?`,
      [period.id]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export const downloadPayrollRawCsv = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    const rows = await PayrollImportRow.listForPeriod(payrollPeriodId);
    // Minimal, non-sensitive export for auditing (no client/insurer/diagnosis/comments).
    const header = [
      'Clinician Name',
      'Service Code',
      'Date of Service',
      'Note Status',
      'Draft Payable',
      'Units',
      'Row Fingerprint (stable)'
    ];
    const lines = [header.join(',')];
    for (const r of rows || []) {
      const clinicianName = r.provider_name || `${r.first_name || ''} ${r.last_name || ''}`.trim();
      lines.push(
        [
          csvEscape(clinicianName),
          csvEscape(r.service_code),
          csvEscape(r.service_date || ''),
          csvEscape(r.note_status),
          (r.note_status === 'DRAFT' ? (Number(r.draft_payable) ? 'true' : 'false') : ''),
          r.unit_count ?? '',
          csvEscape(r.row_fingerprint || computeRowFingerprint({
            agencyId: period.agency_id,
            clinicianName: r.provider_name || clinicianName,
            patientFirstName: r.patient_first_name || '',
            serviceCode: r.service_code,
            serviceDate: r.service_date
          }))
        ].join(',')
      );
    }

    const filename = `payroll-raw-period-${payrollPeriodId}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(lines.join('\n'));
  } catch (e) {
    next(e);
  }
};

export const downloadPayrollExportCsv = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    const st = String(period.status || '').toLowerCase();
    if (!(st === 'ran' || st === 'posted' || st === 'finalized')) {
      return res.status(409).json({ error: { message: 'You must Run Payroll before exporting' } });
    }

    const summaries = await PayrollSummary.listForPeriod(payrollPeriodId);
    const [adjRows] = await pool.execute(
      `SELECT * FROM payroll_adjustments WHERE payroll_period_id = ?`,
      [payrollPeriodId]
    );
    const adjByUserId = new Map();
    for (const a of adjRows || []) {
      adjByUserId.set(Number(a.user_id), a);
    }

    // Export format (payroll processor output):
    // - Sorted by provider last name
    // - Direct/Indirect hours + rates
    // - Individual adjustment amounts
    // - Taxable vs non-taxable totals
    // Export format (processor output):
    // - Sorted by provider last name
    // - Direct/Indirect hours + rates
    // - Only bonus, mileage, and salary shown as explicit add-ons
    // - Totals included for reconciliation
    const header = [
      'Employee',
      'Direct Hours',
      'Direct Pay Rate',
      'Indirect Hours',
      'Indirect Pay Rate',
      'Bonus (Taxable)',
      'Mileage (Non-taxable)',
      'Tuition Reimbursement (Non-taxable)',
      'Salary Override (Taxable)',
      'Taxable Total',
      'Non-taxable Total',
      'Total Pay',
      'Pay Period Start',
      'Pay Period End'
    ];

    const lines = [header.join(',')];
    const fmt2 = (n) => (Number(n || 0).toFixed(2));
    const safeNum = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

    const sorted = (summaries || []).slice().sort((a, b) => {
      const al = String(a?.last_name || '').trim().toLowerCase();
      const bl = String(b?.last_name || '').trim().toLowerCase();
      const af = String(a?.first_name || '').trim().toLowerCase();
      const bf = String(b?.first_name || '').trim().toLowerCase();
      return al.localeCompare(bl) || af.localeCompare(bf) || (Number(a?.user_id || 0) - Number(b?.user_id || 0));
    });

    for (const s of sorted) {
      const userId = Number(s.user_id);
      const employee = `${s.last_name || ''}, ${s.first_name || ''}`.trim().replace(/^, /, '').replace(/, $/, '');

      // Break down service pay by bucket from the run snapshot.
      // (This is what the provider will see posted; we use it for processor output too.)
      let breakdown = s.breakdown || null;
      if (typeof breakdown === 'string') {
        try { breakdown = JSON.parse(breakdown); } catch { breakdown = null; }
      }

      let directAmt = 0;
      let indirectAmt = 0;
      let otherAmt = 0;
      let directCreditsFromRows = 0;
      let indirectCreditsFromRows = 0;
      let otherCreditsFromRows = 0;

      if (breakdown && typeof breakdown === 'object') {
        for (const [code, vRaw] of Object.entries(breakdown)) {
          if (String(code).startsWith('__')) continue;
          const v = vRaw && typeof vRaw === 'object' ? vRaw : {};
          const bucketRaw = v.bucket ? String(v.bucket).trim().toLowerCase() : '';
          const cat = String(v.category || '').trim().toLowerCase();
          const bucket =
            (bucketRaw === 'direct' || bucketRaw === 'indirect' || bucketRaw === 'other' || bucketRaw === 'flat')
              ? bucketRaw
              : ((cat === 'indirect' || cat === 'admin' || cat === 'meeting') ? 'indirect'
                : (cat === 'other' || cat === 'tutoring') ? 'other'
                  : (cat === 'mileage' || cat === 'bonus' || cat === 'reimbursement' || cat === 'other_pay') ? 'flat'
                    : 'direct');
          const amt = safeNum(v.amount || 0);
          const creditsHours = safeNum(v.hours || 0);
          if (bucket === 'indirect') {
            indirectAmt += amt;
            indirectCreditsFromRows += creditsHours;
          } else if (bucket === 'other' || bucket === 'flat') {
            otherAmt += amt;
            otherCreditsFromRows += creditsHours;
          } else {
            directAmt += amt;
            directCreditsFromRows += creditsHours;
          }
        }
      }

      const directHours = safeNum(directCreditsFromRows || s.direct_hours || 0);
      const indirectHours = safeNum(indirectCreditsFromRows || s.indirect_hours || 0);
      const directRate = directHours > 0 ? (directAmt / directHours) : 0;
      const indirectRate = indirectHours > 0 ? (indirectAmt / indirectHours) : 0;

      // Adjustments: prefer breakdown-derived values (includes auto claims + manual lines + other-slot hours).
      const adjFromBreakdown = breakdown?.__adjustments || null;
      const adjFallback = adjByUserId.get(userId) || {};
      const mileage = safeNum(adjFromBreakdown?.mileageAmount ?? adjFallback?.mileage_amount ?? 0);
      const reimbursement = safeNum(adjFromBreakdown?.reimbursementAmount ?? adjFallback?.reimbursement_amount ?? 0);
      const tuition = safeNum(adjFromBreakdown?.tuitionReimbursementAmount ?? adjFallback?.tuition_reimbursement_amount ?? 0);
      const bonus = safeNum(adjFromBreakdown?.bonusAmount ?? adjFallback?.bonus_amount ?? 0);
      const salary = safeNum(adjFromBreakdown?.salaryAmount ?? adjFallback?.salary_amount ?? 0);

      const nonTaxableTotal = safeNum(adjFromBreakdown?.nonTaxableAmount ?? (mileage + reimbursement + tuition));
      const taxableTotal = safeNum(adjFromBreakdown?.taxableAdjustmentsAmount ?? (safeNum(s.adjustments_amount || 0) - nonTaxableTotal));
      const totalPay = safeNum(s.total_amount || 0);

      lines.push(
        [
          csvEscape(employee),
          fmt2(directHours),
          fmt2(directRate),
          fmt2(indirectHours),
          fmt2(indirectRate),
          fmt2(bonus),
          fmt2(mileage),
          fmt2(tuition),
          fmt2(salary),
          fmt2(taxableTotal),
          fmt2(nonTaxableTotal),
          fmt2(totalPay),
          csvEscape(String(period.period_start || '')),
          csvEscape(String(period.period_end || ''))
        ].join(',')
      );
    }

    const filename = `payroll-export-period-${payrollPeriodId}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(lines.join('\n'));
  } catch (e) {
    next(e);
  }
};

export const upsertRate = async (req, res, next) => {
  try {
    const { agencyId, userId, serviceCode, rateAmount, effectiveStart, effectiveEnd } = req.body || {};
    if (!agencyId || !userId || !serviceCode || rateAmount === undefined) {
      return res.status(400).json({ error: { message: 'agencyId, userId, serviceCode, and rateAmount are required' } });
    }
    const agencyIdNum = parseInt(agencyId);
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyIdNum);
    if (!resolvedAgencyId) return;
    const r = await PayrollRate.upsert({
      agencyId: resolvedAgencyId,
      userId: parseInt(userId),
      serviceCode: String(serviceCode).trim(),
      rateAmount: Number(rateAmount),
      // Rate unit is agency-driven via payroll_service_code_rules.pay_rate_unit.
      // Keep per-user rates stored as per_unit for backward compatibility.
      rateUnit: 'per_unit',
      effectiveStart: effectiveStart || null,
      effectiveEnd: effectiveEnd || null
    });
    res.json(r);
  } catch (e) {
    next(e);
  }
};

export const listRatesForUser = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    const userId = req.query.userId ? parseInt(req.query.userId) : null;
    if (!agencyId || !userId) return res.status(400).json({ error: { message: 'agencyId and userId are required' } });
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyId);
    if (!resolvedAgencyId) return;
    const rows = await PayrollRate.listForUser(resolvedAgencyId, userId);
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const deleteRateForUser = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : (req.body?.agencyId ? parseInt(req.body.agencyId) : null);
    const userId = req.query.userId ? parseInt(req.query.userId) : (req.body?.userId ? parseInt(req.body.userId) : null);
    const serviceCode = req.query.serviceCode || req.body?.serviceCode || null;
    if (!agencyId || !userId || !serviceCode) {
      return res.status(400).json({ error: { message: 'agencyId, userId, and serviceCode are required' } });
    }
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyId);
    if (!resolvedAgencyId) return;

    const deleted = await PayrollRate.deleteForUserCode({
      agencyId: resolvedAgencyId,
      userId,
      serviceCode: String(serviceCode).trim()
    });
    res.json({ ok: true, deleted });
  } catch (e) {
    next(e);
  }
};

async function recomputeSummaries({ payrollPeriodId, agencyId, periodStart, periodEnd }) {
  // Load import rows
  const rows = await PayrollImportRow.listForPeriod(payrollPeriodId);
  const byUser = new Map();

  for (const r of rows) {
    if (!r.user_id) continue;
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id).push(r);
  }

  for (const [userId, userRows] of byUser.entries()) {
    const breakdown = {};
    let totalUnits = 0;
    let subtotal = 0;

    for (const row of userRows) {
      const code = row.service_code;
      const units = Number(row.unit_count) || 0;
      const rate = await PayrollRate.findBestRate({
        agencyId,
        userId,
        serviceCode: code,
        asOf: periodStart
      });
      const rateAmount = rate ? Number(rate.rate_amount) : 0;
      // Per-user rate_unit is deprecated; treat "flat" the same as per_unit.
      const lineAmount = units * rateAmount;

      totalUnits += units;
      subtotal += lineAmount;

      if (!breakdown[code]) breakdown[code] = { units: 0, rateAmount, amount: 0 };
      breakdown[code].units += units;
      breakdown[code].rateAmount = rateAmount;
      breakdown[code].amount += lineAmount;
    }

    const totalAmount = subtotal; // adjustments can be added later
    await PayrollSummary.upsert({
      payrollPeriodId,
      agencyId,
      userId,
      totalUnits,
      subtotalAmount: subtotal,
      adjustmentsAmount: 0,
      totalAmount,
      breakdown
    });
  }
}

async function getEffectiveStagingAggregates(payrollPeriodId) {
  const aggregates = await PayrollImportRow.listAggregatedForPeriod(payrollPeriodId);
  const overrides = await PayrollStagingOverride.listForPeriod(payrollPeriodId);
  const carryovers = await PayrollStageCarryover.listForPeriod(payrollPeriodId);
  const overrideKey = new Map();
  for (const o of overrides || []) {
    overrideKey.set(`${o.user_id}:${o.service_code}`, o);
  }
  const carryKey = new Map();
  for (const c of carryovers || []) {
    carryKey.set(`${c.user_id}:${c.service_code}`, Number(c.carryover_finalized_units || 0));
  }

  const out = [];
  const aggKeys = new Set();
  for (const a of aggregates || []) {
    aggKeys.add(`${a.user_id}:${a.service_code}`);
  }
  for (const a of aggregates || []) {
    if (!a.user_id) continue;
    const raw = {
      noNoteUnits: Number(a.raw_no_note_units || 0),
      // draft_not_payable remains unpaid "draft"; draft_payable is treated as paid (finalized) by default.
      draftUnits: Number(a.raw_draft_not_payable_units || 0),
      finalizedUnits: Number(a.raw_finalized_units || 0) + Number(a.raw_draft_payable_units || 0)
    };
    const o = overrideKey.get(`${a.user_id}:${a.service_code}`) || null;
    const eff = o
      ? {
          noNoteUnits: Number(o.no_note_units || 0),
          draftUnits: Number(o.draft_units || 0),
          finalizedUnits: Number(o.finalized_units || 0)
        }
      : raw;
    const carry = carryKey.get(`${a.user_id}:${a.service_code}`) || 0;
    out.push({
      userId: a.user_id,
      providerName: a.provider_name,
      serviceCode: a.service_code,
      ...eff,
      oldDoneNotesUnits: carry,
      finalizedUnits: Number(eff.finalizedUnits || 0) + carry
    });
  }

  // Include carryover-only rows so run/pay math includes manually-added Old Done Notes.
  for (const c of carryovers || []) {
    const key = `${c.user_id}:${c.service_code}`;
    if (aggKeys.has(key)) continue;
    const raw = { noNoteUnits: 0, draftUnits: 0, finalizedUnits: 0 };
    const o = overrideKey.get(key) || null;
    const eff = o
      ? {
          noNoteUnits: Number(o.no_note_units || 0),
          draftUnits: Number(o.draft_units || 0),
          finalizedUnits: Number(o.finalized_units || 0)
        }
      : raw;
    const carry = carryKey.get(key) || 0;
    if (carry <= 1e-9) continue;
    out.push({
      userId: c.user_id,
      providerName: null,
      serviceCode: c.service_code,
      ...eff,
      oldDoneNotesUnits: carry,
      finalizedUnits: Number(eff.finalizedUnits || 0) + carry
    });
  }
  return out;
}

async function recomputeSummariesFromStaging({ payrollPeriodId, agencyId, periodStart, periodEnd }) {
  const rows = await getEffectiveStagingAggregates(payrollPeriodId);
  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.userId)) byUser.set(r.userId, []);
    byUser.get(r.userId).push(r);
  }

  // Manual pay lines (one-off corrections): include in totals + posted breakdown.
  let manualPayLinesByUserId = new Map();
  let manualPayLinesSumByUserId = new Map();
  try {
    const grouped = await PayrollManualPayLine.listForPeriodGroupedByUser({ payrollPeriodId, agencyId });
    manualPayLinesByUserId = grouped?.byUserId || new Map();
    const sums = await PayrollManualPayLine.sumByUserForPeriod({ payrollPeriodId, agencyId });
    manualPayLinesSumByUserId = new Map((sums || []).map((r) => [Number(r.user_id), Number(r.amount || 0)]));
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    manualPayLinesByUserId = new Map();
    manualPayLinesSumByUserId = new Map();
  }

  // Ensure users with ONLY manual pay lines still get a payroll summary row.
  for (const uid of manualPayLinesByUserId.keys()) {
    if (!byUser.has(uid)) byUser.set(uid, []);
  }

  // Prelicensed pay gating for supervision codes (99414/99416):
  // pay is $0 until (individual>=50 AND total>=100) as of *prior* periods (pay-forward only).
  const supervisionPayEligibleByUserId = new Map();
  try {
    const [uaRows] = await pool.execute(
      `SELECT user_id, supervision_start_individual_hours, supervision_start_group_hours
       FROM user_agencies
       WHERE agency_id = ? AND supervision_is_prelicensed = 1`,
      [agencyId]
    );
    const preIds = (uaRows || []).map((r) => Number(r.user_id)).filter((n) => Number.isFinite(n) && n > 0);
    const baseByUser = new Map();
    for (const r of uaRows || []) {
      const uid = Number(r.user_id || 0);
      if (!uid) continue;
      baseByUser.set(uid, {
        ind: Number(r.supervision_start_individual_hours || 0),
        grp: Number(r.supervision_start_group_hours || 0)
      });
    }
    if (preIds.length) {
      const placeholders = preIds.map(() => '?').join(',');
      const [sumRows] = await pool.execute(
        `SELECT spe.user_id,
                COALESCE(SUM(spe.individual_hours), 0) AS ind,
                COALESCE(SUM(spe.group_hours), 0) AS grp
         FROM supervision_period_entries spe
         JOIN payroll_periods pp ON pp.id = spe.payroll_period_id
         WHERE spe.agency_id = ?
           AND pp.period_end < ?
           AND spe.user_id IN (${placeholders})
         GROUP BY spe.user_id`,
        [agencyId, String(periodStart || '').slice(0, 10), ...preIds]
      );
      const sumsByUser = new Map();
      for (const r of sumRows || []) {
        const uid = Number(r.user_id || 0);
        if (!uid) continue;
        sumsByUser.set(uid, { ind: Number(r.ind || 0), grp: Number(r.grp || 0) });
      }
      for (const uid of preIds) {
        const base = baseByUser.get(uid) || { ind: 0, grp: 0 };
        const sums = sumsByUser.get(uid) || { ind: 0, grp: 0 };
        const indTotal = Number(base.ind || 0) + Number(sums.ind || 0);
        const grpTotal = Number(base.grp || 0) + Number(sums.grp || 0);
        const eligible = indTotal >= 50 - 1e-9 && (indTotal + grpTotal) >= 100 - 1e-9;
        supervisionPayEligibleByUserId.set(uid, eligible);
      }
    }
  } catch {
    // ignore (tables/columns may not exist yet)
  }

  const rules = await PayrollServiceCodeRule.listForAgency(agencyId);
  const tierSettings = await getAgencyTierSettings(agencyId);
  const ruleByCode = new Map(
    (rules || []).map((r) => [String(r.service_code || '').trim().toUpperCase(), r])
  );

  async function getPriorTierCredits(userId) {
    try {
      const [prior] = await pool.execute(
        `SELECT ps.tier_credits_current
         FROM payroll_summaries ps
         JOIN payroll_periods pp ON ps.payroll_period_id = pp.id
         WHERE ps.agency_id = ?
           AND ps.user_id = ?
           AND pp.status IN ('posted','finalized')
           AND pp.period_end < ?
         ORDER BY pp.period_end DESC
         LIMIT 1`,
        [agencyId, userId, periodEnd]
      );
      return Number(prior?.[0]?.tier_credits_current || 0);
    } catch {
      return 0;
    }
  }

  // Prior-period still-unpaid snapshot (for pay output/pay stubs informational display).
  // This is derived from the immediately prior pay period's payroll_summaries breakdown.
  // It does NOT affect current pay math.
  let priorPeriod = null;
  const priorUnpaidByUserId = new Map(); // userId -> { totalUnits, lines: [{ serviceCode, unpaidUnits, noNoteUnits, draftUnits }] }
  try {
    const ps = String(periodStart || '').slice(0, 10);
    if (ps) {
      const [ppRows] = await pool.execute(
        `SELECT id, period_start, period_end
         FROM payroll_periods
         WHERE agency_id = ?
           AND period_end = DATE_SUB(?, INTERVAL 1 DAY)
         LIMIT 1`,
        [agencyId, ps]
      );
      priorPeriod = ppRows?.[0] || null;
    }
    if (priorPeriod?.id) {
      const [sumRows] = await pool.execute(
        `SELECT user_id, no_note_units, draft_units, breakdown
         FROM payroll_summaries
         WHERE payroll_period_id = ?
           AND agency_id = ?`,
        [priorPeriod.id, agencyId]
      );
      for (const s of sumRows || []) {
        const uid = Number(s.user_id || 0);
        if (!uid) continue;
        const totalUnits = Number(s.no_note_units || 0) + Number(s.draft_units || 0);
        let breakdown = s.breakdown || null;
        if (typeof breakdown === 'string') {
          try { breakdown = JSON.parse(breakdown); } catch { breakdown = null; }
        }
        const lines = [];
        if (breakdown && typeof breakdown === 'object') {
          for (const [code, vRaw] of Object.entries(breakdown)) {
            if (String(code).startsWith('__')) continue;
            const v = vRaw && typeof vRaw === 'object' ? vRaw : {};
            const nn = Number(v.noNoteUnits || 0);
            const dr = Number(v.draftUnits || 0);
            const unpaid = nn + dr;
            if (unpaid > 1e-9) {
              lines.push({
                serviceCode: String(code),
                unpaidUnits: Number(unpaid.toFixed(2)),
                noNoteUnits: Number(nn.toFixed(2)),
                draftUnits: Number(dr.toFixed(2))
              });
            }
          }
        }
        priorUnpaidByUserId.set(uid, { totalUnits: Number(totalUnits.toFixed(2)), lines });
      }
    }
  } catch {
    priorPeriod = null;
    priorUnpaidByUserId.clear();
  }

  for (const [userId, userRows] of byUser.entries()) {
    const rateCard = await PayrollRateCard.findForUser(agencyId, userId);
    const userPerCodeRates = await PayrollRate.listForUser(agencyId, userId);
    const ratesByCode = new Map();
    for (const rr of userPerCodeRates || []) {
      const k = String(rr.service_code || '').trim().toUpperCase();
      if (!k) continue;
      if (!ratesByCode.has(k)) ratesByCode.set(k, []);
      ratesByCode.get(k).push(rr);
    }
    const bestPerCodeRate = (codeKey) => {
      const arr = ratesByCode.get(codeKey) || [];
      for (const r of arr) {
        // listForUser is ordered by service_code ASC, effective_start DESC
        // Apply asOf window if present.
        if (periodStart) {
          const start = r.effective_start ? String(r.effective_start) : null;
          const end = r.effective_end ? String(r.effective_end) : null;
          if (start && String(start) > String(periodStart)) continue;
          if (end && String(end) < String(periodStart)) continue;
        }
        return r;
      }
      return null;
    };
    const breakdown = {};
    let noNoteUnitsTotal = 0;
    let draftUnitsTotal = 0;
    let finalizedUnitsTotal = 0;
    let oldDoneNotesUnitsTotal = 0;
    let subtotal = 0;
    let tierCreditsCurrent = 0;
    // NOTE: We are treating credits as hours (Credits/Hours).
    // To avoid DB migrations, we store credits in the existing *_hours columns.
    let totalHours = 0; // total credits/hours
    let directHours = 0; // direct credits/hours
    let indirectHours = 0; // indirect credits/hours
    let otherHours = 0; // other credits/hours (computed for UI/export)

    for (const row of userRows) {
      const code = row.serviceCode;
      const finalizedUnits = Number(row.finalizedUnits) || 0;
      const draftUnits = Number(row.draftUnits) || 0;
      const noNoteUnits = Number(row.noNoteUnits) || 0;
      const oldDoneNotesUnits = Number(row.oldDoneNotesUnits) || 0;

      const codeKey = String(code || '').trim().toUpperCase();
      const rule = ruleByCode.get(codeKey) || null;
      const defaults = payrollDefaultsForCode(codeKey);
      const category = String(rule?.category ?? defaults?.category ?? 'direct').trim().toLowerCase();
      const otherSlot = Number(rule?.other_slot ?? defaults?.otherSlot ?? 1);
      // Divisor + credits are driven by service code rule fields.
      // Duration minutes may be null for many rules; we still must respect pay_divisor/credit_value if present.
      const payDivisor = Number(
        (rule?.pay_divisor === null || rule?.pay_divisor === undefined)
          ? (defaults?.payDivisor ?? 1)
          : rule.pay_divisor
      );
      const creditValue = Number(
        (rule?.credit_value === null || rule?.credit_value === undefined)
          ? (defaults?.creditValue ?? 0)
          : rule.credit_value
      );
      const durationMinutes =
        (rule?.duration_minutes === null || rule?.duration_minutes === undefined)
          ? (defaults?.durationMinutes === null || defaults?.durationMinutes === undefined ? null : Number(defaults.durationMinutes))
          : Number(rule.duration_minutes);

      const d = Number.isFinite(payDivisor) ? Number(payDivisor) : 1;
      const safeDivisor = (!Number.isFinite(d) || d <= 0) ? 1 : d;
      const safeCreditValue = Number.isFinite(creditValue) ? creditValue : 0;

      // Credits/Hours: minute-based rows use unit_count minutes and credit_value = 1/60.
      // Pay-hours: unit_count / pay_divisor (e.g. minutes / 60).
      const creditsHours = (finalizedUnits * safeCreditValue);
      const payHours = (finalizedUnits / safeDivisor);

      totalHours += creditsHours;
      const baseBucket =
        (category === 'indirect' || category === 'admin' || category === 'meeting') ? 'indirect'
          : (category === 'other' || category === 'tutoring') ? 'other'
            : (category === 'mileage' || category === 'bonus' || category === 'reimbursement' || category === 'other_pay') ? 'flat'
              : 'direct';

      // Allow per-user mapping of "other slot" hours into Direct/Indirect totals.
      // This is driven by payroll_rate_cards.other_rate_*_bucket and only applies to "other" category codes.
      let bucket = baseBucket;
      if (baseBucket === 'other' && rateCard) {
        const raw =
          (otherSlot === 2) ? rateCard.other_rate_2_bucket
            : (otherSlot === 3) ? rateCard.other_rate_3_bucket
              : rateCard.other_rate_1_bucket;
        const mapped = String(raw || 'other').trim().toLowerCase();
        if (mapped === 'direct' || mapped === 'indirect') bucket = mapped;
      }

      if (bucket === 'indirect') indirectHours += creditsHours;
      else if (bucket === 'other') otherHours += creditsHours;
      else if (bucket === 'direct') directHours += creditsHours;

      // Tier credits (per TIER_INSTRUCTION.md):
      // - Based on DIRECT Credits/Hours only
      // - Excludes Old Done Notes (carryover) from the current window calculation
      // - Matches the Payroll Stage "Credits/Hours" column for direct rows
      if (bucket === 'direct' && tierSettings.enabled) {
        const baseUnitsForTier = Math.max(0, finalizedUnits - oldDoneNotesUnits);
        const tierCreditsForRow = (baseUnitsForTier * safeCreditValue);
        tierCreditsCurrent += tierCreditsForRow;
      }

      let rateAmount = 0;
      let rateSource = 'none';
      const perCode = bestPerCodeRate(codeKey);
      // Per-code rate unit is now driven by agency service-code rules (not per-user).
      // Backward compatible: if agency column doesn't exist yet, fall back to the stored per-code rate_unit.
      const rulePayUnitRaw = String(rule?.pay_rate_unit || '').trim().toLowerCase();
      const rulePayUnit = (rulePayUnitRaw === 'per_hour') ? 'per_hour' : 'per_unit';
      const legacyPerCodeUnit = perCode ? String(perCode.rate_unit || 'per_unit').trim().toLowerCase() : null;
      const perCodePayUnit =
        rulePayUnitRaw
          ? rulePayUnit
          : (legacyPerCodeUnit === 'per_hour' ? 'per_hour' : 'per_unit');
      if (perCode) {
        rateSource = 'per_code_rate';
        rateAmount = Number(perCode.rate_amount || 0);
      } else if (rateCard) {
        // For flat categories (bonus/mileage/etc), do NOT apply hourly rate card automatically.
        if (bucket !== 'flat') {
          rateSource = 'rate_card';
          // IMPORTANT: "other" slot uses other_rate_N even if it's mapped into Direct/Indirect totals.
          if (baseBucket === 'indirect') rateAmount = Number(rateCard.indirect_rate || 0);
          else if (baseBucket === 'other') {
            if (otherSlot === 2) rateAmount = Number(rateCard.other_rate_2 || 0);
            else if (otherSlot === 3) rateAmount = Number(rateCard.other_rate_3 || 0);
            else rateAmount = Number(rateCard.other_rate_1 || 0);
          } else {
            rateAmount = Number(rateCard.direct_rate || 0);
          }
        }
      }

      // Always compute wage math on pay-hours for non-flat categories.
      const computeLineAmount = ({ units, payHours }) => {
        // Prelicensed pay gate for supervision codes.
        if (codeKey === '99414' || codeKey === '99416') {
          // Only apply if we know this user is prelicensed; non-prelicensed users aren't in the map.
          if (supervisionPayEligibleByUserId.has(Number(userId)) && supervisionPayEligibleByUserId.get(Number(userId)) === false) {
            return 0;
          }
        }
        if (perCode) {
          if (bucket !== 'flat') {
            // Per-code rates can be per-unit or per-hour; unit is agency-driven.
            if (perCodePayUnit === 'per_hour') return payHours * rateAmount;
            return units * rateAmount; // per_unit default
          }
          return units * rateAmount; // flat bucket is treated like per_unit (no special "flat" behavior)
        }
        if (rateCard && bucket !== 'flat') return payHours * rateAmount;
        return units * rateAmount;
      };

      const lineAmount = computeLineAmount({ units: finalizedUnits, payHours });

      noNoteUnitsTotal += noNoteUnits;
      draftUnitsTotal += draftUnits;
      finalizedUnitsTotal += finalizedUnits;
      oldDoneNotesUnitsTotal += oldDoneNotesUnits;
      subtotal += lineAmount;

      breakdown[code] = {
        units: finalizedUnits,
        noNoteUnits,
        draftUnits,
        finalizedUnits,
        oldDoneNotesUnits,
        category,
        bucket,
        otherSlot: (baseBucket === 'other') ? otherSlot : null,
        payDivisor: safeDivisor,
        creditValue: safeCreditValue,
        durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
        rateAmount,
        rateUnit: perCode ? perCodePayUnit : (rateSource === 'rate_card' ? 'per_hour' : 'per_unit'),
        amount: lineAmount,
        // For now, "hours" represents Credits/Hours (credits treated as hours).
        hours: creditsHours,
        creditsHours,
        payHours,
        rateSource
      };
    }

    let currentWindowCount = 0;
    let currentWindowSum = 0;
    let currentBiWeeklyAvg = 0;
    let currentWeeklyAvg = 0;
    let currentTierLevel = 0;
    let prevWindowCount = 0;
    let prevWindowSum = 0;
    let prevBiWeeklyAvg = 0;
    let prevWeeklyAvg = 0;
    let prevTierLevel = 0;
    let prevPeriodBiWeeklyTotal = 0;
    let prevPeriodWeeklyAvg = 0;
    let prevPeriodTierLevel = 0;
    let graceActive = 0;
    let tierStatus = '';
    let displayBiWeeklyTotal = 0;
    let displayWeeklyAvg = 0;
    let displayTierLevel = 0;
    let benefitTierLevel = 0;
    let tierLabel = '';
    let tierCreditsPrior = 0;
    let tierCreditsFinal = 0;

    if (tierSettings.enabled) {
      // Tier window computations (rolling)
      const history = await getTierHistorySum({ agencyId, userId, periodEnd, limit: TIER_WINDOW_PERIODS });
      currentWindowCount = history.count + 1;
      currentWindowSum = history.sum + tierCreditsCurrent;
      currentBiWeeklyAvg = currentWindowCount > 0 ? (currentWindowSum / currentWindowCount) : 0;
      currentWeeklyAvg = currentBiWeeklyAvg / 2;
      currentTierLevel = tierLevelFromWeeklyAvg(currentWeeklyAvg, tierSettings.thresholds);

      // Previous window (exclude current)
      prevWindowCount = history.count;
      prevWindowSum = history.sum;
      prevBiWeeklyAvg = prevWindowCount > 0 ? (prevWindowSum / prevWindowCount) : 0;
      prevWeeklyAvg = prevBiWeeklyAvg / 2;
      prevTierLevel = tierLevelFromWeeklyAvg(prevWeeklyAvg, tierSettings.thresholds);

      const prior = await getImmediatePriorPeriodTierStats({
        agencyId,
        userId,
        periodStart,
        thresholds: tierSettings.thresholds,
        defaultBiWeeklyTotal: tierCreditsCurrent
      });
      prevPeriodBiWeeklyTotal = Number(prior.biWeeklyTotal || 0);
      prevPeriodWeeklyAvg = Number(prior.weeklyAvg || 0);
      prevPeriodTierLevel = Number(prior.tierLevel || 0);
      // Display should reflect *current period* direct tier credits (Tier Credits (Final)), not rolling average.
      displayBiWeeklyTotal = tierCreditsCurrent;
      displayWeeklyAvg = displayBiWeeklyTotal / 2;
      displayTierLevel = tierLevelFromWeeklyAvg(displayWeeklyAvg, tierSettings.thresholds);

      // Grace/compliance should be based on the immediately prior pay period's payroll numbers.
      // If the user was compliant last pay period, they remain in grace even if current drops to 0.
      graceActive = (prevPeriodTierLevel >= 1 && displayTierLevel < prevPeriodTierLevel) ? 1 : 0;
      benefitTierLevel = graceActive ? prevPeriodTierLevel : displayTierLevel;
      tierStatus = graceActive
        ? `Grace (last pay period Tier ${prevPeriodTierLevel}: ${Number(prevPeriodBiWeeklyTotal || 0).toFixed(1)} bi-wk; ${Number(prevPeriodWeeklyAvg).toFixed(1)}/wk)`
        : tierStatusLabel({ tierLevel: benefitTierLevel, prevTierLevel: prevPeriodTierLevel });
      tierLabel = graceActive
        ? `Tier ${benefitTierLevel} (grace; current ${Number(displayBiWeeklyTotal).toFixed(1)} bi-wk; last ${Number(prevPeriodBiWeeklyTotal || 0).toFixed(1)} bi-wk)`
        : fmtTierLabelCurrentPeriod({ tierLevel: benefitTierLevel, biWeeklyTotal: displayBiWeeklyTotal, weeklyAvg: displayWeeklyAvg });

      // Persisted tier credits fields:
      // - tier_credits_current: current period DIRECT tier credits (present period only; excludes Old Notes)
      // - tier_credits_prior: previous-window bi-weekly average (reference only)
      // - tier_credits_final: current period DIRECT tier credits (what the admin tables expect to match stage direct credits)
      tierCreditsPrior = prevBiWeeklyAvg;
      tierCreditsFinal = tierCreditsCurrent;
    } else {
      tierCreditsCurrent = 0;
    }

    // Adjustments (v1)
    const adj = await PayrollAdjustment.findForPeriodUser(payrollPeriodId, userId);
    const manualMileageAmount = Number(adj?.mileage_amount || 0);
    const manualMedcancelAmount = Number(adj?.medcancel_amount || 0);
    const manualReimbursementAmount = Number(adj?.reimbursement_amount || 0);
    const tuitionReimbursementAmount = Number(adj?.tuition_reimbursement_amount || 0);
    const mileageClaimsAmount = await PayrollMileageClaim.sumApprovedForPeriodUser({
      payrollPeriodId,
      agencyId,
      userId
    });
    const mileageAmount = manualMileageAmount + mileageClaimsAmount;
    const medcancelClaimsAmount = await PayrollMedcancelClaim.sumApprovedForPeriodUser({
      payrollPeriodId,
      agencyId,
      userId
    });
    const medcancelAmount = manualMedcancelAmount + medcancelClaimsAmount;
    const reimbursementClaimsAmount = await PayrollReimbursementClaim.sumApprovedForPeriodUser({
      payrollPeriodId,
      agencyId,
      userId
    });
    const reimbursementAmount = manualReimbursementAmount + reimbursementClaimsAmount;
    const approvedTimeClaims = await PayrollTimeClaim.listApprovedForPeriodUser({
      payrollPeriodId,
      agencyId,
      userId
    });
    const timeClaimsAmount = (approvedTimeClaims || []).reduce((a, c) => a + Number(c?.applied_amount || 0), 0);
    const otherTaxableAmount = Number(adj?.other_taxable_amount || 0);
    const imatterAmount = Number(adj?.imatter_amount || 0);
    const missedAppointmentsAmount = Number(adj?.missed_appointments_amount || 0);
    const bonusAmount = Number(adj?.bonus_amount || 0);
    // Salary:
    // - If salary_amount is explicitly set for this pay period, treat it as the salary override.
    // - Otherwise, if an active salary position exists, auto-apply it.
    const salaryAmountManual = Number(adj?.salary_amount || 0);
    let salaryPosition = null;
    let salaryAmountAuto = 0;
    let salaryIncludeServicePay = 0;
    let salaryIsProrated = 0;
    if (!(salaryAmountManual > 0.001)) {
      try {
        salaryPosition = await PayrollSalaryPosition.findActiveForUser({
          agencyId,
          userId,
          asOfDate: String(periodStart || '').slice(0, 10)
        });
      } catch {
        salaryPosition = null;
      }
      if (salaryPosition) {
        const perPeriod = Number(salaryPosition.salary_per_pay_period || 0);
        salaryIncludeServicePay = Number(salaryPosition.include_service_pay) ? 1 : 0;
        const doProrate = Number(salaryPosition.prorate_by_days) ? 1 : 0;
        const ps = String(periodStart || '').slice(0, 10);
        const pe = String(periodEnd || '').slice(0, 10);
        const es = salaryPosition.effective_start ? String(salaryPosition.effective_start).slice(0, 10) : null;
        const ee = salaryPosition.effective_end ? String(salaryPosition.effective_end).slice(0, 10) : null;
        if (perPeriod > 0.001 && ps && pe) {
          const toUtcDay = (ymd) => {
            const [y, m, d] = String(ymd).split('-').map((x) => parseInt(x, 10));
            return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
          };
          const periodStartD = toUtcDay(ps);
          const periodEndD = toUtcDay(pe);
          const effStartD = es ? toUtcDay(es) : periodStartD;
          const effEndD = ee ? toUtcDay(ee) : periodEndD;
          const startD = effStartD.getTime() > periodStartD.getTime() ? effStartD : periodStartD;
          const endD = effEndD.getTime() < periodEndD.getTime() ? effEndD : periodEndD;
          const msPerDay = 86400000;
          const periodDays = Math.floor((periodEndD.getTime() - periodStartD.getTime()) / msPerDay) + 1;
          const activeDays = Math.floor((endD.getTime() - startD.getTime()) / msPerDay) + 1;
          if (activeDays > 0 && periodDays > 0) {
            const factor = doProrate ? (activeDays / periodDays) : 1;
            salaryAmountAuto = Number((perPeriod * factor).toFixed(2));
            salaryIsProrated = doProrate && Math.abs(factor - 1) > 1e-9 ? 1 : 0;
          }
        }
      }
    }
    const salaryAmount = (salaryAmountManual > 0.001) ? salaryAmountManual : salaryAmountAuto;
    const sickPtoHours = Number(adj?.sick_pto_hours ?? 0);
    const trainingPtoHours = Number(adj?.training_pto_hours ?? 0);
    const legacyPtoHours = Number(adj?.pto_hours ?? 0);
    const ptoHours = (sickPtoHours + trainingPtoHours) > 0 ? (sickPtoHours + trainingPtoHours) : legacyPtoHours;
    const ptoRate = Number(adj?.pto_rate || 0);
    const ptoPay = ptoHours * ptoRate;

    // Hour-based add-ons for multi-rate "other" slots (paid at the provider's rate card).
    const otherTitles = await getEffectiveOtherRateTitles({ agencyId, userId });
    const otherRate1Hours = Number(adj?.other_rate_1_hours || 0);
    const otherRate2Hours = Number(adj?.other_rate_2_hours || 0);
    const otherRate3Hours = Number(adj?.other_rate_3_hours || 0);
    const otherRate1 = Number(rateCard?.other_rate_1 || 0);
    const otherRate2 = Number(rateCard?.other_rate_2 || 0);
    const otherRate3 = Number(rateCard?.other_rate_3 || 0);
    const otherRate1Bucket = String(rateCard?.other_rate_1_bucket || 'other').trim().toLowerCase();
    const otherRate2Bucket = String(rateCard?.other_rate_2_bucket || 'other').trim().toLowerCase();
    const otherRate3Bucket = String(rateCard?.other_rate_3_bucket || 'other').trim().toLowerCase();
    const safeBucket = (b) => (b === 'direct' || b === 'indirect' || b === 'other') ? b : 'other';

    const otherHoursItems = [
      { slot: 1, label: otherTitles.title1, hours: otherRate1Hours, rate: otherRate1, bucket: safeBucket(otherRate1Bucket) },
      { slot: 2, label: otherTitles.title2, hours: otherRate2Hours, rate: otherRate2, bucket: safeBucket(otherRate2Bucket) },
      { slot: 3, label: otherTitles.title3, hours: otherRate3Hours, rate: otherRate3, bucket: safeBucket(otherRate3Bucket) }
    ].filter((x) => Number(x.hours || 0) > 1e-9 && Number(x.rate || 0) > 1e-9);

    const otherHoursPay = otherHoursItems.reduce((a, x) => a + (Number(x.hours || 0) * Number(x.rate || 0)), 0);
    for (const it of otherHoursItems) {
      const h = Number(it.hours || 0);
      if (it.bucket === 'direct') { directHours += h; totalHours += h; }
      else if (it.bucket === 'indirect') { indirectHours += h; totalHours += h; }
      else { otherHours += h; totalHours += h; }
    }

    const manualPayLinesRaw = (manualPayLinesByUserId.get(Number(userId)) || []).slice();
    const manualPayLines = manualPayLinesRaw
      .filter((l) => String(l?.lineType || 'pay').toLowerCase() !== 'pto')
      .map((l) => ({
      id: Number(l?.id || 0),
      label: String(l?.label || ''),
      category: String(l?.category || 'direct').trim().toLowerCase() === 'indirect' ? 'indirect' : 'direct',
      creditsHours:
        (l?.creditsHours === null || l?.creditsHours === undefined || l?.creditsHours === '')
          ? null
          : Number(l?.creditsHours),
      amount: Number(l?.amount || 0)
    }));
    const manualPayLinesAmount = manualPayLines.reduce((a, l) => a + Number(l?.amount || 0), 0);

    const nonTaxableAmount = mileageAmount + reimbursementAmount + tuitionReimbursementAmount;
    const taxableAdjustmentsAmount =
      medcancelAmount +
      otherTaxableAmount +
      imatterAmount +
      missedAppointmentsAmount +
      bonusAmount +
      timeClaimsAmount +
      ptoPay +
      manualPayLinesAmount +
      otherHoursPay;
    const adjustmentsAmount = taxableAdjustmentsAmount + nonTaxableAmount;
    const basePay = (salaryAmount > 0.001 && !salaryIncludeServicePay) ? salaryAmount : subtotal;
    const salaryAddonAmount = (salaryAmount > 0.001 && salaryIncludeServicePay) ? salaryAmount : 0;
    const totalAmount = basePay + adjustmentsAmount + salaryAddonAmount;

    const adjustmentLines = [];
    const pushLine = (l) => { if (Math.abs(Number(l?.amount || 0)) > 1e-9) adjustmentLines.push(l); };
    // Non-taxable
    pushLine({ type: 'mileage', label: 'Mileage', taxable: false, amount: mileageAmount, meta: { manual: manualMileageAmount, auto: mileageClaimsAmount } });
    pushLine({ type: 'reimbursement', label: 'Reimbursement', taxable: false, amount: reimbursementAmount, meta: { manual: manualReimbursementAmount, auto: reimbursementClaimsAmount } });
    pushLine({ type: 'tuition_reimbursement', label: 'Tuition reimbursement (tax-exempt)', taxable: false, amount: tuitionReimbursementAmount });
    // Taxable
    pushLine({ type: 'medcancel', label: 'Med Cancel', taxable: true, amount: medcancelAmount, meta: { manual: manualMedcancelAmount, auto: medcancelClaimsAmount } });
    if (Number(otherTaxableAmount || 0) > 1e-9) pushLine({ type: 'other_taxable', label: 'Other taxable', taxable: true, amount: otherTaxableAmount });
    if (Number(imatterAmount || 0) > 1e-9) pushLine({ type: 'imatter', label: 'IMatter', taxable: true, amount: imatterAmount });
    if (Number(missedAppointmentsAmount || 0) > 1e-9) pushLine({ type: 'missed_appointments', label: 'Missed appointments', taxable: true, amount: missedAppointmentsAmount });
    if (Number(bonusAmount || 0) > 1e-9) pushLine({ type: 'bonus', label: 'Bonus', taxable: true, amount: bonusAmount });
    // Time claims: explicit line items, bucketed direct/indirect, and can contribute to hour totals.
    for (const c of approvedTimeClaims || []) {
      const amt = Number(c?.applied_amount || 0);
      if (Math.abs(amt) < 1e-9) continue;
      const b = String(c?.bucket || 'indirect').trim().toLowerCase() === 'direct' ? 'direct' : 'indirect';
      const hrsFromCol =
        (c?.credits_hours === null || c?.credits_hours === undefined || c?.credits_hours === '')
          ? null
          : Number(c?.credits_hours);
      const payload = c?.payload || {};
      const mins = Number(payload?.totalMinutes ?? (Number(payload?.directMinutes || 0) + Number(payload?.indirectMinutes || 0)) ?? 0);
      const hrsFromPayload = Number.isFinite(mins) && mins > 0 ? Math.round((mins / 60) * 100) / 100 : null;
      const hrs = Number.isFinite(hrsFromCol) ? hrsFromCol : hrsFromPayload;
      if (Number.isFinite(hrs) && hrs > 1e-9) {
        if (b === 'direct') { directHours += hrs; totalHours += hrs; }
        else { indirectHours += hrs; totalHours += hrs; }
        if (tierSettings.enabled && b === 'direct') {
          tierCreditsCurrent += hrs;
        }
      }
      const t = String(c?.claim_type || '').trim();
      const typeLabel = t ? t.replace(/_/g, ' ') : 'time claim';
      pushLine({
        type: 'time_claim',
        label: `Time claim (${typeLabel})`,
        taxable: true,
        amount: amt,
        bucket: b,
        meta: { creditsHours: (Number.isFinite(hrs) ? hrs : null) }
      });
    }
    if (Number(ptoPay || 0) > 1e-9) pushLine({ type: 'pto', label: 'PTO', taxable: true, amount: ptoPay, meta: { hours: ptoHours, rate: ptoRate } });
    for (const it of otherHoursItems) {
      pushLine({
        type: `other_rate_${it.slot}`,
        label: String(it.label || `Other ${it.slot}`),
        taxable: true,
        amount: Number(it.hours || 0) * Number(it.rate || 0),
        bucket: it.bucket,
        meta: { hours: Number(it.hours || 0), rate: Number(it.rate || 0) }
      });
    }
    // Manual pay lines: appear as explicit line items and can contribute to hour totals (for PTO basis).
    for (const l of manualPayLines || []) {
      const amt = Number(l.amount || 0);
      const cat = String(l.category || 'direct').toLowerCase() === 'indirect' ? 'indirect' : 'direct';
      const hrs = (l?.creditsHours === null || l?.creditsHours === undefined || l?.creditsHours === '') ? null : Number(l?.creditsHours);
      if (Number.isFinite(hrs) && hrs > 1e-9) {
        if (cat === 'indirect') { indirectHours += hrs; totalHours += hrs; }
        else { directHours += hrs; totalHours += hrs; }
        if (tierSettings.enabled && cat === 'direct') {
          tierCreditsCurrent += hrs;
        }
      }
      pushLine({
        type: 'manual_pay_line',
        label: String(l.label || 'Manual'),
        taxable: true,
        amount: amt,
        bucket: cat,
        meta: { creditsHours: (Number.isFinite(hrs) ? hrs : null) }
      });
    }

    breakdown.__adjustments = {
      mileageAmount,
      mileageClaimsAmount,
      manualMileageAmount,
      medcancelAmount,
      medcancelClaimsAmount,
      manualMedcancelAmount,
      reimbursementAmount,
      reimbursementClaimsAmount,
      manualReimbursementAmount,
      tuitionReimbursementAmount,
      timeClaimsAmount,
      otherTaxableAmount,
      imatterAmount,
      missedAppointmentsAmount,
      bonusAmount,
      ptoHours,
      sickPtoHours,
      trainingPtoHours,
      ptoRate,
      ptoPay,
      otherRate1Hours,
      otherRate2Hours,
      otherRate3Hours,
      otherHoursPay,
      manualPayLinesAmount,
      manualPayLines,
      taxableAdjustmentsAmount,
      nonTaxableAmount,
      lines: adjustmentLines,
      salaryAmount,
      salaryIncludeServicePay: !!salaryIncludeServicePay,
      salaryIsProrated: !!salaryIsProrated,
      salarySource: (salaryAmountManual > 0.001) ? 'manual_override' : (salaryPosition ? 'position' : 'none'),
      basePayIsSalaryOverride: (salaryAmount > 0.001 && !salaryIncludeServicePay)
    };

    // Backward-compatible: some clients render manual lines from this top-level key.
    breakdown.__manualPayLines = manualPayLines;

    breakdown.__carryover = {
      oldDoneNotesUnitsTotal
    };

    // Informational only: outstanding unpaid from the immediately prior pay period (not paid this period).
    const priorUnpaid = priorUnpaidByUserId.get(Number(userId)) || null;
    breakdown.__priorStillUnpaid = (priorPeriod && priorUnpaid && Number(priorUnpaid.totalUnits || 0) > 0)
      ? {
          payrollPeriodId: Number(priorPeriod.id),
          periodStart: String(priorPeriod.period_start || '').slice(0, 10),
          periodEnd: String(priorPeriod.period_end || '').slice(0, 10),
          totalUnits: Number(priorUnpaid.totalUnits || 0),
          lines: Array.isArray(priorUnpaid.lines) ? priorUnpaid.lines : []
        }
      : null;

    breakdown.__tier = {
      // Display fields (current period only; matches Tier Credits (Final))
      biWeeklyTotal: displayBiWeeklyTotal,
      weeklyAvg: displayWeeklyAvg,
      tierLevel: benefitTierLevel,
      status: tierStatus,
      label: tierLabel,
      // Rolling window fields (kept for reference/debug)
      rolling: {
        windowPeriods: currentWindowCount,
        sum: currentWindowSum,
        biWeeklyAvg: currentBiWeeklyAvg,
        weeklyAvg: currentWeeklyAvg,
        tierLevel: currentTierLevel,
        lastPayPeriodWeeklyAvg: prevPeriodWeeklyAvg,
        lastPayPeriod: {
          biWeeklyTotal: prevPeriodBiWeeklyTotal,
          weeklyAvg: prevPeriodWeeklyAvg,
          tierLevel: prevPeriodTierLevel
        },
        prev: {
          windowPeriods: prevWindowCount,
          sum: prevWindowSum,
          biWeeklyAvg: prevBiWeeklyAvg,
          weeklyAvg: prevWeeklyAvg,
          tierLevel: prevTierLevel
        }
      }
    };

    if (!tierSettings.enabled) {
      // Keep breakdown shape stable, but remove tier badge content for agencies that don't use tiers.
      breakdown.__tier = null;
    }

    await PayrollSummary.upsert({
      payrollPeriodId,
      agencyId,
      userId,
      noNoteUnits: noNoteUnitsTotal,
      draftUnits: draftUnitsTotal,
      finalizedUnits: finalizedUnitsTotal,
      tierCreditsCurrent,
      tierCreditsPrior,
      tierCreditsFinal,
      graceActive,
      totalHours,
      directHours,
      indirectHours,
      totalUnits: finalizedUnitsTotal,
      subtotalAmount: basePay,
      adjustmentsAmount,
      totalAmount,
      breakdown
    });
  }
}

export const importPayrollCsv = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const payrollPeriodId = parseInt(req.params.id);
      const period = await PayrollPeriod.findById(payrollPeriodId);
      if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
      if (!(await requirePayrollAccess(req, res, period.agency_id))) return;
      if (isEffectivelyPostedOrFinalized(period)) {
        return res.status(409).json({ error: { message: 'Pay period is posted/finalized and cannot be re-imported.' } });
      }
      if (!req.file) return res.status(400).json({ error: { message: 'No CSV file uploaded' } });

      const agencyId = period.agency_id;
      let parsed = [];
      let missedAppointmentsPaidInFull = [];
      try {
        const r = parsePayrollFile(req.file.buffer, req.file.originalname);
        parsed = r?.rows || [];
        missedAppointmentsPaidInFull = r?.missedAppointmentsPaidInFull || [];
      } catch (e) {
        return res.status(400).json({
          error: {
            message: e.message || 'Failed to parse report',
            errorMeta: {
              rowNumber: e?.rowNumber || null,
              detectedHeaders: Array.isArray(e?.detectedHeaders) ? e.detectedHeaders : null,
              exampleExpected: Array.isArray(e?.exampleExpected) ? e.exampleExpected : null
            }
          }
        });
      }
      if ((!parsed || parsed.length === 0) && (!missedAppointmentsPaidInFull || missedAppointmentsPaidInFull.length === 0)) {
        return res.status(400).json({ error: { message: 'No rows found in report' } });
      }

      // Build name->user map for users in agency
      const [agencyUsers] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name
         FROM users u
         JOIN user_agencies ua ON u.id = ua.user_id
         WHERE ua.agency_id = ?`,
        [agencyId]
      );

      // H0032 per-user manual minutes toggle (Category 2).
      const h0032ManualMinutesByUserId = new Map();
      try {
        const [uaRows] = await pool.execute(
          `SELECT user_id, h0032_requires_manual_minutes
           FROM user_agencies
           WHERE agency_id = ?`,
          [agencyId]
        );
        for (const r of uaRows || []) {
          h0032ManualMinutesByUserId.set(Number(r.user_id), Number(r.h0032_requires_manual_minutes) ? 1 : 0);
        }
      } catch {
        // column may not exist yet
      }

      const nameToIds = new Map();
      for (const u of agencyUsers || []) {
        const first = String(u.first_name || '').trim();
        const last = String(u.last_name || '').trim();
        const a = normalizeName(`${first} ${last}`);
        const b = normalizeName(`${last} ${first}`);
        if (a) addNameKeyToIds(nameToIds, a, u.id);
        if (b) addNameKeyToIds(nameToIds, b, u.id);
      }

      // Auto-create missing provider users so rows can be matched immediately.
      const createdUsers = [];
      const seen = new Set();
      for (const r of parsed || []) {
        const keys = nameKeyCandidates(r.providerName);
        const primaryKey = keys[0] || '';
        if (!primaryKey || seen.has(primaryKey)) continue;
        // If any key resolves uniquely already, no need to create.
        if (resolveUserIdForProviderName(nameToIds, r.providerName)) continue;
        seen.add(primaryKey);
        const ensured = await ensureUserForProviderName({ agencyId, providerName: r.providerName });
        if (ensured?.userId) {
          for (const k of keys) addNameKeyToIds(nameToIds, k, ensured.userId);
          createdUsers.push({ providerName: r.providerName, userId: ensured.userId, firstName: ensured.firstName, lastName: ensured.lastName });
        }
      }

      const imp = await PayrollImport.create({
        agencyId,
        payrollPeriodId,
        source: 'csv',
        originalFilename: req.file.originalname,
        uploadedByUserId: req.user.id
      });

      // Ensure recurring To-Dos exist for this pay period (best-effort).
      try {
        await PayrollPeriodTodo.ensureMaterializedForPeriod({ payrollPeriodId, agencyId });
      } catch {
        // ignore
      }

      // Save display-only missed appointment flags (Paid in Full).
      try {
        await PayrollImportMissedAppointment.replaceForImport({
          payrollImportId: imp.id,
          payrollPeriodId,
          agencyId,
          rows: missedAppointmentsPaidInFull
        });
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }

      const rowsToInsert = parsed.map((r) => {
        const userId = resolveUserIdForProviderName(nameToIds, r.providerName);
        const codeKey = String(r.serviceCode || '').trim().toUpperCase();

        // H0031: imported as 1 occurrence, but must be treated as minutes (default 60) and must be processed.
        // H0032: default to 30 minutes for everyone; Category-2 users additionally require processing (Done).
        const isH0031 = codeKey === 'H0031';
        const isH0032 = codeKey === 'H0032';
        const h0032NeedsManualMinutes = isH0032 ? !!h0032ManualMinutesByUserId.get(userId) : false;

        let unitCount = Number(r.unitCount) || 0;
        if (isH0031) {
          if (Math.abs(unitCount - 1) < 1e-9) unitCount = 60;
        } else if (isH0032) {
          if (Math.abs(unitCount - 1) < 1e-9) unitCount = 30;
        }

        const requiresProcessing = isH0031 || (isH0032 && h0032NeedsManualMinutes);
        const rowFingerprint = computeRowFingerprint({
          agencyId,
          clinicianName: r.providerName,
          patientFirstName: r.patientFirstName,
          serviceCode: r.serviceCode,
          serviceDate: r.serviceDate
        });
        return {
          payrollImportId: imp.id,
          payrollPeriodId,
          agencyId,
          userId,
          providerName: r.providerName,
          patientFirstName: r.patientFirstName,
          serviceCode: r.serviceCode,
          serviceDate: r.serviceDate ? formatYmd(r.serviceDate) : null,
          noteStatus: r.noteStatus,
          // DRAFT rows default payable=true; other rows ignore this flag.
          draftPayable: r.noteStatus === 'DRAFT' ? 1 : 0,
          unitCount,
          rowFingerprint,
          requiresProcessing,
          processedAt: null,
          processedByUserId: null
        };
      });

      await PayrollImportRow.bulkInsert(rowsToInsert);
      // Import is a raw ingest step. Do NOT compute totals until "Run Payroll".
      // Clear any prior run results and mark the period as raw_imported.
      await pool.execute('DELETE FROM payroll_summaries WHERE payroll_period_id = ?', [payrollPeriodId]);
      await pool.execute(
        `UPDATE payroll_periods
         SET status = 'raw_imported',
             ran_at = NULL,
             ran_by_user_id = NULL
         WHERE id = ?`,
        [payrollPeriodId]
      );

      const unmatched = rowsToInsert.filter((r) => !r.userId).slice(0, 50);
      res.json({
        import: imp,
        inserted: rowsToInsert.length,
        flaggedMissedAppointmentsPaidInFull: (missedAppointmentsPaidInFull || []).length,
        createdUsers,
        unmatchedProvidersSample: unmatched.map((u) => u.providerName)
      });
    } catch (e) {
      next(e);
    }
  }
];

export const importPayrollAuto = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const { agencyId } = req.body || {};
      const agencyIdNum = agencyId ? parseInt(agencyId) : null;
      if (!agencyIdNum) return res.status(400).json({ error: { message: 'agencyId is required' } });
      const resolvedAgencyId = await requirePayrollAccess(req, res, agencyIdNum);
      if (!resolvedAgencyId) return;
      if (!req.file) return res.status(400).json({ error: { message: 'No CSV/XLSX file uploaded' } });

      let parsed = [];
      let missedAppointmentsPaidInFull = [];
      try {
        const r = parsePayrollFile(req.file.buffer, req.file.originalname);
        parsed = r?.rows || [];
        missedAppointmentsPaidInFull = r?.missedAppointmentsPaidInFull || [];
      } catch (e) {
        return res.status(400).json({
          error: {
            message: e.message || 'Failed to parse report',
            errorMeta: {
              rowNumber: e?.rowNumber || null,
              detectedHeaders: Array.isArray(e?.detectedHeaders) ? e.detectedHeaders : null,
              exampleExpected: Array.isArray(e?.exampleExpected) ? e.exampleExpected : null
            }
          }
        });
      }
      if ((!parsed || parsed.length === 0) && (!missedAppointmentsPaidInFull || missedAppointmentsPaidInFull.length === 0)) {
        return res.status(400).json({ error: { message: 'No rows found in report' } });
      }

      const dates = parsed.map((r) => r.serviceDate).filter(Boolean);
      if (dates.length === 0) {
        return res.status(400).json({
          error: { message: 'Could not detect any service dates in the report. Please ensure it contains a Date of Service column (e.g., "Date of Service" or "DOS").' }
        });
      }

      const maxDate = dates.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));

      // Prefer matching against existing pay period options by majority vote.
      const guess = await guessExistingPayrollPeriodByMajorityDates({ agencyId: resolvedAgencyId, dates });
      let period = guess.period || null;

      // Fallback (legacy): compute Sat→Fri window from max DOS and match exact period if it already exists.
      if (!period) {
        const periodEnd = previousFridayOnOrBefore(maxDate);
        const periodStart = new Date(periodEnd.getTime());
        periodStart.setUTCDate(periodStart.getUTCDate() - 13); // Saturday two weeks prior
        const periodStartStr = formatYmd(periodStart);
        const periodEndStr = formatYmd(periodEnd);
        period = await PayrollPeriod.findByAgencyAndDates({
          agencyId: resolvedAgencyId,
          periodStart: periodStartStr,
          periodEnd: periodEndStr
        });
      }

      if (period && isEffectivelyPostedOrFinalized(period)) {
        return res.status(409).json({ error: { message: 'Detected pay period is posted/finalized and cannot be re-imported.' } });
      }

      if (!period?.id) {
        return res.status(409).json({
          error: {
            message:
              'Could not match this report to an existing pay period. Please choose an existing pay period (or create one) and import again.'
          },
          detected: { maxServiceDate: formatYmd(maxDate) },
          stats: guess?.stats || null
        });
      }

      // Build name->user map for users in agency
      const [agencyUsers] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name
         FROM users u
         JOIN user_agencies ua ON u.id = ua.user_id
         WHERE ua.agency_id = ?`,
        [resolvedAgencyId]
      );

      // H0032 per-user manual minutes toggle (Category 2).
      const h0032ManualMinutesByUserId = new Map();
      try {
        const [uaRows] = await pool.execute(
          `SELECT user_id, h0032_requires_manual_minutes
           FROM user_agencies
           WHERE agency_id = ?`,
          [resolvedAgencyId]
        );
        for (const r of uaRows || []) {
          h0032ManualMinutesByUserId.set(Number(r.user_id), Number(r.h0032_requires_manual_minutes) ? 1 : 0);
        }
      } catch {
        // column may not exist yet
      }

      const nameToIds = new Map();
      for (const u of agencyUsers || []) {
        const first = String(u.first_name || '').trim();
        const last = String(u.last_name || '').trim();
        const a = normalizeName(`${first} ${last}`);
        const b = normalizeName(`${last} ${first}`);
        if (a) addNameKeyToIds(nameToIds, a, u.id);
        if (b) addNameKeyToIds(nameToIds, b, u.id);
      }

      // Auto-create missing provider users so rows can be matched immediately.
      const createdUsers = [];
      const seen = new Set();
      for (const r of parsed || []) {
        const keys = nameKeyCandidates(r.providerName);
        const primaryKey = keys[0] || '';
        if (!primaryKey || seen.has(primaryKey)) continue;
        if (resolveUserIdForProviderName(nameToIds, r.providerName)) continue;
        seen.add(primaryKey);
        const ensured = await ensureUserForProviderName({ agencyId: resolvedAgencyId, providerName: r.providerName });
        if (ensured?.userId) {
          for (const k of keys) addNameKeyToIds(nameToIds, k, ensured.userId);
          createdUsers.push({ providerName: r.providerName, userId: ensured.userId, firstName: ensured.firstName, lastName: ensured.lastName });
        }
      }

      const imp = await PayrollImport.create({
        agencyId: resolvedAgencyId,
        payrollPeriodId: period.id,
        source: (String(req.file.originalname || '').toLowerCase().endsWith('.xlsx') || String(req.file.originalname || '').toLowerCase().endsWith('.xls')) ? 'xlsx' : 'csv',
        originalFilename: req.file.originalname,
        uploadedByUserId: req.user.id
      });

      // Ensure recurring To-Dos exist for this pay period (best-effort).
      try {
        await PayrollPeriodTodo.ensureMaterializedForPeriod({ payrollPeriodId: period.id, agencyId: resolvedAgencyId });
      } catch {
        // ignore
      }

      // Save display-only missed appointment flags (Paid in Full).
      try {
        await PayrollImportMissedAppointment.replaceForImport({
          payrollImportId: imp.id,
          payrollPeriodId: period.id,
          agencyId: resolvedAgencyId,
          rows: missedAppointmentsPaidInFull
        });
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }

      const rowsToInsert = parsed.map((r) => {
        const userId = resolveUserIdForProviderName(nameToIds, r.providerName);
        const codeKey = String(r.serviceCode || '').trim().toUpperCase();

        const isH0031 = codeKey === 'H0031';
        const isH0032 = codeKey === 'H0032';
        const h0032NeedsManualMinutes = isH0032 ? !!h0032ManualMinutesByUserId.get(userId) : false;

        let unitCount = Number(r.unitCount) || 0;
        if (isH0031) {
          if (Math.abs(unitCount - 1) < 1e-9) unitCount = 60;
        } else if (isH0032) {
          if (Math.abs(unitCount - 1) < 1e-9) unitCount = 30;
        }

        const requiresProcessing = isH0031 || (isH0032 && h0032NeedsManualMinutes);
        const rowFingerprint = computeRowFingerprint({
          agencyId: resolvedAgencyId,
          clinicianName: r.providerName,
          patientFirstName: r.patientFirstName,
          serviceCode: r.serviceCode,
          serviceDate: r.serviceDate
        });
        return {
          payrollImportId: imp.id,
          payrollPeriodId: period.id,
          agencyId: resolvedAgencyId,
          userId,
          providerName: r.providerName,
          patientFirstName: r.patientFirstName,
          serviceCode: r.serviceCode,
          serviceDate: r.serviceDate ? formatYmd(r.serviceDate) : null,
          noteStatus: r.noteStatus,
          // DRAFT rows default payable=true; other rows ignore this flag.
          draftPayable: r.noteStatus === 'DRAFT' ? 1 : 0,
          unitCount,
          rowFingerprint,
          requiresProcessing,
          processedAt: null,
          processedByUserId: null
        };
      });

      await PayrollImportRow.bulkInsert(rowsToInsert);
      // Import is a raw ingest step. Do NOT compute totals until "Run Payroll".
      // Clear any prior run results and mark the period as raw_imported.
      await pool.execute('DELETE FROM payroll_summaries WHERE payroll_period_id = ?', [period.id]);
      await pool.execute(
        `UPDATE payroll_periods
         SET status = 'raw_imported',
             ran_at = NULL,
             ran_by_user_id = NULL
         WHERE id = ?`,
        [period.id]
      );

      const unmatchedProvidersSample = rowsToInsert
        .filter((r) => !r.userId)
        .map((r) => r.providerName)
        .slice(0, 25);

      res.json({
        period: await PayrollPeriod.findById(period.id),
        detected: {
          maxServiceDate: formatYmd(maxDate),
          periodStart: String(period.period_start || '').slice(0, 10),
          periodEnd: String(period.period_end || '').slice(0, 10),
          label: period.label || `${String(period.period_start || '').slice(0, 10)} → ${String(period.period_end || '').slice(0, 10)}`
        },
        createdUsers,
        unmatchedProvidersSample,
        stats: guess?.stats || null
      });
    } catch (e) {
      next(e);
    }
  }
];

// Detect pay period from a report (no import). This allows the UI to confirm/override.
export const detectPayrollAuto = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const { agencyId } = req.body || {};
      const agencyIdNum = agencyId ? parseInt(agencyId) : null;
      if (!agencyIdNum) return res.status(400).json({ error: { message: 'agencyId is required' } });
      const resolvedAgencyId = await requirePayrollAccess(req, res, agencyIdNum);
      if (!resolvedAgencyId) return;
      if (!req.file) return res.status(400).json({ error: { message: 'No CSV/XLSX file uploaded' } });

      let parsed = [];
      let missedAppointmentsPaidInFull = [];
      try {
        const r = parsePayrollFile(req.file.buffer, req.file.originalname);
        parsed = r?.rows || [];
        missedAppointmentsPaidInFull = r?.missedAppointmentsPaidInFull || [];
      } catch (e) {
        return res.status(400).json({
          error: {
            message: e.message || 'Failed to parse report',
            errorMeta: {
              rowNumber: e?.rowNumber || null,
              detectedHeaders: Array.isArray(e?.detectedHeaders) ? e.detectedHeaders : null,
              exampleExpected: Array.isArray(e?.exampleExpected) ? e.exampleExpected : null
            }
          }
        });
      }
      if ((!parsed || parsed.length === 0) && (!missedAppointmentsPaidInFull || missedAppointmentsPaidInFull.length === 0)) {
        return res.status(400).json({ error: { message: 'No rows found in report' } });
      }

      const dates = parsed.map((r) => r.serviceDate).filter(Boolean);
      if (dates.length === 0) {
        return res.status(400).json({
          error: { message: 'Could not detect any service dates in the report. Please ensure it contains a Date of Service column (e.g., "Date of Service" or "DOS").' }
        });
      }

      const maxDate = dates.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
      const guess = await guessExistingPayrollPeriodByMajorityDates({ agencyId: resolvedAgencyId, dates });
      const best = guess.period || null;

      // Fallback: compute Sat→Fri and check if that exact period exists.
      let fallbackDetected = null;
      let fallbackExisting = null;
      if (!best) {
        const periodEnd = previousFridayOnOrBefore(maxDate);
        const periodStart = new Date(periodEnd.getTime());
        periodStart.setUTCDate(periodStart.getUTCDate() - 13);
        const periodStartStr = formatYmd(periodStart);
        const periodEndStr = formatYmd(periodEnd);
        fallbackDetected = { periodStartStr, periodEndStr };
        fallbackExisting = await PayrollPeriod.findByAgencyAndDates({
          agencyId: resolvedAgencyId,
          periodStart: periodStartStr,
          periodEnd: periodEndStr
        });
      }

      res.json({
        detected: {
          maxServiceDate: formatYmd(maxDate),
          periodStart: best ? String(best.period_start || '').slice(0, 10) : (fallbackDetected?.periodStartStr || ''),
          periodEnd: best ? String(best.period_end || '').slice(0, 10) : (fallbackDetected?.periodEndStr || ''),
          label: best ? (best.label || `${String(best.period_start || '').slice(0, 10)} → ${String(best.period_end || '').slice(0, 10)}`) : ''
        },
        existingPeriodId: best?.id || fallbackExisting?.id || null,
        stats: guess?.stats || null
      });
    } catch (e) {
      next(e);
    }
  }
];

export const importPayrollRateSheet = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!requireSuperAdmin(req, res)) return;
      const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId) : (req.query?.agencyId ? parseInt(req.query.agencyId) : null);
      if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
      const resolvedAgencyId = await requirePayrollAccess(req, res, agencyId);
      if (!resolvedAgencyId) return;
      if (!req.file) return res.status(400).json({ error: { message: 'No CSV/XLSX file uploaded' } });
      const dryRun = req.body?.dryRun === 'true' || req.body?.dryRun === true;
      const useAi = req.body?.useAi === 'true' || req.body?.useAi === true;

      let parsed = [];
      try {
        // Optionally ask Gemini to map headers if the sheet uses non-standard column names.
        let headerMapping = null;
        if (useAi) {
          try {
            const records = readRateSheetRecords(req.file.buffer, req.file.originalname);
            const normalizedHeaders = Object.keys(records?.[0] || {}).map((h) => normalizeHeaderKey(h)).filter(Boolean);
            headerMapping = await suggestRateSheetHeaderMapping({ normalizedHeaders });
            parsed = parseRateSheetRows(records, headerMapping);
          } catch {
            // fallback to default parsing
            parsed = parseRateSheetFile(req.file.buffer, req.file.originalname);
          }
        } else {
          parsed = parseRateSheetFile(req.file.buffer, req.file.originalname);
        }
      } catch (e) {
        return res.status(400).json({ error: { message: e.message || 'Failed to parse rate sheet' } });
      }
      if (!parsed?.rows?.length) return res.status(400).json({ error: { message: 'No rows found in rate sheet' } });

      // Seed service codes so the full rate sheet UI has columns, even if blank.
      await ensureServiceCodeRulesExist({ agencyId: resolvedAgencyId, serviceCodes: parsed.serviceCodes || [] });

      const [agencyUsers] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name
         FROM users u
         JOIN user_agencies ua ON u.id = ua.user_id
         WHERE ua.agency_id = ?`,
        [resolvedAgencyId]
      );
      const nameToId = new Map();
      for (const u of agencyUsers || []) {
        const first = String(u.first_name || '').trim();
        const last = String(u.last_name || '').trim();
        const a = normalizeName(`${first} ${last}`);
        const b = normalizeName(`${last} ${first}`);
        if (a) nameToId.set(a, u.id);
        if (b) nameToId.set(b, u.id);
      }

      const createdUsers = [];
      const results = {
        agencyId: resolvedAgencyId,
        dryRun,
        useAi: !!useAi,
        processed: 0,
        skippedInactive: 0,
        updatedRateCards: 0,
        replacedPerCodeRatesForUsers: 0,
        upsertedPerCodeRates: 0,
        createdUsers,
        errors: [],
        templatesCreated: 0,
        templatesReused: 0,
        templatesApplied: 0,
        createdTemplates: [],
        rowMatches: []
      };

      const templateCache = new Map(); // fingerprint -> { id, name, reused }

      for (const r of (parsed.rows || [])) {
        results.processed += 1;
        try {
          if (r.status && String(r.status).trim() && String(r.status).trim().toLowerCase() !== 'active') {
            results.skippedInactive += 1;
            continue;
          }

          const keys = nameKeyCandidates(r.employeeName);
          let userId = null;
          for (const k of keys) {
            userId = nameToId.get(k) || null;
            if (userId) break;
          }
          const match = { employeeName: r.employeeName, matchedUserId: null, createdUser: false };
          if (!userId) {
            const { first, last } = parseHumanNameToFirstLast(r.employeeName);
            const canonical = first && last ? `${titleCaseWords(first)} ${titleCaseWords(last)}` : r.employeeName;
            const ensured = await ensureUserForProviderName({ agencyId, providerName: canonical });
            if (!ensured?.userId) throw new Error(`Could not create/find user for "${r.employeeName}"`);
            userId = ensured.userId;
            for (const k of keys) nameToId.set(k, userId);
            createdUsers.push({ providerName: r.employeeName, userId, firstName: ensured.firstName, lastName: ensured.lastName });
            match.createdUser = true;
          }
          match.matchedUserId = userId;
          results.rowMatches.push(match);

          // Build per-code rates with default units so both templates and user rows are consistent.
          const perCodeRatesWithUnit = (r.perCodeRates || []).map((pr) => {
            const code = String(pr.serviceCode).trim();
            const d = payrollDefaultsForCode(code);
            const cat = String(d?.category || '').trim().toLowerCase();
            const isFlatCat = ['mileage', 'bonus', 'reimbursement', 'other_pay'].includes(cat);
            const rateUnit = (() => {
              if (isFlatCat) return 'flat';
              if (r.isVariable) return 'per_unit';
              const dur = Number(d?.durationMinutes ?? 0) || 0;
              const div = Number(d?.payDivisor ?? 1) || 1;
              if (dur <= 0 && div === 1) return 'per_unit';
              return 'per_hour';
            })();
            return { serviceCode: code, rateAmount: Number(pr.rateAmount), rateUnit };
          });

          // Create/reuse a unique pay-matrix template per unique rate signature, and apply it to the user.
          let templateForRow = null;
          if (!dryRun) {
            const fpStr = normalizeRateSheetFingerprint({
              isVariable: !!r.isVariable,
              directRate: r.directRate ?? 0,
              indirectRate: r.indirectRate ?? 0,
              perCodeRates: perCodeRatesWithUnit
            });
            const fingerprint = crypto.createHash('sha256').update(fpStr).digest('hex');

            templateForRow = templateCache.get(fingerprint) || null;
            if (!templateForRow) {
              // Prefer direct fingerprint lookups if the column exists; otherwise fall back to per-code matching.
              let existingTemplate = null;
              try {
                existingTemplate = await PayrollRateTemplate.findByFingerprint({ agencyId: resolvedAgencyId, fingerprint });
              } catch {
                existingTemplate = null;
              }
              if (!existingTemplate) {
                // Backward-compatible fallback: exact per-code fingerprint match (older DBs without fingerprint column).
                const matchByRates = await findMatchingRateTemplateByPerCodeRates({
                  agencyId: resolvedAgencyId,
                  perCodeRates: perCodeRatesWithUnit
                });
                if (matchByRates) {
                  existingTemplate = await PayrollRateTemplate.findById(matchByRates.id);
                }
              }

              if (existingTemplate) {
                templateForRow = { id: existingTemplate.id, name: existingTemplate.name, reused: true, fingerprint };
                results.templatesReused += 1;
              } else {
                const short = fingerprint.slice(0, 12).toUpperCase();
                const templateName = `Pay Matrix ${short}`;
                const t = await PayrollRateTemplate.create({
                  agencyId: resolvedAgencyId,
                  name: templateName,
                  fingerprint,
                  isVariable: r.isVariable ? 1 : 0,
                  directRate: r.directRate ?? 0,
                  indirectRate: r.indirectRate ?? 0,
                  otherRate1: 0,
                  otherRate2: 0,
                  otherRate3: 0,
                  createdByUserId: req.user.id,
                  updatedByUserId: req.user.id
                });
                await PayrollRateTemplateRate.replaceAllForTemplate({
                  templateId: t.id,
                  agencyId: resolvedAgencyId,
                  rates: perCodeRatesWithUnit
                });
                templateForRow = { id: t.id, name: t.name, reused: false, fingerprint };
                results.templatesCreated += 1;
                results.createdTemplates.push({ id: t.id, name: t.name, fingerprint });
              }
              templateCache.set(fingerprint, templateForRow);
            }
          }

          // Replace all per-code rates for this user from the sheet (authoritative import).
          if (!dryRun) {
            await PayrollRate.deleteAllForUser(resolvedAgencyId, userId);
          }
          results.replacedPerCodeRatesForUsers += 1;
          for (const pr of perCodeRatesWithUnit) {
            if (!dryRun) {
              await PayrollRate.upsert({
                agencyId: resolvedAgencyId,
                userId,
                serviceCode: String(pr.serviceCode).trim(),
                rateAmount: Number(pr.rateAmount),
                rateUnit: pr.rateUnit || 'per_unit',
                effectiveStart: null,
                effectiveEnd: null
              });
            }
            results.upsertedPerCodeRates += 1;
          }

          if (r.isVariable) {
            // Fee-for-service: do not apply hourly rate card fallbacks.
            if (!dryRun) await PayrollRateCard.deleteForUser(resolvedAgencyId, userId);
          } else {
            // Hourly: keep rate card (direct/indirect), but per-code overrides can still apply in payroll compute.
            if (!dryRun) {
              await PayrollRateCard.upsert({
                agencyId: resolvedAgencyId,
                userId,
                directRate: r.directRate ?? 0,
                indirectRate: r.indirectRate ?? 0,
                otherRate1: 0,
                otherRate2: 0,
                otherRate3: 0,
                updatedByUserId: req.user.id
              });
            }
            results.updatedRateCards += 1;
          }

          if (templateForRow) {
            results.templatesApplied += 1;
          }
        } catch (e) {
          results.errors.push({
            row: r.rowNumber,
            employeeName: r.employeeName,
            error: e.message || String(e)
          });
        }
      }

      res.json(results);
    } catch (e) {
      next(e);
    }
  }
];

// ==========================
// Payroll Tools (NO STORAGE)
// ==========================

// Compare two reports using v4 stable row keys. This does NOT write anything to DB.
export const toolComparePayrollFiles = [
  upload.fields([{ name: 'file1', maxCount: 1 }, { name: 'file2', maxCount: 1 }]),
  async (req, res, next) => {
    try {
      const agencyId = await requirePayrollAccess(req, res, req.body?.agencyId || req.query?.agencyId);
      if (!agencyId) return;

      const f1 = req.files?.file1?.[0] || null;
      const f2 = req.files?.file2?.[0] || null;
      if (!f1 || !f2) {
        return res.status(400).json({ error: { message: 'file1 and file2 are required' } });
      }

      const rows1 = parsePayrollFile(f1.buffer, f1.originalname || 'file1.csv')?.rows || [];
      const rows2 = parsePayrollFile(f2.buffer, f2.originalname || 'file2.csv')?.rows || [];

      const idx1 = buildRowKeyAggregateIndex({ agencyId, parsedRows: rows1 });
      const idx2 = buildRowKeyAggregateIndex({ agencyId, parsedRows: rows2 });

      const keys = new Set([...idx1.keys(), ...idx2.keys()]);
      const changes = [];
      let added = 0;
      let removed = 0;
      let changed = 0;
      let unchanged = 0;

      const sameUnits = (a, b) =>
        Number((Number(a?.NO_NOTE || 0)).toFixed(2)) === Number((Number(b?.NO_NOTE || 0)).toFixed(2)) &&
        Number((Number(a?.DRAFT || 0)).toFixed(2)) === Number((Number(b?.DRAFT || 0)).toFixed(2)) &&
        Number((Number(a?.FINALIZED || 0)).toFixed(2)) === Number((Number(b?.FINALIZED || 0)).toFixed(2));

      for (const k of keys) {
        const a = idx1.get(k) || null;
        const b = idx2.get(k) || null;
        if (!a && b) {
          added++;
          changes.push({ changeType: 'added', before: null, after: b });
          continue;
        }
        if (a && !b) {
          removed++;
          changes.push({ changeType: 'removed', before: a, after: null });
          continue;
        }
        // both present
        if (sameUnits(a.unitsByStatus, b.unitsByStatus)) {
          unchanged++;
        } else {
          changed++;
          changes.push({ changeType: 'changed', before: a, after: b });
        }
      }

      // Deterministic ordering for UI (DOS desc then code/provider).
      changes.sort((x, y) => {
        const ax = x.after || x.before;
        const ay = y.after || y.before;
        const d1 = String(ay?.ymd || '').localeCompare(String(ax?.ymd || ''));
        if (d1) return d1;
        const c1 = String(ax?.serviceCode || '').localeCompare(String(ay?.serviceCode || ''));
        if (c1) return c1;
        return String(ax?.providerName || '').localeCompare(String(ay?.providerName || ''), undefined, { sensitivity: 'base' });
      });

      res.json({
        ok: true,
        agencyId,
        file1: { name: f1.originalname || 'file1', rows: rows1.length },
        file2: { name: f2.originalname || 'file2', rows: rows2.length },
        summary: {
          totalKeys: keys.size,
          added,
          removed,
          changed,
          unchanged
        },
        // Return full list; frontend can truncate display if needed.
        changes
      });
    } catch (e) {
      next(e);
    }
  }
];

// Preview staging-like totals from a report. This does NOT write anything to DB.
export const toolPreviewPayrollFileStaging = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const agencyId = await requirePayrollAccess(req, res, req.body?.agencyId || req.query?.agencyId);
      if (!agencyId) return;
      if (!req.file) return res.status(400).json({ error: { message: 'file is required' } });

      const parsed = parsePayrollFile(req.file.buffer, req.file.originalname || 'file.csv')?.rows || [];

      // Build name->user map for users in agency (read-only).
      const [agencyUsers] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name
         FROM users u
         JOIN user_agencies ua ON u.id = ua.user_id
         WHERE ua.agency_id = ?`,
        [agencyId]
      );
      const nameToIds = new Map();
      const userMap = new Map();
      for (const u of agencyUsers || []) {
        userMap.set(Number(u.id), u);
        const first = String(u.first_name || '').trim();
        const last = String(u.last_name || '').trim();
        const a = normalizeName(`${first} ${last}`);
        const b = normalizeName(`${last} ${first}`);
        if (a) addNameKeyToIds(nameToIds, a, u.id);
        if (b) addNameKeyToIds(nameToIds, b, u.id);
      }

      const matchedMap = new Map(); // `${userId}:${CODE}` -> row
      const unmatchedMap = new Map(); // `${providerName}:${CODE}` -> row
      const normCode = (v) => String(v || '').trim();

      const addTo = (rowMap, key, base) => {
        if (!rowMap.has(key)) {
          rowMap.set(key, {
            ...base,
            raw: { noNoteUnits: 0, draftUnits: 0, finalizedUnits: 0 },
            effective: { noNoteUnits: 0, draftUnits: 0, finalizedUnits: 0 },
            carryover: { oldDoneNotesUnits: 0, priorStillUnpaidUnits: 0 },
            override: null
          });
        }
        return rowMap.get(key);
      };

      for (const r of parsed || []) {
        const providerName = String(r?.providerName || '').trim();
        const serviceCode = normCode(r?.serviceCode);
        const units = Number(r?.unitCount || 0);
        if (!providerName || !serviceCode || !Number.isFinite(units) || units <= 0) continue;

        const userId = resolveUserIdForProviderName(nameToIds, providerName);
        const bucket = compareToolBucket(r?.noteStatus);
        const inc = (t) => {
          if (bucket === 'NO_NOTE') t.noNoteUnits = Number((Number(t.noNoteUnits || 0) + units).toFixed(2));
          else if (bucket === 'DRAFT') t.draftUnits = Number((Number(t.draftUnits || 0) + units).toFixed(2));
          else t.finalizedUnits = Number((Number(t.finalizedUnits || 0) + units).toFixed(2));
        };

        if (userId) {
          const u = userMap.get(Number(userId)) || null;
          const key = `${userId}:${serviceCode}`;
          const row = addTo(matchedMap, key, {
            userId: Number(userId),
            providerName,
            firstName: u?.first_name || null,
            lastName: u?.last_name || null,
            serviceCode
          });
          inc(row.raw);
          inc(row.effective);
        } else {
          const key = `${providerName}:${serviceCode}`;
          const row = addTo(unmatchedMap, key, {
            userId: null,
            providerName,
            firstName: null,
            lastName: null,
            serviceCode
          });
          inc(row.raw);
          inc(row.effective);
        }
      }

      const matched = Array.from(matchedMap.values());
      const unmatched = Array.from(unmatchedMap.values());
      matched.sort((a, b) => {
        const n1 = String(a.lastName || '').localeCompare(String(b.lastName || ''), undefined, { sensitivity: 'base' });
        if (n1) return n1;
        const n2 = String(a.firstName || '').localeCompare(String(b.firstName || ''), undefined, { sensitivity: 'base' });
        if (n2) return n2;
        return String(a.serviceCode || '').localeCompare(String(b.serviceCode || ''));
      });
      unmatched.sort((a, b) => {
        const n1 = String(a.providerName || '').localeCompare(String(b.providerName || ''), undefined, { sensitivity: 'base' });
        if (n1) return n1;
        return String(a.serviceCode || '').localeCompare(String(b.serviceCode || ''));
      });

      res.json({
        ok: true,
        agencyId,
        file: { name: req.file.originalname || 'file', rows: parsed.length },
        matched,
        unmatched
      });
    } catch (e) {
      next(e);
    }
  }
];

export const listPayrollAgencyUsers = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyId);
    if (!resolvedAgencyId) return;

    // Optional columns (older DBs)
    let hasSupervisorPrivilegesCol = false;
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'has_supervisor_privileges'",
        [dbName]
      );
      hasSupervisorPrivilegesCol = (cols || []).length > 0;
    } catch {
      hasSupervisorPrivilegesCol = false;
    }

    // Optional "is_active" (used to hide archived users from payroll dropdowns)
    let hasIsActiveCol = false;
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [cols2] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_active'",
        [dbName]
      );
      hasIsActiveCol = (cols2 || []).length > 0;
    } catch {
      hasIsActiveCol = false;
    }

    const supField = hasSupervisorPrivilegesCol ? ', u.has_supervisor_privileges' : '';
    const activeFilter = hasIsActiveCol ? ' AND u.is_active = TRUE' : '';
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.role${supField}
       FROM users u
       JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ?
       ${activeFilter}
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [resolvedAgencyId]
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const getPayrollStaging = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    const aggregates = await PayrollImportRow.listAggregatedForPeriod(payrollPeriodId);
    const overrides = await PayrollStagingOverride.listForPeriod(payrollPeriodId);
    const carryovers = await PayrollStageCarryover.listForPeriod(payrollPeriodId);
    const priorUnpaidStage = await PayrollStagePriorUnpaid.listForPeriod(payrollPeriodId);
    let manualPayLines = [];
    try {
      manualPayLines = await PayrollManualPayLine.listForPeriod({ payrollPeriodId, agencyId: period.agency_id });
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      manualPayLines = [];
    }
    const rules = await PayrollServiceCodeRule.listForAgency(period.agency_id);
    const ruleByCode = new Map(
      (rules || []).map((r) => [String(r.service_code || '').trim().toUpperCase(), r])
    );
    const overrideKey = new Map();
    for (const o of overrides || []) {
      overrideKey.set(`${o.user_id}:${o.service_code}`, o);
    }
    const carryKey = new Map();
    for (const c of carryovers || []) {
      carryKey.set(`${c.user_id}:${c.service_code}`, {
        oldDoneNotesUnits: Number(c.carryover_finalized_units || 0),
        sourcePayrollPeriodId: c.source_payroll_period_id || null,
        computedAt: c.computed_at || null,
        computedByUserId: c.computed_by_user_id || null
      });
    }
    const priorUnpaidKey = new Map(); // `${userId}:${serviceCode}` -> { stillUnpaidUnits, sourcePayrollPeriodId, computedAt, computedByUserId }
    for (const p of priorUnpaidStage || []) {
      priorUnpaidKey.set(`${p.user_id}:${p.service_code}`, {
        stillUnpaidUnits: Number(p.still_unpaid_units || 0),
        sourcePayrollPeriodId: p.source_payroll_period_id || null,
        computedAt: p.computed_at || null,
        computedByUserId: p.computed_by_user_id || null
      });
    }

    // Load user names for matched rows.
    const idsFromAgg = (aggregates || []).map((a) => a.user_id).filter((x) => !!x);
    const idsFromCarry = (carryovers || []).map((c) => c.user_id).filter((x) => !!x);
    const idsFromPriorUnpaid = (priorUnpaidStage || []).map((p) => p.user_id).filter((x) => !!x);
    const userIds = Array.from(new Set([...idsFromAgg, ...idsFromCarry, ...idsFromPriorUnpaid])).map((x) => parseInt(x));
    let userMap = new Map();
    if (userIds.length) {
      const placeholders = userIds.map(() => '?').join(',');
      const [urows] = await pool.execute(
        `SELECT id, first_name, last_name FROM users WHERE id IN (${placeholders})`,
        userIds
      );
      userMap = new Map((urows || []).map((u) => [u.id, u]));
    }

    const matched = [];
    const unmatched = [];

    // Track aggregate keys so we can add carryover-only rows.
    const aggKeys = new Set();
    for (const a of aggregates || []) {
      aggKeys.add(`${a.user_id || 'null'}:${a.service_code}`);
    }

    for (const a of aggregates || []) {
      const raw = {
        noNoteUnits: Number(a.raw_no_note_units || 0),
        // Treat draft_not_payable as "draft" (unpaid), and roll draft_payable into finalized (paid by default).
        draftUnits: Number(a.raw_draft_not_payable_units || 0),
        finalizedUnits: Number(a.raw_finalized_units || 0) + Number(a.raw_draft_payable_units || 0)
      };
      if (!a.user_id) {
        unmatched.push({
          userId: null,
          providerName: a.provider_name,
          serviceCode: a.service_code,
          raw,
          effective: raw,
          override: null
        });
        continue;
      }
      const o = overrideKey.get(`${a.user_id}:${a.service_code}`) || null;
      const baseEffective = o
        ? {
            noNoteUnits: Number(o.no_note_units || 0),
            draftUnits: Number(o.draft_units || 0),
            finalizedUnits: Number(o.finalized_units || 0)
          }
        : raw;
      const key = `${a.user_id}:${a.service_code}`;
      const carry = carryKey.get(key) || { oldDoneNotesUnits: 0 };
      const priorUnpaid = priorUnpaidKey.get(key) || { stillUnpaidUnits: 0 };
      const effective = {
        ...baseEffective,
        finalizedUnits: Number(baseEffective.finalizedUnits || 0) + Number(carry.oldDoneNotesUnits || 0)
      };
      const u = userMap.get(a.user_id) || null;
      matched.push({
        userId: a.user_id,
        providerName: a.provider_name,
        firstName: u?.first_name || null,
        lastName: u?.last_name || null,
        serviceCode: a.service_code,
        raw,
        effective,
        carryover: { ...carry, priorStillUnpaidUnits: Number(priorUnpaid.stillUnpaidUnits || 0), priorStillUnpaid: priorUnpaid },
        override: o
          ? {
              noNoteUnits: Number(o.no_note_units || 0),
              draftUnits: Number(o.draft_units || 0),
              finalizedUnits: Number(o.finalized_units || 0),
              updatedByUserId: o.updated_by_user_id,
              updatedAt: o.updated_at
            }
          : null
      });
    }

    // Include carryover-only rows so they appear in Payroll Stage (yellow highlight),
    // even if the current period has no imported rows for that provider+serviceCode.
    for (const c of carryovers || []) {
      const key = `${c.user_id}:${c.service_code}`;
      if (aggKeys.has(key)) continue;
      const raw = { noNoteUnits: 0, draftUnits: 0, finalizedUnits: 0 };
      const o = overrideKey.get(key) || null;
      const baseEffective = o
        ? {
            noNoteUnits: Number(o.no_note_units || 0),
            draftUnits: Number(o.draft_units || 0),
            finalizedUnits: Number(o.finalized_units || 0)
          }
        : raw;
      const carry = carryKey.get(key) || { oldDoneNotesUnits: 0 };
      const priorUnpaid = priorUnpaidKey.get(key) || { stillUnpaidUnits: 0 };
      const effective = {
        ...baseEffective,
        finalizedUnits: Number(baseEffective.finalizedUnits || 0) + Number(carry.oldDoneNotesUnits || 0)
      };
      const u = userMap.get(c.user_id) || null;
      matched.push({
        userId: c.user_id,
        providerName: null,
        firstName: u?.first_name || null,
        lastName: u?.last_name || null,
        serviceCode: c.service_code,
        raw,
        effective,
        carryover: { ...carry, priorStillUnpaidUnits: Number(priorUnpaid.stillUnpaidUnits || 0), priorStillUnpaid: priorUnpaid },
        override: o
          ? {
              noNoteUnits: Number(o.no_note_units || 0),
              draftUnits: Number(o.draft_units || 0),
              finalizedUnits: Number(o.finalized_units || 0),
              updatedByUserId: o.updated_by_user_id,
              updatedAt: o.updated_at
            }
          : null
      });
    }

    // Tier preview per user (for Payroll Stage UI)
    const tierSettings = await getAgencyTierSettings(period.agency_id);
    const tierByUserId = {};
    const byUser = new Map();
    for (const r of matched) {
      if (!r?.userId) continue;
      if (!byUser.has(r.userId)) byUser.set(r.userId, []);
      byUser.get(r.userId).push(r);
    }
    for (const [uid, rows] of byUser.entries()) {
      if (!tierSettings.enabled) {
        tierByUserId[uid] = null;
        continue;
      }
      // Tier preview should match stage math:
      // - DIRECT Credits/Hours only
      // - Present period only (exclude Old Done Notes)
      let directTierCreditsThisPeriod = 0;
      for (const r of rows || []) {
        const codeKey = String(r?.serviceCode || '').trim().toUpperCase();
        const rule = ruleByCode.get(codeKey) || null;
        const defaults = payrollDefaultsForCode(codeKey);
        const category = String(rule?.category ?? defaults?.category ?? 'direct').trim().toLowerCase();
        const bucket =
          (category === 'indirect' || category === 'admin' || category === 'meeting') ? 'indirect'
            : (category === 'other' || category === 'tutoring') ? 'other'
              : (category === 'mileage' || category === 'bonus' || category === 'reimbursement' || category === 'other_pay') ? 'flat'
                : 'direct';
        if (bucket !== 'direct') continue;
        const baseFinalizedUnits = Number(r?.override?.finalizedUnits ?? r?.raw?.finalizedUnits ?? 0);
        const creditValue = Number(
          (rule?.credit_value === null || rule?.credit_value === undefined)
            ? (defaults?.creditValue ?? 0)
            : rule.credit_value
        );
        const safeCredit = Number.isFinite(creditValue) ? creditValue : 0;
        directTierCreditsThisPeriod += baseFinalizedUnits * safeCredit;
      }

      const tierCreditsThisPeriod = directTierCreditsThisPeriod;
      const hist = await getTierHistorySum({ agencyId: period.agency_id, userId: uid, periodEnd: period.period_end, limit: TIER_WINDOW_PERIODS });
      const windowCount = hist.count + 1;
      const windowSum = hist.sum + tierCreditsThisPeriod;
      const biWeeklyAvg = windowCount > 0 ? (windowSum / windowCount) : 0;
      const weeklyAvg = biWeeklyAvg / 2;
      const tierLevel = tierLevelFromWeeklyAvg(weeklyAvg, tierSettings.thresholds);
      const prevCount = hist.count;
      const prevSum = hist.sum;
      const prevBi = prevCount > 0 ? (prevSum / prevCount) : 0;
      const prevWk = prevBi / 2;
      const prevTier = tierLevelFromWeeklyAvg(prevWk, tierSettings.thresholds);
      const displayBiWeeklyTotal = tierCreditsThisPeriod;
      const displayWeeklyAvg = displayBiWeeklyTotal / 2;
      const displayTierLevel = tierLevelFromWeeklyAvg(displayWeeklyAvg, tierSettings.thresholds);
      const prior = await getImmediatePriorPeriodTierStats({
        agencyId: period.agency_id,
        userId: uid,
        periodStart: period.period_start,
        thresholds: tierSettings.thresholds,
        defaultBiWeeklyTotal: displayBiWeeklyTotal
      });
      const prevPeriodWeeklyAvg = Number(prior.weeklyAvg || 0);
      const prevPeriodTierLevel = Number(prior.tierLevel || 0);
      const graceActive = (prevPeriodTierLevel >= 1 && displayTierLevel < prevPeriodTierLevel) ? 1 : 0;
      const benefitTierLevel = graceActive ? prevPeriodTierLevel : displayTierLevel;
      tierByUserId[uid] = {
        // Back-compat fields (used elsewhere)
        tierLevel: benefitTierLevel,
        status: graceActive
          ? `Grace (last pay period Tier ${prevPeriodTierLevel}: ${Number(prior.biWeeklyTotal || 0).toFixed(1)} bi-wk; ${Number(prevPeriodWeeklyAvg).toFixed(1)}/wk)`
          : tierStatusLabel({ tierLevel: benefitTierLevel, prevTierLevel: prevPeriodTierLevel }),
        label: graceActive
          ? `Tier ${benefitTierLevel} (grace; current ${Number(displayBiWeeklyTotal).toFixed(1)} bi-wk; last ${Number(prior.biWeeklyTotal || 0).toFixed(1)} bi-wk)`
          : fmtTierLabelCurrentPeriod({ tierLevel: benefitTierLevel, biWeeklyTotal: displayBiWeeklyTotal, weeklyAvg: displayWeeklyAvg }),
        biWeeklyTotal: displayBiWeeklyTotal,
        weeklyAvg: displayWeeklyAvg,

        // Explicit fields for the Payroll Stage tier UI:
        graceActive,
        currentPeriodTierLevel: displayTierLevel,
        benefitTierLevel,
        lastPayPeriodTierLevel: prevPeriodTierLevel,
        rolling: {
          windowPeriods: windowCount,
          sum: windowSum,
          biWeeklyAvg,
          weeklyAvg,
          tierLevel,
          lastPayPeriodWeeklyAvg: prevPeriodWeeklyAvg,
          lastPayPeriod: {
            biWeeklyTotal: Number(prior.biWeeklyTotal || 0),
            weeklyAvg: prevPeriodWeeklyAvg,
            tierLevel: prevPeriodTierLevel
          },
          prev: { tierLevel: prevTier, weeklyAvg: prevWk, biWeeklyAvg: prevBi, sum: prevSum, windowPeriods: prevCount }
        }
      };
    }

    const priorStillUnpaidMeta = {
      sourcePayrollPeriodId: (priorUnpaidStage || [])?.[0]?.source_payroll_period_id || null,
      computedAt: (priorUnpaidStage || [])?.[0]?.computed_at || null,
      computedByUserId: (priorUnpaidStage || [])?.[0]?.computed_by_user_id || null
    };
    const priorStillUnpaid = (priorUnpaidStage || [])
      .map((p) => {
        const uid = Number(p.user_id || 0);
        const u = userMap.get(uid) || null;
        return {
          userId: uid,
          serviceCode: String(p.service_code || ''),
          stillUnpaidUnits: Number(p.still_unpaid_units || 0),
          sourcePayrollPeriodId: p.source_payroll_period_id || null,
          computedAt: p.computed_at || null,
          computedByUserId: p.computed_by_user_id || null,
          firstName: u?.first_name || null,
          lastName: u?.last_name || null
        };
      })
      .filter((r) => Number(r.userId || 0) > 0 && String(r.serviceCode || '').trim() && Number(r.stillUnpaidUnits || 0) > 0);

    res.json({
      period,
      matched,
      unmatched,
      tierByUserId,
      manualPayLines,
      priorStillUnpaid,
      priorStillUnpaidMeta
    });
  } catch (e) {
    next(e);
  }
};

export const listPayrollManualPayLines = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id, 10);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    try {
      const rows = await PayrollManualPayLine.listForPeriod({ payrollPeriodId, agencyId: period.agency_id });
      res.json(rows || []);
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return res.json([]);
      throw e;
    }
  } catch (e) {
    next(e);
  }
};

// ==========================
// Payroll To-Dos (blocking)
// ==========================

export const listPayrollTodoTemplates = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    const rows = await PayrollTodoTemplate.listForAgency({ agencyId, includeInactive: true });
    res.json(rows || []);
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return res.json([]);
    next(e);
  }
};

export const createPayrollTodoTemplate = async (req, res, next) => {
  try {
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const title = String(req.body?.title || '').trim().slice(0, 180);
    const description = req.body?.description === null || req.body?.description === undefined ? null : String(req.body.description);
    const scopeRaw = String(req.body?.scope || 'agency').trim().toLowerCase();
    const scope = scopeRaw === 'provider' ? 'provider' : 'agency';
    const targetUserId = req.body?.targetUserId ? parseInt(req.body.targetUserId, 10) : 0;
    const startPayrollPeriodId = req.body?.startPayrollPeriodId ? parseInt(req.body.startPayrollPeriodId, 10) : 0;
    const isActive = (req.body?.isActive === undefined || req.body?.isActive === null) ? 1 : (req.body.isActive ? 1 : 0);

    if (!title) return res.status(400).json({ error: { message: 'title is required' } });
    if (scope === 'provider' && !(targetUserId > 0)) {
      return res.status(400).json({ error: { message: 'targetUserId is required for provider-scoped templates' } });
    }

    const id = await PayrollTodoTemplate.create({
      agencyId,
      title,
      description,
      scope,
      targetUserId: scope === 'provider' ? targetUserId : 0,
      startPayrollPeriodId: startPayrollPeriodId || 0,
      createdByUserId: req.user.id,
      updatedByUserId: req.user.id
    });

    // Best-effort: if a start period is set, materialize it immediately.
    if (startPayrollPeriodId) {
      try {
        await PayrollPeriodTodo.ensureMaterializedForPeriod({ payrollPeriodId: startPayrollPeriodId, agencyId });
      } catch { /* ignore */ }
    }

    res.status(201).json({ ok: true, id });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(409).json({ error: { message: 'Payroll To-Do tables are not available yet (run database migrations first).' } });
    }
    next(e);
  }
};

export const patchPayrollTodoTemplate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.templateId, 10);
    if (!id) return res.status(400).json({ error: { message: 'templateId is required' } });
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : (req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const title = String(req.body?.title || '').trim().slice(0, 180);
    const description = req.body?.description === null || req.body?.description === undefined ? null : String(req.body.description);
    const scopeRaw = String(req.body?.scope || 'agency').trim().toLowerCase();
    const scope = scopeRaw === 'provider' ? 'provider' : 'agency';
    const targetUserId = req.body?.targetUserId ? parseInt(req.body.targetUserId, 10) : 0;
    const startPayrollPeriodId = req.body?.startPayrollPeriodId ? parseInt(req.body.startPayrollPeriodId, 10) : 0;
    const isActive = (req.body?.isActive === undefined || req.body?.isActive === null) ? 1 : (req.body.isActive ? 1 : 0);

    if (!title) return res.status(400).json({ error: { message: 'title is required' } });
    if (scope === 'provider' && !(targetUserId > 0)) {
      return res.status(400).json({ error: { message: 'targetUserId is required for provider-scoped templates' } });
    }

    await PayrollTodoTemplate.update({
      id,
      agencyId,
      title,
      description,
      scope,
      targetUserId: scope === 'provider' ? targetUserId : 0,
      startPayrollPeriodId: startPayrollPeriodId || 0,
      isActive,
      updatedByUserId: req.user.id
    });

    res.json({ ok: true });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return res.status(409).json({ error: { message: 'Payroll To-Do tables are not available yet (run database migrations first).' } });
    next(e);
  }
};

export const deletePayrollTodoTemplate = async (req, res, next) => {
  try {
    const id = parseInt(req.params.templateId, 10);
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!id || !agencyId) return res.status(400).json({ error: { message: 'templateId and agencyId are required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    await PayrollTodoTemplate.delete({ id, agencyId });
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return res.json({ ok: true });
    next(e);
  }
};

export const listPayrollPeriodTodos = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id, 10);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;
    try {
      await PayrollPeriodTodo.ensureMaterializedForPeriod({ payrollPeriodId, agencyId: period.agency_id });
    } catch { /* ignore */ }
    const rows = await PayrollPeriodTodo.listForPeriod({ payrollPeriodId, agencyId: period.agency_id });
    res.json(rows || []);
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return res.json([]);
    next(e);
  }
};

export const createPayrollPeriodTodo = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id, 10);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    const title = String(req.body?.title || '').trim().slice(0, 180);
    const description = req.body?.description === null || req.body?.description === undefined ? null : String(req.body.description);
    const scopeRaw = String(req.body?.scope || 'agency').trim().toLowerCase();
    const scope = scopeRaw === 'provider' ? 'provider' : 'agency';
    const targetUserId = req.body?.targetUserId ? parseInt(req.body.targetUserId, 10) : 0;
    if (!title) return res.status(400).json({ error: { message: 'title is required' } });
    if (scope === 'provider' && !(targetUserId > 0)) {
      return res.status(400).json({ error: { message: 'targetUserId is required for provider-scoped To-Dos' } });
    }

    const id = await PayrollPeriodTodo.createAdHoc({
      payrollPeriodId,
      agencyId: period.agency_id,
      title,
      description,
      scope,
      targetUserId: scope === 'provider' ? targetUserId : 0,
      createdByUserId: req.user.id
    });

    res.status(201).json({ ok: true, id });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return res.status(409).json({ error: { message: 'Payroll To-Do tables are not available yet (run database migrations first).' } });
    next(e);
  }
};

export const patchPayrollPeriodTodo = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id, 10);
    const todoId = parseInt(req.params.todoId, 10);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;
    if (!todoId) return res.status(400).json({ error: { message: 'todoId is required' } });

    const statusRaw = String(req.body?.status || '').trim().toLowerCase();
    if (!(statusRaw === 'done' || statusRaw === 'pending')) {
      return res.status(400).json({ error: { message: 'status must be done or pending' } });
    }
    await PayrollPeriodTodo.setStatus({
      todoId,
      payrollPeriodId,
      agencyId: period.agency_id,
      status: statusRaw,
      doneByUserId: req.user.id
    });

    res.json({ ok: true });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return res.status(409).json({ error: { message: 'Payroll To-Do tables are not available yet (run database migrations first).' } });
    next(e);
  }
};

// ==========================
// Payroll Wizard Progress
// ==========================

export const getPayrollWizardProgress = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id, 10);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    const row = await PayrollWizardProgress.get({
      agencyId: period.agency_id,
      userId: req.user.id,
      payrollPeriodId
    });
    res.json(row ? { state: row.state_json } : { state: null });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return res.json({ state: null });
    next(e);
  }
};

export const putPayrollWizardProgress = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id, 10);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    const state = req.body?.state ?? null;
    const row = await PayrollWizardProgress.upsert({
      agencyId: period.agency_id,
      userId: req.user.id,
      payrollPeriodId,
      state
    });
    res.json({ ok: true, state: row?.state_json ?? null });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(409).json({ error: { message: 'Payroll wizard progress table is not available yet (run database migrations first).' } });
    }
    next(e);
  }
};

export const createPayrollManualPayLine = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id, 10);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    const st = String(period.status || '').toLowerCase();
    if (st === 'finalized' || st === 'posted') {
      return res.status(409).json({ error: { message: 'Pay period is posted/finalized' } });
    }

    const userId = req.body?.userId ? parseInt(req.body.userId, 10) : null;
    const lineTypeRaw = String(req.body?.lineType || req.body?.line_type || 'pay').trim().toLowerCase();
    const lineType = lineTypeRaw === 'pto' ? 'pto' : 'pay';
    const ptoBucketRaw = String(req.body?.ptoBucket || req.body?.pto_bucket || 'sick').trim().toLowerCase();
    const ptoBucket = ptoBucketRaw === 'training' ? 'training' : 'sick';
    const label = String(req.body?.label || '').trim();
    const category = String(req.body?.category || 'indirect').trim().toLowerCase();
    const creditsHoursRaw =
      req.body?.creditsHours === null || req.body?.creditsHours === undefined || req.body?.creditsHours === ''
        ? (req.body?.credits_hours === null || req.body?.credits_hours === undefined || req.body?.credits_hours === '' ? null : Number(req.body?.credits_hours))
        : Number(req.body?.creditsHours);
    const amountNum = req.body?.amount === null || req.body?.amount === undefined || req.body?.amount === '' ? null : Number(req.body?.amount);
    if (!userId || !label) return res.status(400).json({ error: { message: 'userId and label are required' } });
    if (!(category === 'direct' || category === 'indirect')) {
      return res.status(400).json({ error: { message: 'category must be direct or indirect' } });
    }
    if (lineType === 'pto') {
      if (creditsHoursRaw === null || !Number.isFinite(creditsHoursRaw) || Math.abs(Number(creditsHoursRaw || 0)) < 1e-9) {
        return res.status(400).json({ error: { message: 'PTO adjustment requires creditsHours (positive or negative)' } });
      }
    } else {
      if (creditsHoursRaw !== null && (!Number.isFinite(creditsHoursRaw) || creditsHoursRaw < 0)) {
        return res.status(400).json({ error: { message: 'creditsHours must be a non-negative number (or blank)' } });
      }
    }
    const amount = lineType === 'pto' ? 0 : Number(amountNum);
    if (lineType !== 'pto') {
      if (!Number.isFinite(amount)) return res.status(400).json({ error: { message: 'amount must be a number' } });
      if (Math.abs(amount) < 1e-9) return res.status(400).json({ error: { message: 'amount cannot be 0' } });
    }
    if (label.length > 128) return res.status(400).json({ error: { message: 'label must be 128 characters or fewer' } });

    // Ensure user is in this agency.
    const [ua] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE agency_id = ? AND user_id = ? LIMIT 1`,
      [period.agency_id, userId]
    );
    if (!ua?.length) return res.status(400).json({ error: { message: 'Selected provider is not assigned to this organization' } });

    // PTO adjustments require a PTO account with a start effective date set.
    if (lineType === 'pto') {
      const acct = await PayrollPtoAccount.findForAgencyUser({ agencyId: period.agency_id, userId });
      const startEff = ptoBucket === 'training' ? acct?.training_start_effective_date : acct?.sick_start_effective_date;
      if (!acct || !startEff) {
        return res.status(409).json({ error: { message: 'Cannot apply PTO adjustment until the user PTO start date is set in their profile.' } });
      }
    }

    const id = await PayrollManualPayLine.create({
      payrollPeriodId,
      agencyId: period.agency_id,
      userId,
      lineType,
      ptoBucket: (lineType === 'pto' ? ptoBucket : null),
      label,
      category,
      creditsHours: creditsHoursRaw,
      amount,
      createdByUserId: req.user.id
    });

    // If this is a PTO adjustment, immediately apply it to the user's PTO ledger/balance.
    if (lineType === 'pto') {
      const acct = await PayrollPtoAccount.findForAgencyUser({ agencyId: period.agency_id, userId });
      const eff = String((ptoBucket === 'training' ? acct?.training_start_effective_date : acct?.sick_start_effective_date) || period.period_end || period.period_start || '').slice(0, 10);
      const delta = Number(creditsHoursRaw || 0);
      await PayrollPtoLedger.create({
        agencyId: period.agency_id,
        userId,
        entryType: 'manual_adjustment',
        ptoBucket,
        hoursDelta: delta,
        effectiveDate: eff,
        payrollPeriodId,
        requestId: null,
        manualPayLineId: id,
        note: `Manual PTO adjustment (${label})`,
        createdByUserId: req.user.id
      });
      // Update balance fields.
      const sickBal = Number(acct?.sick_balance_hours || 0);
      const trainingBal = Number(acct?.training_balance_hours || 0);
      const nextSickBal = ptoBucket === 'training' ? sickBal : (sickBal + delta);
      const nextTrainingBal = ptoBucket === 'training' ? (trainingBal + delta) : trainingBal;
      await PayrollPtoAccount.upsert({
        agencyId: period.agency_id,
        userId,
        employmentType: acct.employment_type,
        trainingPtoEligible: acct.training_pto_eligible ? 1 : 0,
        sickStartHours: acct.sick_start_hours,
        sickStartEffectiveDate: acct.sick_start_effective_date,
        trainingStartHours: acct.training_start_hours,
        trainingStartEffectiveDate: acct.training_start_effective_date,
        sickBalanceHours: nextSickBal,
        trainingBalanceHours: nextTrainingBal,
        lastAccruedPayrollPeriodId: acct.last_accrued_payroll_period_id,
        lastSickRolloverYear: acct.last_sick_rollover_year,
        trainingForfeitedAt: acct.training_forfeited_at,
        updatedByUserId: req.user.id
      });
    }

    // Keep run view consistent if already ran.
    if (st === 'ran') {
      await recomputeSummariesFromStaging({
        payrollPeriodId,
        agencyId: period.agency_id,
        periodStart: period.period_start,
        periodEnd: period.period_end
      });
      const updated = await PayrollPeriod.findById(payrollPeriodId);
      const summaries = await PayrollSummary.listForPeriod(payrollPeriodId);
      return res.status(201).json({ ok: true, id, period: updated, summaries });
    }

    // Otherwise mark staged + clear run results.
    await pool.execute('DELETE FROM payroll_summaries WHERE payroll_period_id = ?', [payrollPeriodId]);
    await pool.execute(
      `UPDATE payroll_periods
       SET status = 'staged',
           ran_at = NULL,
           ran_by_user_id = NULL
       WHERE id = ?`,
      [payrollPeriodId]
    );

    res.status(201).json({ ok: true, id });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(409).json({
        error: { message: 'Manual pay lines table is not available yet (run database migrations first).' }
      });
    }
    next(e);
  }
};

export const deletePayrollManualPayLine = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id, 10);
    const lineId = parseInt(req.params.lineId, 10);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    const st = String(period.status || '').toLowerCase();
    if (st === 'finalized' || st === 'posted') {
      return res.status(409).json({ error: { message: 'Pay period is posted/finalized' } });
    }

    // If this is a PTO adjustment line, roll back the PTO ledger/balance before deleting.
    try {
      const [rows] = await pool.execute(
        `SELECT id, user_id, line_type, pto_bucket
         FROM payroll_manual_pay_lines
         WHERE id = ? AND payroll_period_id = ? AND agency_id = ?
         LIMIT 1`,
        [lineId, payrollPeriodId, period.agency_id]
      );
      const line = rows?.[0] || null;
      if (line && String(line.line_type || '').toLowerCase() === 'pto') {
        const ptoBucket = String(line.pto_bucket || 'sick').toLowerCase() === 'training' ? 'training' : 'sick';
        const delta = await PayrollPtoLedger.sumHoursForManualPayLine({ agencyId: period.agency_id, manualPayLineId: lineId });
        if (Math.abs(delta) > 1e-9) {
          const acct = await PayrollPtoAccount.findForAgencyUser({ agencyId: period.agency_id, userId: Number(line.user_id) });
          if (acct) {
            const sickBal = Number(acct?.sick_balance_hours || 0);
            const trainingBal = Number(acct?.training_balance_hours || 0);
            const nextSickBal = ptoBucket === 'training' ? sickBal : (sickBal - delta);
            const nextTrainingBal = ptoBucket === 'training' ? (trainingBal - delta) : trainingBal;
            await PayrollPtoAccount.upsert({
              agencyId: period.agency_id,
              userId: Number(line.user_id),
              employmentType: acct.employment_type,
              trainingPtoEligible: acct.training_pto_eligible ? 1 : 0,
              sickStartHours: acct.sick_start_hours,
              sickStartEffectiveDate: acct.sick_start_effective_date,
              trainingStartHours: acct.training_start_hours,
              trainingStartEffectiveDate: acct.training_start_effective_date,
              sickBalanceHours: nextSickBal,
              trainingBalanceHours: nextTrainingBal,
              lastAccruedPayrollPeriodId: acct.last_accrued_payroll_period_id,
              lastSickRolloverYear: acct.last_sick_rollover_year,
              trainingForfeitedAt: acct.training_forfeited_at,
              updatedByUserId: req.user.id
            });
          }
        }
        await PayrollPtoLedger.deleteForManualPayLine({ agencyId: period.agency_id, manualPayLineId: lineId });
      }
    } catch { /* best-effort */ }

    await pool.execute(
      `DELETE FROM payroll_manual_pay_lines
       WHERE id = ? AND payroll_period_id = ? AND agency_id = ?
       LIMIT 1`,
      [lineId, payrollPeriodId, period.agency_id]
    );

    if (st === 'ran') {
      await recomputeSummariesFromStaging({
        payrollPeriodId,
        agencyId: period.agency_id,
        periodStart: period.period_start,
        periodEnd: period.period_end
      });
      const updated = await PayrollPeriod.findById(payrollPeriodId);
      const summaries = await PayrollSummary.listForPeriod(payrollPeriodId);
      return res.json({ ok: true, period: updated, summaries });
    }

    await pool.execute('DELETE FROM payroll_summaries WHERE payroll_period_id = ?', [payrollPeriodId]);
    await pool.execute(
      `UPDATE payroll_periods
       SET status = 'staged',
           ran_at = NULL,
           ran_by_user_id = NULL
       WHERE id = ?`,
      [payrollPeriodId]
    );

    res.json({ ok: true });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(409).json({
        error: { message: 'Manual pay lines table is not available yet (run database migrations first).' }
      });
    }
    next(e);
  }
};

function computeNoNoteDraftUnpaidDeltas({ prevAgg, currAgg }) {
  // Key by user_id + service_code (matched rows only).
  const byKeyPrev = new Map();
  for (const r of prevAgg || []) {
    if (!r.user_id) continue;
    const k = `${r.user_id}:${r.service_code}`;
    byKeyPrev.set(k, {
      userId: r.user_id,
      serviceCode: r.service_code,
      providerName: r.provider_name,
      noNoteUnits: Number(r.raw_no_note_units || 0),
      draftUnits: Number(r.raw_draft_not_payable_units || 0)
    });
  }
  const byKeyCurr = new Map();
  for (const r of currAgg || []) {
    if (!r.user_id) continue;
    const k = `${r.user_id}:${r.service_code}`;
    byKeyCurr.set(k, {
      userId: r.user_id,
      serviceCode: r.service_code,
      providerName: r.provider_name,
      noNoteUnits: Number(r.raw_no_note_units || 0),
      draftUnits: Number(r.raw_draft_not_payable_units || 0)
    });
  }

  const deltas = [];
  for (const [k, p] of byKeyPrev.entries()) {
    const c = byKeyCurr.get(k) || { noNoteUnits: 0, draftUnits: 0 };
    const prevUnpaid = Number(p.noNoteUnits || 0) + Number(p.draftUnits || 0);
    const currUnpaid = Number(c.noNoteUnits || 0) + Number(c.draftUnits || 0);
    if (currUnpaid + 1e-9 < prevUnpaid) {
      deltas.push({
        userId: p.userId,
        serviceCode: p.serviceCode,
        providerName: p.providerName,
        prevUnpaidUnits: prevUnpaid,
        currUnpaidUnits: currUnpaid,
        carryoverFinalizedUnits: Number((prevUnpaid - currUnpaid).toFixed(2))
      });
    }
  }
  return deltas;
}

async function latestImportIdForPeriod(payrollPeriodId) {
  const [rows] = await pool.execute(
    `SELECT id
     FROM payroll_imports
     WHERE payroll_period_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [payrollPeriodId]
  );
  return rows?.[0]?.id || null;
}

async function buildEffectiveSnapshotRowsNoCarryover(payrollPeriodId, agencyId) {
  const aggregates = await PayrollImportRow.listAggregatedForPeriod(payrollPeriodId);
  const overrides = await PayrollStagingOverride.listForPeriod(payrollPeriodId);
  const overrideKey = new Map();
  for (const o of overrides || []) {
    overrideKey.set(`${o.user_id}:${o.service_code}`, o);
  }

  const rows = [];
  for (const a of aggregates || []) {
    if (!a.user_id) continue;
    const raw = {
      noNoteUnits: Number(a.raw_no_note_units || 0),
      draftUnits: Number(a.raw_draft_not_payable_units || 0),
      finalizedUnits: Number(a.raw_finalized_units || 0) + Number(a.raw_draft_payable_units || 0)
    };
    const o = overrideKey.get(`${a.user_id}:${a.service_code}`) || null;
    const eff = o
      ? {
          noNoteUnits: Number(o.no_note_units || 0),
          draftUnits: Number(o.draft_units || 0),
          finalizedUnits: Number(o.finalized_units || 0)
        }
      : raw;
    rows.push({
      userId: a.user_id,
      agencyId,
      serviceCode: a.service_code,
      noNoteUnits: Number(eff.noNoteUnits || 0),
      draftUnits: Number(eff.draftUnits || 0),
      finalizedUnits: Number(eff.finalizedUnits || 0)
    });
  }
  return rows;
}

async function snapshotPayrollRun({ payrollPeriodId, agencyId, ranByUserId }) {
  const payrollImportId = await latestImportIdForPeriod(payrollPeriodId);
  const run = await PayrollPeriodRun.create({ payrollPeriodId, agencyId, payrollImportId, ranByUserId });
  const rows = await buildEffectiveSnapshotRowsNoCarryover(payrollPeriodId, agencyId);
  await PayrollPeriodRunRow.bulkInsert({ payrollPeriodRunId: run.id, payrollPeriodId, agencyId, rows });
  return run;
}

function computeRunToRunUnpaidDeltas({ baselineRows, compareRows }) {
  const byKeyBase = new Map();
  for (const r of baselineRows || []) {
    const k = `${r.user_id}:${r.service_code}`;
    byKeyBase.set(k, {
      userId: r.user_id,
      serviceCode: r.service_code,
      noNoteUnits: Number(r.no_note_units || 0),
      draftUnits: Number(r.draft_units || 0),
      finalizedUnits: Number(r.finalized_units || 0)
    });
  }
  const byKeyCur = new Map();
  for (const r of compareRows || []) {
    const k = `${r.user_id}:${r.service_code}`;
    byKeyCur.set(k, {
      userId: r.user_id,
      serviceCode: r.service_code,
      noNoteUnits: Number(r.no_note_units || 0),
      draftUnits: Number(r.draft_units || 0),
      finalizedUnits: Number(r.finalized_units || 0)
    });
  }

  const deltas = [];
  for (const [k, b] of byKeyBase.entries()) {
    const c = byKeyCur.get(k) || { noNoteUnits: 0, draftUnits: 0, finalizedUnits: 0 };
    const baseUnpaid = Number(b.noNoteUnits || 0) + Number(b.draftUnits || 0);
    const curUnpaid = Number(c.noNoteUnits || 0) + Number(c.draftUnits || 0);
    const baseFinalized = Number(b.finalizedUnits || 0);
    const curFinalized = Number(c.finalizedUnits || 0);
    const finalizedDelta = Number((curFinalized - baseFinalized).toFixed(2));

    // We only carry "late note completions": NO_NOTE/DRAFT unpaid converted to FINALIZED.
    // If finalized does NOT increase, there is nothing to carry forward.
    if (finalizedDelta <= 1e-9) continue;

    const unpaidDrop = Number((baseUnpaid - curUnpaid).toFixed(2));
    const hasUnpaidDrop = unpaidDrop > 1e-9;

    if (!hasUnpaidDrop) continue;
    const carry = Math.max(0, Math.min(unpaidDrop, finalizedDelta));
    if (carry <= 1e-9) continue;
    deltas.push({
      userId: b.userId,
      serviceCode: b.serviceCode,
      prevUnpaidUnits: baseUnpaid,
      currUnpaidUnits: curUnpaid,
      prevFinalizedUnits: baseFinalized,
      currFinalizedUnits: curFinalized,
      finalizedDelta,
      carryoverFinalizedUnits: carry,
      type: 'late_note_completion',
      flagged: 0
    });
  }
  return deltas;
}

function computeStillUnpaidFromRunRows({ runRows }) {
  const rows = [];
  for (const r of runRows || []) {
    const userId = r.user_id;
    const serviceCode = r.service_code;
    if (!userId || !serviceCode) continue;
    const unpaid = Number(r.no_note_units || 0) + Number(r.draft_units || 0);
    if (unpaid > 1e-9) {
      rows.push({ userId, serviceCode, stillUnpaidUnits: Number(unpaid.toFixed(2)) });
    }
  }
  return rows;
}

export const listPayrollPeriodRuns = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;
    res.json(await PayrollPeriodRun.listForPeriod(payrollPeriodId));
  } catch (e) {
    next(e);
  }
};

// Snapshot-only run: creates a PayrollPeriodRun + run rows without mutating payroll_summaries
// or payroll_periods status. Used for historical "then → now" comparisons.
export const snapshotPayrollPeriodRun = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    const run = await snapshotPayrollRun({
      payrollPeriodId,
      agencyId: period.agency_id,
      ranByUserId: req.user.id
    });
    res.json({ ok: true, run });
  } catch (e) {
    next(e);
  }
};

export const snapshotPayrollPeriodRunFromFile = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const payrollPeriodId = parseInt(req.params.id);
      const period = await PayrollPeriod.findById(payrollPeriodId);
      if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
      if (!(await requirePayrollAccess(req, res, period.agency_id))) return;
      if (!req.file) return res.status(400).json({ error: { message: 'No report file uploaded' } });

      let parsed = [];
      try {
        parsed = parsePayrollFile(req.file.buffer, req.file.originalname)?.rows || [];
      } catch (e) {
        return res.status(400).json({
          error: {
            message: e.message || 'Failed to parse report',
            errorMeta: {
              rowNumber: e?.rowNumber || null,
              detectedHeaders: Array.isArray(e?.detectedHeaders) ? e.detectedHeaders : null,
              exampleExpected: Array.isArray(e?.exampleExpected) ? e.exampleExpected : null
            }
          }
        });
      }
      if (!parsed || parsed.length === 0) return res.status(400).json({ error: { message: 'No rows found in report' } });

      // Map provider names -> user ids for users in this agency (do not auto-create users here).
      const [agencyUsers] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name
         FROM users u
         JOIN user_agencies ua ON u.id = ua.user_id
         WHERE ua.agency_id = ?`,
        [period.agency_id]
      );
      const nameToIds = new Map();
      for (const u of agencyUsers || []) {
        const first = String(u.first_name || '').trim();
        const last = String(u.last_name || '').trim();
        const a = normalizeName(`${first} ${last}`);
        const b = normalizeName(`${last} ${first}`);
        if (a) addNameKeyToIds(nameToIds, a, u.id);
        if (b) addNameKeyToIds(nameToIds, b, u.id);
      }

      // Aggregate by (userId, serviceCode)
      const byKey = new Map();
      const unmatched = new Set();
      for (const r of parsed || []) {
        const userId = resolveUserIdForProviderName(nameToIds, r.providerName);
        if (!userId) {
          const nm = String(r.providerName || '').trim();
          if (nm) unmatched.add(nm);
          continue;
        }
        const serviceCode = String(r.serviceCode || '').trim();
        if (!serviceCode) continue;
        const note = String(r.noteStatus || '').trim().toUpperCase();
        const units = Number(r.unitCount || 0);
        if (!Number.isFinite(units) || units <= 0) continue;

        const k = `${userId}:${serviceCode.toUpperCase()}`;
        if (!byKey.has(k)) {
          byKey.set(k, { userId, serviceCode, noNoteUnits: 0, draftUnits: 0, finalizedUnits: 0 });
        }
        const agg = byKey.get(k);
        if (note === 'NO_NOTE') agg.noNoteUnits += units;
        else if (note === 'DRAFT') agg.draftUnits += units; // treat all drafts as payable for comparison purposes
        else if (note === 'FINALIZED') agg.finalizedUnits += units;
      }

      const rows = Array.from(byKey.values()).map((x) => ({
        userId: x.userId,
        serviceCode: x.serviceCode,
        noNoteUnits: Number((x.noNoteUnits || 0).toFixed(2)),
        draftUnits: Number((x.draftUnits || 0).toFixed(2)),
        finalizedUnits: Number((x.finalizedUnits || 0).toFixed(2))
      }));

      const run = await PayrollPeriodRun.create({
        payrollPeriodId,
        agencyId: period.agency_id,
        payrollImportId: null,
        ranByUserId: req.user.id
      });
      await PayrollPeriodRunRow.bulkInsert({ payrollPeriodRunId: run.id, payrollPeriodId, agencyId: period.agency_id, rows });

      res.json({
        ok: true,
        run,
        inserted: rows.length,
        unmatchedProvidersSample: Array.from(unmatched).slice(0, 50)
      });
    } catch (e) {
      next(e);
    }
  }
];

// Carryover workflow (late notes): compare two runs of the prior pay period.
export const previewPayrollCarryover = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const priorPeriodId = req.query.priorPeriodId ? parseInt(req.query.priorPeriodId) : null;
    const baselineRunId = req.query.baselineRunId ? parseInt(req.query.baselineRunId) : null;
    const compareRunId = req.query.compareRunId ? parseInt(req.query.compareRunId) : null;
    if (!priorPeriodId) return res.status(400).json({ error: { message: 'priorPeriodId is required' } });

    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    const prior = await PayrollPeriod.findById(priorPeriodId);
    if (!prior || prior.agency_id !== period.agency_id) {
      return res.status(404).json({ error: { message: 'Prior pay period not found for this agency' } });
    }

    const runs = await PayrollPeriodRun.listForPeriod(priorPeriodId);
    if (!runs.length) {
      return res.json({ title: 'No-note/Draft Unpaid', period, prior, baselineRun: null, compareRun: null, deltas: [] });
    }
    const baselineId = baselineRunId || runs[0].id;
    const compareId = compareRunId || runs[runs.length - 1].id;

    const baselineRun = (runs || []).find((r) => Number(r.id) === Number(baselineId)) || null;
    const compareRun = (runs || []).find((r) => Number(r.id) === Number(compareId)) || null;

    // Prefer import-row comparison (fingerprint-based), which is more accurate than code-level aggregates.
    // Falls back to run-row comparison if payroll_import_id isn't available.
    let deltas = [];
    let stillUnpaid = [];
    if (baselineRun?.payroll_import_id && compareRun?.payroll_import_id) {
      const baseImportId = Number(baselineRun.payroll_import_id);
      const curImportId = Number(compareRun.payroll_import_id);

      const loadImportRows = async (payrollImportId) => {
        const [rows] = await pool.execute(
          `SELECT
             pir.user_id,
             pir.provider_name,
             pir.patient_first_name,
             pir.service_code,
             pir.service_date,
             pir.note_status,
             pir.draft_payable,
             pir.unit_count,
             pir.row_fingerprint
           FROM payroll_import_rows pir
           WHERE pir.payroll_period_id = ?
             AND pir.payroll_import_id = ?`,
          [priorPeriodId, payrollImportId]
        );
        return rows || [];
      };

      const classify = (r) => {
        const st = String(r?.note_status || '').trim().toUpperCase();
        if (st === 'NO_NOTE') return 'unpaid';
        if (st === 'DRAFT') return Number(r?.draft_payable || 0) ? 'finalized' : 'unpaid';
        return 'finalized';
      };

      const baseImportRows = await loadImportRows(baseImportId);
      const curImportRows = await loadImportRows(curImportId);

      const totalsByUserCodeBase = new Map(); // k = `${userId}:${CODE}` -> { userId, serviceCode, providerName, unpaid, finalized }
      const totalsByUserCodeCur = new Map();
      const totalsByProviderCodeBase = new Map(); // k = `${providerKey}:${CODE}` -> { providerKey, providerName, serviceCode, unpaid, finalized }
      const totalsByProviderCodeCur = new Map();
      const byRowKeyBase = new Map(); // rowKey -> { userId, providerKey, providerName, serviceCode, unpaid, finalized }
      const byRowKeyCur = new Map();

      const normProviderKey = (v) => String(v || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const normCode = (v) => String(v || '').trim().toUpperCase();

      const addImportRow = ({ totalsUser, totalsProvider, byRowKey, r }) => {
        const userId = Number(r?.user_id || 0);
        const serviceCodeRaw = String(r?.service_code || '').trim();
        if (!serviceCodeRaw) return;
        const code = normCode(serviceCodeRaw);
        const units = Number(r?.unit_count || 0);
        if (!Number.isFinite(units) || units <= 0) return;

        const providerName = String(r?.provider_name || '').trim() || null;
        const providerKey = providerName ? normProviderKey(providerName) : null;
        const rowKey = r?.row_fingerprint || computeRowFingerprint({
          agencyId: prior.agency_id,
          clinicianName: providerName || '',
          patientFirstName: r?.patient_first_name || '',
          serviceCode: code,
          serviceDate: r?.service_date
        });
        const bucket = classify(r);

        // Aggregate for UI by user+code when we can, otherwise by clinician+code.
        if (userId > 0) {
          const k = `${userId}:${code}`;
          if (!totalsUser.has(k)) totalsUser.set(k, { userId, serviceCode: code, providerName, unpaid: 0, finalized: 0 });
          const t = totalsUser.get(k);
          if (bucket === 'unpaid') t.unpaid += units;
          else t.finalized += units;
        } else if (providerKey) {
          const k2 = `${providerKey}:${code}`;
          if (!totalsProvider.has(k2)) totalsProvider.set(k2, { providerKey, providerName, serviceCode: code, unpaid: 0, finalized: 0 });
          const t2 = totalsProvider.get(k2);
          if (bucket === 'unpaid') t2.unpaid += units;
          else t2.finalized += units;
        }

        if (!byRowKey.has(rowKey)) byRowKey.set(rowKey, { userId, providerKey, providerName, serviceCode: code, unpaid: 0, finalized: 0 });
        const f = byRowKey.get(rowKey);
        if (bucket === 'unpaid') f.unpaid += units;
        else f.finalized += units;
      };

      for (const r of baseImportRows) addImportRow({ totalsUser: totalsByUserCodeBase, totalsProvider: totalsByProviderCodeBase, byRowKey: byRowKeyBase, r });
      for (const r of curImportRows) addImportRow({ totalsUser: totalsByUserCodeCur, totalsProvider: totalsByProviderCodeCur, byRowKey: byRowKeyCur, r });

      // Compute carryover by fingerprint transitions (exclude fingerprints not present in baseline to avoid "new sessions").
      const carryByUserCode = new Map(); // k = `${userId}:${CODE}` -> carry units
      const carryByProviderCode = new Map(); // k = `${providerKey}:${CODE}` -> carry units
      for (const [rowKey, b] of byRowKeyBase.entries()) {
        const c = byRowKeyCur.get(rowKey) || { unpaid: 0, finalized: 0 };
        const unpaidDrop = Number((Number(b.unpaid || 0) - Number(c.unpaid || 0)).toFixed(2));
        const finalizedDelta = Number((Number(c.finalized || 0) - Number(b.finalized || 0)).toFixed(2));
        if (unpaidDrop <= 1e-9) continue;
        if (finalizedDelta <= 1e-9) continue;
        const carry = Math.max(0, Math.min(unpaidDrop, finalizedDelta));
        if (carry <= 1e-9) continue;
        const code = String(b.serviceCode || '').trim().toUpperCase();
        if (b.userId > 0) {
          const k = `${b.userId}:${code}`;
          carryByUserCode.set(k, Number(((carryByUserCode.get(k) || 0) + carry).toFixed(2)));
        } else if (b.providerKey) {
          const k2 = `${b.providerKey}:${code}`;
          carryByProviderCode.set(k2, Number(((carryByProviderCode.get(k2) || 0) + carry).toFixed(2)));
        }
      }

      // Build deltas list for UI:
      // - user-matched rows first
      // - provider-only rows (userId=0) still shown for tracking visibility
      const outDeltas = [];
      for (const [k, carry] of carryByUserCode.entries()) {
        const [uidStr, code] = k.split(':');
        const uid = Number(uidStr);
        const base = totalsByUserCodeBase.get(k) || { unpaid: 0, finalized: 0, providerName: null };
        const cur = totalsByUserCodeCur.get(k) || { unpaid: 0, finalized: 0, providerName: null };
        outDeltas.push({
          userId: uid,
          serviceCode: code,
          providerName: base.providerName || cur.providerName || null,
          prevUnpaidUnits: Number((Number(base.unpaid || 0)).toFixed(2)),
          currUnpaidUnits: Number((Number(cur.unpaid || 0)).toFixed(2)),
          prevFinalizedUnits: Number((Number(base.finalized || 0)).toFixed(2)),
          currFinalizedUnits: Number((Number(cur.finalized || 0)).toFixed(2)),
          finalizedDelta: Number((Number(cur.finalized || 0) - Number(base.finalized || 0)).toFixed(2)),
          carryoverFinalizedUnits: Number(carry || 0),
          type: 'late_note_completion',
          flagged: 0
        });
      }
      for (const [k, carry] of carryByProviderCode.entries()) {
        const [providerKey, code] = k.split(':');
        const base = totalsByProviderCodeBase.get(k) || { unpaid: 0, finalized: 0, providerName: null };
        const cur = totalsByProviderCodeCur.get(k) || { unpaid: 0, finalized: 0, providerName: null };
        outDeltas.push({
          userId: 0,
          serviceCode: code,
          providerName: base.providerName || cur.providerName || providerKey || null,
          prevUnpaidUnits: Number((Number(base.unpaid || 0)).toFixed(2)),
          currUnpaidUnits: Number((Number(cur.unpaid || 0)).toFixed(2)),
          prevFinalizedUnits: Number((Number(base.finalized || 0)).toFixed(2)),
          currFinalizedUnits: Number((Number(cur.finalized || 0)).toFixed(2)),
          finalizedDelta: Number((Number(cur.finalized || 0) - Number(base.finalized || 0)).toFixed(2)),
          carryoverFinalizedUnits: Number(carry || 0),
          type: 'late_note_completion',
          flagged: 0
        });
      }
      deltas = outDeltas;

      // stillUnpaid = unpaid totals in the compare import (one row per user+code)
      stillUnpaid = [
        ...Array.from(totalsByUserCodeCur.values()).map((t) => ({
          userId: t.userId,
          serviceCode: t.serviceCode,
          providerName: t.providerName,
          stillUnpaidUnits: Number(Number(t.unpaid || 0).toFixed(2))
        })),
        ...Array.from(totalsByProviderCodeCur.values()).map((t) => ({
          userId: 0,
          serviceCode: t.serviceCode,
          providerName: t.providerName,
          stillUnpaidUnits: Number(Number(t.unpaid || 0).toFixed(2))
        }))
      ].filter((t) => Number(t.stillUnpaidUnits || 0) > 1e-9);
    } else {
      const baseRows = await PayrollPeriodRunRow.listForRun(baselineId);
      const curRows = await PayrollPeriodRunRow.listForRun(compareId);
      deltas = computeRunToRunUnpaidDeltas({ baselineRows: baseRows, compareRows: curRows });
      stillUnpaid = computeStillUnpaidFromRunRows({ runRows: curRows });
    }

    // Enrich with user names.
    const userIds = Array.from(new Set([
      ...(deltas || []).map((d) => d.userId),
      ...(stillUnpaid || []).map((d) => d.userId)
    ])).map((x) => parseInt(x));
    let userMap = new Map();
    if (userIds.length) {
      const placeholders = userIds.map(() => '?').join(',');
      const [urows] = await pool.execute(
        `SELECT id, first_name, last_name FROM users WHERE id IN (${placeholders})`,
        userIds
      );
      userMap = new Map((urows || []).map((u) => [u.id, u]));
    }

    const out = deltas.map((d) => {
      const u = userMap.get(d.userId) || null;
      return { ...d, firstName: u?.first_name || null, lastName: u?.last_name || null };
    });
    const outStillUnpaid = (stillUnpaid || []).map((d) => {
      const u = userMap.get(d.userId) || null;
      return { ...d, firstName: u?.first_name || null, lastName: u?.last_name || null };
    });

    // Persist the "prior still unpaid" snapshot for this CURRENT payroll period (red column in staging),
    // so it can be edited and reflected in pay output/pay stubs.
    try {
      await PayrollStagePriorUnpaid.replaceForPeriod({
        payrollPeriodId,
        agencyId: period.agency_id,
        sourcePayrollPeriodId: priorPeriodId || null,
        computedByUserId: req.user.id,
        rows: (stillUnpaid || [])
          .filter((r) => Number(r?.userId || 0) > 0 && String(r?.serviceCode || '').trim())
          .map((r) => ({
            userId: Number(r.userId),
            serviceCode: String(r.serviceCode).trim(),
            stillUnpaidUnits: Number(r.stillUnpaidUnits || 0)
          }))
          .filter((r) => Number(r.stillUnpaidUnits || 0) > 0)
      });
    } catch (e) {
      // If the table doesn't exist yet, surface a clear error.
      if (e?.message && String(e.message).includes('payroll_stage_prior_unpaid')) throw e;
      // Otherwise, don't block preview.
    }

    res.json({
      title: 'No-note/Draft Unpaid',
      period,
      prior,
      baselineRunId: baselineId,
      compareRunId: compareId,
      deltas: out,
      stillUnpaid: outStillUnpaid
    });
  } catch (e) {
    next(e);
  }
};

export const applyPayrollCarryover = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const priorPeriodId = req.query.priorPeriodId ? parseInt(req.query.priorPeriodId) : null;
    const baselineRunId = req.query.baselineRunId ? parseInt(req.query.baselineRunId) : null;
    const compareRunId = req.query.compareRunId ? parseInt(req.query.compareRunId) : null;
    const skipProcessingGate =
      String(req.query?.skipProcessingGate || '').toLowerCase() === 'true' ||
      String(req.query?.skipProcessingGate || '') === '1';
    const requestRows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    const hasRequestRows = !!(requestRows && requestRows.length);
    if (!priorPeriodId && !hasRequestRows) {
      return res.status(400).json({ error: { message: 'priorPeriodId is required (unless providing rows)' } });
    }

    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    if (isEffectivelyPostedOrFinalized(period)) {
      return res.status(409).json({ error: { message: 'Pay period is posted/finalized' } });
    }

    const warnings = [];

    // Gate: do not allow carryover apply if this period still has unprocessed H0031/H0032 rows
    // (unpaid NO_NOTE/DRAFT rows also must be corrected before they can be carried/paid).
    const pendingProcessingCount = await PayrollImportRow.countUnprocessedForPeriod({ payrollPeriodId });
    if (!skipProcessingGate && pendingProcessingCount > 0) {
      const sample = await PayrollImportRow.listUnprocessedForPeriod({ payrollPeriodId, limit: 50 });
      return res.status(409).json({
        error: {
          message: `Cannot apply carryover: ${pendingProcessingCount} H0031/H0032 row(s) require processing (minutes + Done) in the current pay period.`
        },
        pendingProcessing: { count: pendingProcessingCount, sample }
      });
    }
    if (skipProcessingGate && pendingProcessingCount > 0) {
      warnings.push({
        code: 'H0031/H0032',
        message: `Carryover applied with skipProcessingGate=true while ${pendingProcessingCount} H0031/H0032 row(s) in the current pay period still require processing (minutes + Done).`
      });
    }

    let sourcePayrollPeriodId = null;
    if (priorPeriodId) {
      const prior = await PayrollPeriod.findById(priorPeriodId);
      if (!prior || prior.agency_id !== period.agency_id) {
        return res.status(404).json({ error: { message: 'Prior pay period not found for this agency' } });
      }
      sourcePayrollPeriodId = priorPeriodId;
    }

    let rows = [];
    if (hasRequestRows) {
      // Manual/editable apply (rare): use client-provided rows directly.
      const userIds = new Set();
      const h0032ManualCarryoverUserIds = new Set();
      for (let i = 0; i < requestRows.length; i++) {
        const r = requestRows[i] || {};
        const userId = r.userId ? parseInt(r.userId) : null;
        const serviceCode = String(r.serviceCode || '').trim();
        const codeKey = serviceCode.toUpperCase();
        const carry = Number(r.carryoverFinalizedUnits);
        if (!userId || !serviceCode) {
          return res.status(400).json({ error: { message: `rows[${i}] must include userId and serviceCode` } });
        }
        // H0031 carryover normally requires the source period processing workflow (minutes + Done).
        // For catch-up/backfill workflows, allow an explicit override so admin can set final units in the destination staging.
        if (codeKey === 'H0031' && !skipProcessingGate) {
          return res.status(409).json({
            error: { message: `Cannot apply manual carryover for ${codeKey}: these rows must be processed (minutes + Done) in their source pay period before carryover can be applied.` }
          });
        }
        if (codeKey === 'H0031' && skipProcessingGate) {
          warnings.push({
            code: 'H0031',
            message: 'Applied H0031 carryover with skipProcessingGate=true. Verify/correct final units in the destination payroll stage before running payroll.'
          });
        }
        if (codeKey === 'H0032') h0032ManualCarryoverUserIds.add(userId);
        if (!Number.isFinite(carry) || carry < -1e-9) {
          return res.status(400).json({ error: { message: `rows[${i}].carryoverFinalizedUnits must be a non-negative number` } });
        }
        if (serviceCode.length > 64) {
          return res.status(400).json({ error: { message: `rows[${i}].serviceCode is too long` } });
        }
        userIds.add(userId);
        // allow 0 to clear (by omitting from replaceForPeriod)
        if (carry > 1e-9) {
          rows.push({
            userId,
            serviceCode,
            carryoverFinalizedUnits: Number(carry.toFixed(2))
          });
        }
      }

      // Verify all users belong to the agency for this payroll period.
      const ids = Array.from(userIds);
      if (!ids.length) return res.json({ ok: true, inserted: 0 });
      const placeholders = ids.map(() => '?').join(',');
      const [ua] = await pool.execute(
        `SELECT DISTINCT user_id FROM user_agencies WHERE agency_id = ? AND user_id IN (${placeholders})`,
        [period.agency_id, ...ids]
      );
      const okIds = new Set((ua || []).map((x) => x.user_id));
      const missing = ids.filter((id) => !okIds.has(id));
      if (missing.length) {
        return res.status(400).json({ error: { message: 'One or more selected providers are not assigned to this organization' } });
      }

      // H0032 manual-minutes toggle gate (Category-2 only).
      if (h0032ManualCarryoverUserIds.size) {
        const hIds = Array.from(h0032ManualCarryoverUserIds);
        const ph = hIds.map(() => '?').join(',');
        try {
          const [hrows] = await pool.execute(
            `SELECT user_id
             FROM user_agencies
             WHERE agency_id = ?
               AND user_id IN (${ph})
               AND h0032_requires_manual_minutes = 1`,
            [period.agency_id, ...hIds]
          );
          if ((hrows || []).length) {
            if (!skipProcessingGate) {
              return res.status(409).json({
                error: { message: 'Cannot apply manual carryover for H0032 Category-2 providers: these rows must be processed (minutes + Done) in their source pay period before carryover can be applied.' },
                pendingProcessing: { code: 'H0032', userIds: (hrows || []).map((x) => x.user_id) }
              });
            }
            warnings.push({
              code: 'H0032',
              message: `Applied H0032 carryover with skipProcessingGate=true for ${ (hrows || []).length } Category-2 provider(s) that normally require manual minutes processing in the source period. Verify/correct final units in the destination payroll stage before running payroll.`,
              userIds: (hrows || []).map((x) => x.user_id)
            });
          }
        } catch {
          // column may not exist yet
        }
      }
    } else {
      const runs = await PayrollPeriodRun.listForPeriod(priorPeriodId);
      if (!runs.length) return res.json({ ok: true, inserted: 0 });
      const baselineId = baselineRunId || runs[0].id;
      const compareId = compareRunId || runs[runs.length - 1].id;
      const baseRows = await PayrollPeriodRunRow.listForRun(baselineId);
      const curRows = await PayrollPeriodRunRow.listForRun(compareId);
      const deltas = computeRunToRunUnpaidDeltas({ baselineRows: baseRows, compareRows: curRows });

      rows = deltas.map((d) => ({
        userId: d.userId,
        serviceCode: d.serviceCode,
        carryoverFinalizedUnits: d.carryoverFinalizedUnits
      }));
    }

    await PayrollStageCarryover.replaceForPeriod({
        payrollPeriodId,
      agencyId: period.agency_id,
      sourcePayrollPeriodId,
      computedByUserId: req.user.id,
      rows
    });

    // Mark staged + clear run results (carryover changes should require re-run).
    await pool.execute('DELETE FROM payroll_summaries WHERE payroll_period_id = ?', [payrollPeriodId]);
    await pool.execute(
      `UPDATE payroll_periods
       SET status = 'staged',
           ran_at = NULL,
           ran_by_user_id = NULL
       WHERE id = ?`,
      [payrollPeriodId]
    );

    res.json({ ok: true, inserted: rows.length, warnings });
  } catch (e) {
    next(e);
  }
};

export const patchPayrollStaging = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;
    if (isEffectivelyPostedOrFinalized(period)) {
      return res.status(409).json({ error: { message: 'Pay period is posted/finalized' } });
    }

    const { userId, serviceCode, noNoteUnits, draftUnits, finalizedUnits } = req.body || {};
    if (!userId || !serviceCode) {
      return res.status(400).json({ error: { message: 'userId and serviceCode are required' } });
    }

    const nn = Number(noNoteUnits);
    const dr = Number(draftUnits);
    const fi = Number(finalizedUnits);
    if (![nn, dr, fi].every((n) => Number.isFinite(n) && n >= 0)) {
      return res.status(400).json({ error: { message: 'noNoteUnits, draftUnits, and finalizedUnits must be non-negative numbers' } });
    }

    await PayrollStagingOverride.upsert({
      payrollPeriodId,
      agencyId: period.agency_id,
      userId: parseInt(userId),
      serviceCode: String(serviceCode).trim(),
      noNoteUnits: nn,
      draftUnits: dr,
      finalizedUnits: fi,
      updatedByUserId: req.user.id
    });

    // Staging edits should NOT publish totals. Mark as staged and clear any prior run results.
    await pool.execute('DELETE FROM payroll_summaries WHERE payroll_period_id = ?', [payrollPeriodId]);
    await pool.execute(
      `UPDATE payroll_periods
       SET status = 'staged',
           ran_at = NULL,
           ran_by_user_id = NULL
       WHERE id = ?`,
      [payrollPeriodId]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const putPayrollStagePriorUnpaid = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;
    if (isEffectivelyPostedOrFinalized(period)) {
      return res.status(409).json({ error: { message: 'Pay period is posted/finalized' } });
    }

    const sourcePayrollPeriodId = req.body?.sourcePayrollPeriodId ? parseInt(req.body.sourcePayrollPeriodId) : null;
    const requestRows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    if (!requestRows) {
      return res.status(400).json({ error: { message: 'rows is required' } });
    }

    const rows = [];
    const seen = new Set();
    for (let i = 0; i < requestRows.length; i++) {
      const r = requestRows[i] || {};
      const userId = r.userId ? parseInt(r.userId) : null;
      const serviceCode = String(r.serviceCode || '').trim();
      const units = Number(r.stillUnpaidUnits);
      if (!userId || !serviceCode) {
        return res.status(400).json({ error: { message: `rows[${i}] must include userId and serviceCode` } });
      }
      if (!Number.isFinite(units) || units < -1e-9) {
        return res.status(400).json({ error: { message: `rows[${i}].stillUnpaidUnits must be a non-negative number` } });
      }
      if (serviceCode.length > 64) {
        return res.status(400).json({ error: { message: `rows[${i}].serviceCode is too long` } });
      }
      const k = `${userId}:${serviceCode.toUpperCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (units > 1e-9) {
        rows.push({ userId, serviceCode, stillUnpaidUnits: Number(units.toFixed(2)) });
      }
    }

    // Verify all users belong to the agency.
    const ids = Array.from(new Set(rows.map((r) => r.userId)));
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const [ua] = await pool.execute(
        `SELECT DISTINCT user_id FROM user_agencies WHERE agency_id = ? AND user_id IN (${placeholders})`,
        [period.agency_id, ...ids]
      );
      const okIds = new Set((ua || []).map((x) => x.user_id));
      const missing = ids.filter((id) => !okIds.has(id));
      if (missing.length) {
        return res.status(400).json({ error: { message: 'One or more selected providers are not assigned to this organization' } });
      }
    }

    await PayrollStagePriorUnpaid.replaceForPeriod({
      payrollPeriodId,
      agencyId: period.agency_id,
      sourcePayrollPeriodId,
      computedByUserId: req.user.id,
      rows
    });

    // Mark staged + clear run results (editing prior-unpaid snapshot should require re-run).
    await pool.execute('DELETE FROM payroll_summaries WHERE payroll_period_id = ?', [payrollPeriodId]);
    await pool.execute(
      `UPDATE payroll_periods
       SET status = 'staged',
           ran_at = NULL,
           ran_by_user_id = NULL
       WHERE id = ?`,
      [payrollPeriodId]
    );

    res.json({ ok: true, inserted: rows.length });
  } catch (e) {
    next(e);
  }
};

export const submitPayrollPeriod = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    // Backward-compat: older UI called this "submit".
    // In the new workflow, "Run Payroll" computes results privately; "Post Payroll" makes it visible.
    const st = String(period.status || '').toLowerCase();
    if (st === 'posted' || st === 'finalized') {
      return res.status(409).json({ error: { message: 'Pay period is already posted/finalized' } });
    }

    await recomputeSummariesFromStaging({
      payrollPeriodId,
      agencyId: period.agency_id,
      periodStart: period.period_start,
      periodEnd: period.period_end
    });

    await pool.execute(
      `UPDATE payroll_periods
       SET status = 'ran',
           ran_at = CURRENT_TIMESTAMP,
           ran_by_user_id = ?
       WHERE id = ?`,
      [req.user.id, payrollPeriodId]
    );
    res.json(await PayrollPeriod.findById(payrollPeriodId));
  } catch (e) {
    next(e);
  }
};

export const runPayrollPeriod = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    // For historical re-imports (e.g., re-running an old period purely to compare no-note/draft unpaid),
    // allow admins to bypass the H0031/H0032 processing gate.
    const skipProcessingGate =
      String(req.query?.skipProcessingGate || '').toLowerCase() === 'true' ||
      String(req.query?.skipProcessingGate || '') === '1';

    const st = String(period.status || '').toLowerCase();
    if (st === 'posted' || st === 'finalized') {
      return res.status(409).json({ error: { message: 'Pay period is posted/finalized' } });
    }

    // Block running payroll if there are incomplete Payroll To-Dos for this pay period.
    try {
      await PayrollPeriodTodo.ensureMaterializedForPeriod({ payrollPeriodId, agencyId: period.agency_id });
      const pendingTodoCount = await PayrollPeriodTodo.countPendingForPeriod({ payrollPeriodId, agencyId: period.agency_id });
      if (pendingTodoCount > 0) {
        const sample = await PayrollPeriodTodo.listPendingSampleForPeriod({ payrollPeriodId, agencyId: period.agency_id, limit: 50 });
        return res.status(409).json({
          error: { message: `Cannot run payroll: ${pendingTodoCount} payroll To-Do item(s) must be marked Done.` },
          pendingTodos: { count: pendingTodoCount, sample }
        });
      }
    } catch (e) {
      // Best-effort: do not block payroll if To-Do tables aren't migrated yet.
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // Block running payroll if there are unresolved mileage submissions for this pay period.
    const pendingMileageCount = await PayrollMileageClaim.countUnresolvedForPeriod({
      payrollPeriodId,
      agencyId: period.agency_id
    });
    if (pendingMileageCount > 0) {
      const sample = await PayrollMileageClaim.listUnresolvedForPeriod({
        payrollPeriodId,
        agencyId: period.agency_id,
        limit: 20
      });
      return res.status(409).json({
        error: {
          message: `Cannot run payroll: ${pendingMileageCount} mileage submission(s) pending approval for this pay period.`
        },
        pendingMileage: {
          count: pendingMileageCount,
          claims: sample
        }
      });
    }

    // Block running payroll if there are unresolved MedCancel submissions for this pay period.
    const pendingMedcancelCount = await PayrollMedcancelClaim.countUnresolvedForPeriod({
      payrollPeriodId,
      agencyId: period.agency_id
    });
    if (pendingMedcancelCount > 0) {
      const sample = await PayrollMedcancelClaim.listUnresolvedForPeriod({
        payrollPeriodId,
        agencyId: period.agency_id,
        limit: 20
      });
      return res.status(409).json({
        error: {
          message: `Cannot run payroll: ${pendingMedcancelCount} MedCancel submission(s) pending approval for this pay period.`
        },
        pendingMedcancel: {
          count: pendingMedcancelCount,
          claims: sample
        }
      });
    }

    // Block running payroll if there are unresolved reimbursement submissions for this pay period.
    const pendingReimbursementCount = await PayrollReimbursementClaim.countUnresolvedForPeriod({
      payrollPeriodId,
      agencyId: period.agency_id
    });
    if (pendingReimbursementCount > 0) {
      const sample = await PayrollReimbursementClaim.listUnresolvedForPeriod({
        payrollPeriodId,
        agencyId: period.agency_id,
        limit: 20
      });
      return res.status(409).json({
        error: {
          message: `Cannot run payroll: ${pendingReimbursementCount} reimbursement submission(s) pending approval for this pay period.`
        },
        pendingReimbursement: {
          count: pendingReimbursementCount,
          claims: sample
        }
      });
    }

    // Block running payroll if there are unresolved time submissions for this pay period.
    const pendingTimeCount = await PayrollTimeClaim.countUnresolvedForPeriod({
      payrollPeriodId,
      agencyId: period.agency_id
    });
    if (pendingTimeCount > 0) {
      const sample = await PayrollTimeClaim.listUnresolvedForPeriod({
        payrollPeriodId,
        agencyId: period.agency_id,
        limit: 20
      });
      return res.status(409).json({
        error: {
          message: `Cannot run payroll: ${pendingTimeCount} time claim(s) pending approval for this pay period.`
        },
        pendingTime: {
          count: pendingTimeCount,
          claims: sample
        }
      });
    }

    // Block running payroll if H0031/H0032 rows requiring minutes are not processed.
    const pendingProcessingCount = await PayrollImportRow.countUnprocessedForPeriod({ payrollPeriodId });
    if (!skipProcessingGate && pendingProcessingCount > 0) {
      const sample = await PayrollImportRow.listUnprocessedForPeriod({ payrollPeriodId, limit: 50 });
      const byCode = {};
      for (const r of sample || []) {
        const k = String(r.service_code || '').trim().toUpperCase() || 'UNKNOWN';
        byCode[k] = (byCode[k] || 0) + 1;
      }
      return res.status(409).json({
        error: {
          message: `Cannot run payroll: ${pendingProcessingCount} H0031/H0032 row(s) require processing (minutes + Done).`
        },
        pendingProcessing: {
          count: pendingProcessingCount,
          sample,
          sampleCountsByCode: byCode
        }
      });
    }

    // Recompute into payroll_summaries (private until posted).
    await recomputeSummariesFromStaging({
      payrollPeriodId,
      agencyId: period.agency_id,
      periodStart: period.period_start,
      periodEnd: period.period_end
    });

    // Record a run snapshot for late-note carryover detection.
    // This snapshots (no_note/draft/finalized) for THIS pay period at run time (no carryover applied).
    try {
      await snapshotPayrollRun({ payrollPeriodId, agencyId: period.agency_id, ranByUserId: req.user.id });
    } catch (e) {
      // If the run history tables aren't migrated yet, don't block payroll runs.
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    // Best-effort: accrue supervision hours for prelicensed providers from payroll (99414/99416),
    // and trigger existing supervision threshold notifications. This does NOT affect pay eligibility
    // for the current period (pay-forward only, implemented in recomputeSummariesFromStaging()).
    try {
      await accruePrelicensedSupervisionFromPayroll({
        agencyId: period.agency_id,
        payrollPeriodId,
        uploadedByUserId: req.user.id
      });
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') {
        // ignore
      }
    }

    // Best-effort: track and notify supervisors about draft notes submitted but not signed by them yet.
    // Definition: note_status='DRAFT' and draft_payable=1 (supervisee signed; supervisor unsigned).
    try {
      const agencyId = period.agency_id;
      // Use the latest import for this pay period.
      const [impRows] = await pool.execute(
        `SELECT id
         FROM payroll_imports
         WHERE payroll_period_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [payrollPeriodId]
      );
      const latestImportId = impRows?.[0]?.id || null;
      if (latestImportId) {
        const [counts] = await pool.execute(
          `SELECT
             sa.supervisor_id AS supervisor_user_id,
             COUNT(1) AS unsigned_draft_count
           FROM payroll_import_rows pir
           JOIN supervisor_assignments sa
             ON sa.agency_id = pir.agency_id
            AND sa.supervisee_id = pir.user_id
           WHERE pir.agency_id = ?
             AND pir.payroll_period_id = ?
             AND pir.payroll_import_id = ?
             AND pir.note_status = 'DRAFT'
             AND pir.draft_payable = 1
           GROUP BY sa.supervisor_id`,
          [agencyId, payrollPeriodId, latestImportId]
        );

        const periodStart = String(period.period_start || '').slice(0, 10);
        const periodEnd = String(period.period_end || '').slice(0, 10);
        const label = period.label || (periodStart && periodEnd ? `${periodStart} → ${periodEnd}` : `Pay period #${payrollPeriodId}`);

        for (const r of counts || []) {
          const supervisorUserId = Number(r.supervisor_user_id || 0);
          const unsignedDraftCount = Number(r.unsigned_draft_count || 0);
          if (!supervisorUserId || unsignedDraftCount <= 0) continue;

          // Upsert metric row.
          await pool.execute(
            `INSERT INTO payroll_supervisor_unsigned_draft_metrics
             (agency_id, payroll_period_id, supervisor_user_id, unsigned_draft_count)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               unsigned_draft_count = VALUES(unsigned_draft_count),
               updated_at = CURRENT_TIMESTAMP`,
            [agencyId, payrollPeriodId, supervisorUserId, unsignedDraftCount]
          );

          // Idempotent notify: only if not already notified for this period.
          const [mRows] = await pool.execute(
            `SELECT id, notified_at
             FROM payroll_supervisor_unsigned_draft_metrics
             WHERE agency_id = ? AND payroll_period_id = ? AND supervisor_user_id = ?
             LIMIT 1`,
            [agencyId, payrollPeriodId, supervisorUserId]
          );
          const metric = mRows?.[0] || null;
          if (!metric?.id || metric.notified_at) continue;

          await Notification.create({
            type: 'payroll_unsigned_draft_notes',
            severity: 'warning',
            title: 'Unsigned draft notes pending',
            message: `Payroll was run for ${label}. You have ${unsignedDraftCount} supervisee note(s) submitted as draft that still need your signature.`,
            userId: supervisorUserId,
        agencyId,
            relatedEntityType: 'payroll_period',
            relatedEntityId: payrollPeriodId
          });

          await pool.execute(
            `UPDATE payroll_supervisor_unsigned_draft_metrics
             SET notified_at = CURRENT_TIMESTAMP
             WHERE id = ?
             LIMIT 1`,
            [metric.id]
          );
        }
      }
    } catch (e) {
      // Do not block payroll runs if metrics/notifications fail (or migration not applied yet).
      if (e?.code !== 'ER_NO_SUCH_TABLE') {
        // ignore
      }
    }

    await pool.execute(
      `UPDATE payroll_periods
       SET status = 'ran',
           ran_at = CURRENT_TIMESTAMP,
           ran_by_user_id = ?
       WHERE id = ?`,
      [req.user.id, payrollPeriodId]
    );

    const updated = await PayrollPeriod.findById(payrollPeriodId);
    const summaries = await PayrollSummary.listForPeriod(payrollPeriodId);
    res.json({ period: updated, summaries });
  } catch (e) {
    next(e);
  }
};

export const postPayrollPeriod = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    const st = String(period.status || '').toLowerCase();
    if (st === 'posted' || st === 'finalized') {
      return res.json(await PayrollPeriod.findById(payrollPeriodId));
    }
    if (st !== 'ran') {
      return res.status(409).json({ error: { message: 'You must Run Payroll before posting' } });
    }

    const [countRows] = await pool.execute(
      'SELECT COUNT(1) AS cnt FROM payroll_summaries WHERE payroll_period_id = ?',
      [payrollPeriodId]
    );
    const cnt = Number(countRows?.[0]?.cnt || 0);
    if (cnt <= 0) {
      return res.status(409).json({ error: { message: 'No run results found. Please Run Payroll again before posting.' } });
    }

    await pool.execute(
      `UPDATE payroll_periods
       SET status = 'posted',
           posted_at = CURRENT_TIMESTAMP,
           posted_by_user_id = ?
       WHERE id = ?`,
      [req.user.id, payrollPeriodId]
    );

    // Best-effort: emit configured payroll note-aging alerts.
    try {
      await PayrollNotesAgingService.emitTwoPeriodsOldUnpaidNotesAlerts({
        agencyId: period.agency_id,
        payrollPeriodId
      });
    } catch {
      // Do not block posting payroll if notifications fail.
    }

    // Best-effort: accrue PTO balances for this posted pay period.
    try {
      await runPtoAccrualForPostedPeriod({
        agencyId: period.agency_id,
        payrollPeriodId,
        postedByUserId: req.user.id
      });
    } catch {
      // Do not block posting payroll if PTO accrual fails.
    }

    // Best-effort: prompt providers to review office reservations (biweekly cadence).
    try {
      await OfficeScheduleReviewService.emitBiweeklyReviewNotifications({
        agencyId: period.agency_id,
        payrollPeriodId,
        postedByUserId: req.user.id
      });
    } catch {
      // Do not block posting payroll if office review notifications fail.
    }

    res.json(await PayrollPeriod.findById(payrollPeriodId));
  } catch (e) {
    next(e);
  }
};

// Super-admin safety hatch: unpost a period that was posted by mistake.
// This does NOT delete imports, staging edits, or run results. It only reverts "posted/finalized" flags back to a runnable state.
// Best-effort: also rolls back PTO accrual ledger rows created by posting, and clears notification dedupe events for this post.
export const unpostPayrollPeriod = async (req, res, next) => {
  let conn = null;
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;
    if (req.user?.role !== 'super_admin') return res.status(403).json({ error: { message: 'Super admin required' } });

    const st = String(period.status || '').toLowerCase();
    const looksPosted = st === 'posted' || st === 'finalized' || !!period?.posted_at || !!period?.posted_by_user_id;
    if (!looksPosted) {
      return res.status(409).json({ error: { message: 'Pay period is not posted' } });
    }

    const agencyId = Number(period.agency_id);
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const safeExec = async (sql, params) => {
      try {
        return await conn.execute(sql, params);
      } catch (e) {
        if (e?.code === 'ER_NO_SUCH_TABLE') return [[], null];
        throw e;
      }
    };

    // Best-effort: roll back PTO accrual entries created at posting time.
    // We reverse balances, clear last_accrued pointer, and delete the accrual ledger rows for this payroll period.
    let rolledBackPtoLedgerRows = 0;
    try {
      const [aggRows] = await safeExec(
        `SELECT user_id, pto_bucket, SUM(hours_delta) AS hours
         FROM payroll_pto_ledger
         WHERE agency_id = ?
           AND payroll_period_id = ?
           AND entry_type = 'accrual'
         GROUP BY user_id, pto_bucket`,
        [agencyId, payrollPeriodId]
      );
      for (const r of aggRows || []) {
        const userId = Number(r.user_id);
        const bucket = String(r.pto_bucket || '').toLowerCase();
        const hours = Number(r.hours || 0);
        if (!userId || !(hours > 0)) continue;
        if (bucket === 'sick') {
          await safeExec(
            `UPDATE payroll_pto_accounts
             SET sick_balance_hours = GREATEST(0, COALESCE(sick_balance_hours, 0) - ?)
             WHERE agency_id = ? AND user_id = ?
             LIMIT 1`,
            [hours, agencyId, userId]
          );
        } else if (bucket === 'training') {
          await safeExec(
            `UPDATE payroll_pto_accounts
             SET training_balance_hours = GREATEST(0, COALESCE(training_balance_hours, 0) - ?)
             WHERE agency_id = ? AND user_id = ?
             LIMIT 1`,
            [hours, agencyId, userId]
          );
        }
      }

      await safeExec(
        `UPDATE payroll_pto_accounts
         SET last_accrued_payroll_period_id = NULL
         WHERE agency_id = ?
           AND last_accrued_payroll_period_id = ?`,
        [agencyId, payrollPeriodId]
      );

      const [delRes] = await safeExec(
        `DELETE FROM payroll_pto_ledger
         WHERE agency_id = ?
           AND payroll_period_id = ?
           AND entry_type = 'accrual'`,
        [agencyId, payrollPeriodId]
      );
      rolledBackPtoLedgerRows = Number(delRes?.affectedRows || 0);
    } catch {
      // If PTO tables/migrations are missing or rollback fails, do not block unpost.
    }

    // Best-effort: clear notification dedupe events tied to this posted period so a later repost can re-emit correctly.
    let clearedNotificationEvents = 0;
    try {
      const [delEvtRes] = await safeExec(
        `DELETE FROM notification_events
         WHERE agency_id = ?
           AND payroll_period_id = ?
           AND trigger_key IN ('payroll_unpaid_notes_2_periods_old')`,
        [agencyId, payrollPeriodId]
      );
      clearedNotificationEvents = Number(delEvtRes?.affectedRows || 0);
    } catch {
      // ignore
    }

    // Revert posted/finalized flags. Keep run results intact.
    await safeExec(
      `UPDATE payroll_periods
       SET status = 'ran',
           posted_at = NULL,
           posted_by_user_id = NULL,
           finalized_at = NULL,
           finalized_by_user_id = NULL
       WHERE id = ?`,
      [payrollPeriodId]
    );

    await conn.commit();
    res.json({
      ok: true,
      period: await PayrollPeriod.findById(payrollPeriodId),
      meta: {
        rolledBackPtoLedgerRows,
        clearedNotificationEvents
      }
    });
  } catch (e) {
    try { if (conn) await conn.rollback(); } catch { /* ignore */ }
    next(e);
  } finally {
    try { if (conn) conn.release(); } catch { /* ignore */ }
  }
};

export const previewPostPayrollPeriod = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;

    const unpaidNotes = await PayrollNotesAgingService.previewTwoPeriodsOldUnpaidNotesAlerts({
      agencyId: period.agency_id,
      payrollPeriodId,
      providerUserId: userId
    });

    res.json({
      ok: true,
      payrollPeriodId,
      agencyId: period.agency_id,
      notifications: [
        ...(unpaidNotes?.notifications || [])
      ],
      meta: {
        unpaidNotes: {
          ok: unpaidNotes?.ok,
          skipped: unpaidNotes?.skipped,
          reason: unpaidNotes?.reason,
          stalePeriodId: unpaidNotes?.stalePeriodId || null,
          stalePeriodStart: String(unpaidNotes?.stalePeriod?.period_start || '').slice(0, 10),
          stalePeriodEnd: String(unpaidNotes?.stalePeriod?.period_end || '').slice(0, 10)
        }
      }
    });
  } catch (e) {
    next(e);
  }
};

export const restagePayrollPeriod = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id, 10);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    if (isEffectivelyPostedOrFinalized(period)) {
      return res.status(409).json({ error: { message: 'Pay period is posted/finalized' } });
    }

    // Restage = clear run results and return to staging, without deleting imports/staging edits/adjustments.
    await pool.execute('DELETE FROM payroll_summaries WHERE payroll_period_id = ?', [payrollPeriodId]);
    await pool.execute(
      `UPDATE payroll_periods
       SET status = 'staged',
           ran_at = NULL,
           ran_by_user_id = NULL
       WHERE id = ?`,
      [payrollPeriodId]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const deletePayrollPeriod = async (req, res, next) => {
  let conn = null;
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const safeDelete = async (sql, params) => {
      try {
        await conn.execute(sql, params);
      } catch (e) {
        // Some environments may not have all payroll tables yet.
        if (e?.code === 'ER_NO_SUCH_TABLE') return;
        throw e;
      }
    };

    await safeDelete('DELETE FROM payroll_adp_export_jobs WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeDelete('DELETE FROM payroll_summaries WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeDelete('DELETE FROM payroll_adjustments WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeDelete('DELETE FROM payroll_manual_pay_lines WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeDelete('DELETE FROM payroll_stage_carryovers WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeDelete('DELETE FROM payroll_period_run_rows WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeDelete('DELETE FROM payroll_period_runs WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeDelete('DELETE FROM payroll_staging_overrides WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeDelete('DELETE FROM payroll_import_rows WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeDelete('DELETE FROM payroll_imports WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeDelete('DELETE FROM payroll_periods WHERE id = ?', [payrollPeriodId]);

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    try { if (conn) await conn.rollback(); } catch { /* ignore */ }
    next(e);
  } finally {
    try { if (conn) conn.release(); } catch { /* ignore */ }
  }
};

export const resetPayrollPeriod = async (req, res, next) => {
  let conn = null;
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;
    // Super admins can always reset (including posted/finalized) for emergency recovery.
    // For everyone else, a posted/finalized period is locked.
    if (isEffectivelyPostedOrFinalized(period) && req.user?.role !== 'super_admin') {
      return res.status(409).json({ error: { message: 'Pay period is posted/finalized and cannot be reset.' } });
    }

    // Reset should NOT delete the pay period itself. It clears imports/staging/adjustments/run results
    // and returns the period to a draft-like state so you can re-import and re-run cleanly.
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const safeExec = async (sql, params) => {
      try {
        await conn.execute(sql, params);
      } catch (e) {
        if (e?.code === 'ER_NO_SUCH_TABLE') return;
        throw e;
      }
    };

    await safeExec('DELETE FROM payroll_adp_export_jobs WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeExec('DELETE FROM payroll_summaries WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeExec('DELETE FROM payroll_adjustments WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeExec('DELETE FROM payroll_manual_pay_lines WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeExec('DELETE FROM payroll_stage_carryovers WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeExec('DELETE FROM payroll_period_run_rows WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeExec('DELETE FROM payroll_period_runs WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeExec('DELETE FROM payroll_staging_overrides WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeExec('DELETE FROM payroll_import_rows WHERE payroll_period_id = ?', [payrollPeriodId]);
    await safeExec('DELETE FROM payroll_imports WHERE payroll_period_id = ?', [payrollPeriodId]);

    // Return to initial state.
    await safeExec(
      `UPDATE payroll_periods
       SET status = 'draft',
           ran_at = NULL,
           ran_by_user_id = NULL,
           posted_at = NULL,
           posted_by_user_id = NULL,
           finalized_at = NULL,
           finalized_by_user_id = NULL
       WHERE id = ?`,
      [payrollPeriodId]
    );

    await conn.commit();
    res.json({ ok: true, period: await PayrollPeriod.findById(payrollPeriodId) });
  } catch (e) {
    try { if (conn) await conn.rollback(); } catch { /* ignore */ }
    next(e);
  } finally {
    try { if (conn) conn.release(); } catch { /* ignore */ }
  }
};

export const getPayrollAdjustmentsForUser = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const userId = req.query.userId ? parseInt(req.query.userId) : null;
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });

    const adj = await PayrollAdjustment.findForPeriodUser(payrollPeriodId, userId);
    res.json(adj || {
      payroll_period_id: payrollPeriodId,
      agency_id: period.agency_id,
      user_id: userId,
      mileage_amount: 0,
      medcancel_amount: 0,
      other_taxable_amount: 0,
      imatter_amount: 0,
      missed_appointments_amount: 0,
      bonus_amount: 0,
      reimbursement_amount: 0,
      tuition_reimbursement_amount: 0,
      other_rate_1_hours: 0,
      other_rate_2_hours: 0,
      other_rate_3_hours: 0,
      salary_amount: 0,
      pto_hours: 0,
      pto_rate: 0
    });
  } catch (e) {
    next(e);
  }
};

export const upsertPayrollAdjustmentsForUser = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;
    const st = String(period.status || '').toLowerCase();
    if (st === 'finalized' || st === 'posted') {
      return res.status(409).json({ error: { message: 'Pay period is posted/finalized' } });
    }

    const body = req.body || {};
    const toNum = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
    const mileageAmount = toNum(body.mileageAmount);
    const medcancelAmount = toNum(body.medcancelAmount);
    const otherTaxableAmount = toNum(body.otherTaxableAmount);
    const imatterAmount = toNum(body.imatterAmount);
    const missedAppointmentsAmount = toNum(body.missedAppointmentsAmount);
    const bonusAmount = toNum(body.bonusAmount);
    const reimbursementAmount = toNum(body.reimbursementAmount);
    const tuitionReimbursementAmount = toNum(body.tuitionReimbursementAmount);
    const otherRate1Hours = toNum(body.otherRate1Hours);
    const otherRate2Hours = toNum(body.otherRate2Hours);
    const otherRate3Hours = toNum(body.otherRate3Hours);
    const salaryAmount = toNum(body.salaryAmount);
    const ptoHours = toNum(body.ptoHours);
    const ptoRate = toNum(body.ptoRate);

    const nums = [
      mileageAmount,
      medcancelAmount,
      otherTaxableAmount,
      imatterAmount,
      missedAppointmentsAmount,
      bonusAmount,
      reimbursementAmount,
      tuitionReimbursementAmount,
      otherRate1Hours,
      otherRate2Hours,
      otherRate3Hours,
      salaryAmount,
      ptoHours,
      ptoRate
    ];
    if (!nums.every((n) => Number.isFinite(n) && n >= 0)) {
      return res.status(400).json({ error: { message: 'All adjustment fields must be non-negative numbers' } });
    }

    await PayrollAdjustment.upsert({
      payrollPeriodId,
      agencyId: period.agency_id,
      userId,
      mileageAmount,
      medcancelAmount,
      otherTaxableAmount,
      imatterAmount,
      missedAppointmentsAmount,
      bonusAmount,
      reimbursementAmount,
      tuitionReimbursementAmount,
      otherRate1Hours,
      otherRate2Hours,
      otherRate3Hours,
      salaryAmount,
      ptoHours,
      ptoRate,
      updatedByUserId: req.user.id
    });

    // If payroll has already been run, apply add-ons immediately by recomputing summaries,
    // so the Ran Payroll view stays populated and reflects the new adjustments.
    if (st === 'ran') {
      await recomputeSummariesFromStaging({
        payrollPeriodId,
        agencyId: period.agency_id,
        periodStart: period.period_start,
        periodEnd: period.period_end
      });
      const updated = await PayrollPeriod.findById(payrollPeriodId);
      const summaries = await PayrollSummary.listForPeriod(payrollPeriodId);
      return res.json({ ok: true, period: updated, summaries });
    }

    // Otherwise, treat adjustments as staging edits (no published totals until Run Payroll).
    await pool.execute('DELETE FROM payroll_summaries WHERE payroll_period_id = ?', [payrollPeriodId]);
    await pool.execute(
      `UPDATE payroll_periods
       SET status = 'staged',
           ran_at = NULL,
           ran_by_user_id = NULL
       WHERE id = ?`,
      [payrollPeriodId]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listUserSalaryPositions = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });

    const [ua] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE agency_id = ? AND user_id = ? LIMIT 1`,
      [agencyId, userId]
    );
    if (!ua?.length) return res.status(404).json({ error: { message: 'User is not assigned to this organization' } });

    const rows = await PayrollSalaryPosition.listForUser({ agencyId, userId });
    res.json({ positions: rows || [] });
  } catch (e) {
    next(e);
  }
};

export const upsertUserSalaryPosition = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });

    const body = req.body || {};
    const id = body.id ? parseInt(body.id) : null;
    const salaryPerPayPeriod = Number(body.salaryPerPayPeriod || 0);
    const includeServicePay = !!body.includeServicePay;
    const prorateByDays = (body.prorateByDays === undefined || body.prorateByDays === null) ? true : !!body.prorateByDays;
    const effectiveStart = body.effectiveStart ? String(body.effectiveStart).slice(0, 10) : null;
    const effectiveEnd = body.effectiveEnd ? String(body.effectiveEnd).slice(0, 10) : null;

    if (!Number.isFinite(salaryPerPayPeriod) || salaryPerPayPeriod < 0) {
      return res.status(400).json({ error: { message: 'salaryPerPayPeriod must be a non-negative number' } });
    }
    if (effectiveStart && effectiveEnd && String(effectiveEnd) < String(effectiveStart)) {
      return res.status(400).json({ error: { message: 'effectiveEnd must be >= effectiveStart' } });
    }

    const [ua] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE agency_id = ? AND user_id = ? LIMIT 1`,
      [agencyId, userId]
    );
    if (!ua?.length) return res.status(404).json({ error: { message: 'User is not assigned to this organization' } });

    const row = await PayrollSalaryPosition.upsert({
      id,
      agencyId,
      userId,
      salaryPerPayPeriod,
      includeServicePay: includeServicePay ? 1 : 0,
      prorateByDays: prorateByDays ? 1 : 0,
      effectiveStart,
      effectiveEnd,
      createdByUserId: req.user.id,
      updatedByUserId: req.user.id
    });

    res.json({ ok: true, position: row });
  } catch (e) {
    next(e);
  }
};

export const deleteUserSalaryPosition = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const positionId = parseInt(req.params.positionId);
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    if (!userId || !positionId) return res.status(400).json({ error: { message: 'userId and positionId are required' } });

    await PayrollSalaryPosition.delete({ id: positionId, agencyId });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const getAgencyMileageRates = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const rows = await AgencyMileageRate.listForAgency(agencyId);
    // Ensure tiers 1..3 exist in response for easy UI binding.
    const byTier = new Map((rows || []).map((r) => [Number(r.tier_level), r]));
    const rates = [1, 2, 3].map((t) => {
      const r = byTier.get(t) || null;
      return { tierLevel: t, ratePerMile: r ? Number(r.rate_per_mile || 0) : 0 };
    });
    res.json({ agencyId, rates });
  } catch (e) {
    next(e);
  }
};

export const getMyAgencyMileageRates = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const rows = await AgencyMileageRate.listForAgency(agencyId);
    const byTier = new Map((rows || []).map((r) => [Number(r.tier_level), r]));
    const rates = [1, 2, 3].map((t) => {
      const r = byTier.get(t) || null;
      return { tierLevel: t, ratePerMile: r ? Number(r.rate_per_mile || 0) : 0 };
    });
    res.json({ agencyId, rates });
  } catch (e) {
    next(e);
  }
};

export const upsertAgencyMileageRates = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const body = req.body || {};
    const rates = Array.isArray(body.rates) ? body.rates : [];
    if (!rates.length) return res.status(400).json({ error: { message: 'rates array is required' } });

    for (const r of rates) {
      const tierLevel = Number(r?.tierLevel);
      const ratePerMile = Number(r?.ratePerMile);
      if (![1, 2, 3].includes(tierLevel)) {
        return res.status(400).json({ error: { message: 'tierLevel must be 1, 2, or 3' } });
      }
      if (!Number.isFinite(ratePerMile) || ratePerMile < 0) {
        return res.status(400).json({ error: { message: 'ratePerMile must be a non-negative number' } });
      }
    }

    await Promise.all(
      rates.map((r) =>
        AgencyMileageRate.upsert({
          agencyId,
          tierLevel: Number(r.tierLevel),
          ratePerMile: Number(r.ratePerMile),
          updatedByUserId: req.user?.id
        })
      )
    );

    const updated = await AgencyMileageRate.listForAgency(agencyId);
    const byTier = new Map((updated || []).map((r) => [Number(r.tier_level), r]));
    const normalized = [1, 2, 3].map((t) => {
      const row = byTier.get(t) || null;
      return { tierLevel: t, ratePerMile: row ? Number(row.rate_per_mile || 0) : 0 };
    });
    res.json({ ok: true, agencyId, rates: normalized });
  } catch (e) {
    next(e);
  }
};

export const createMyMileageClaim = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const body = req.body || {};
    const agencyId = body.agencyId ? parseInt(body.agencyId, 10) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const claimType = String(body.claimType || 'school_travel').trim().toLowerCase();
    if (claimType === 'school_travel') {
      const inSchoolEnabled = await isAgencyFeatureEnabled(agencyId, 'inSchoolSubmissionsEnabled', true);
      if (!inSchoolEnabled) {
        return res.status(403).json({ error: { message: 'In-School submissions are disabled for this organization' } });
      }
    }
    const driveDate = String(body.driveDate || '').slice(0, 10);
    const schoolOrganizationId = body.schoolOrganizationId ? parseInt(body.schoolOrganizationId, 10) : null;
    const officeLocationId = body.officeLocationId ? parseInt(body.officeLocationId, 10) : null;
    const officeKey = body.officeKey ? String(body.officeKey).slice(0, 64) : null; // legacy
    const homeSchoolRoundtripMiles = body.homeSchoolRoundtripMiles === null || body.homeSchoolRoundtripMiles === undefined || body.homeSchoolRoundtripMiles === ''
      ? null
      : Number(body.homeSchoolRoundtripMiles);
    const homeOfficeRoundtripMiles = body.homeOfficeRoundtripMiles === null || body.homeOfficeRoundtripMiles === undefined || body.homeOfficeRoundtripMiles === ''
      ? null
      : Number(body.homeOfficeRoundtripMiles);

    // Backward-compat (older UI): allow miles + roundTrip
    const miles = body.miles === null || body.miles === undefined || body.miles === '' ? null : Number(body.miles);
    const roundTrip = body.roundTrip ? 1 : 0;

    const startLocation = body.startLocation ? String(body.startLocation).slice(0, 255) : null;
    const endLocation = body.endLocation ? String(body.endLocation).slice(0, 255) : null;
    const notes = body.notes ? String(body.notes) : null;
    const tripPurpose = body.tripPurpose ? String(body.tripPurpose).trim().slice(0, 255) : null;
    const tripApprovedBy = body.tripApprovedBy ? String(body.tripApprovedBy).trim().slice(0, 255) : null;
    const costCenter = body.costCenter ? String(body.costCenter).trim().slice(0, 255) : null;
    const tripPreapprovedRaw = body.tripPreapproved;
    const tripPreapproved =
      tripPreapprovedRaw === null || tripPreapprovedRaw === undefined || tripPreapprovedRaw === ''
        ? null
        : (tripPreapprovedRaw === true || tripPreapprovedRaw === 1 || tripPreapprovedRaw === '1' || String(tripPreapprovedRaw).toLowerCase() === 'true')
          ? 1
          : (tripPreapprovedRaw === false || tripPreapprovedRaw === 0 || tripPreapprovedRaw === '0' || String(tripPreapprovedRaw).toLowerCase() === 'false')
            ? 0
            : null;
    const attestation = body.attestation ? 1 : 0;
    const tierLevelRaw = body.tierLevel === null || body.tierLevel === undefined || body.tierLevel === '' ? null : Number(body.tierLevel);
    const tierLevel = tierLevelRaw === null ? null : tierLevelRaw;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(driveDate)) {
      return res.status(400).json({ error: { message: 'driveDate (YYYY-MM-DD) is required' } });
    }

    // Enforce submission deadlines (timezone: office location when available; otherwise default).
    let officeTz = null;
    try {
      if (officeLocationId) {
        const loc = await OfficeLocation.findById(officeLocationId);
        officeTz = loc?.timezone || null;
      }
    } catch { /* best-effort */ }
    const win = await computeSubmissionWindow({
      agencyId,
      effectiveDateYmd: driveDate,
      submittedAt: new Date(),
      timeZone: resolveClaimTimeZone({ officeLocationTimeZone: officeTz }),
      hardStopPolicy: claimType === 'school_travel' ? 'in_school' : '60_days'
    });
    if (!win.ok) {
      return res.status(win.status || 409).json({ error: { message: win.errorMessage || CLAIM_DEADLINE_ERROR_MESSAGE } });
    }
    const suggestedPayrollPeriodIdOverride = win.suggestedPayrollPeriodId;
    if (claimType === 'school_travel') {
      if (!schoolOrganizationId) return res.status(400).json({ error: { message: 'schoolOrganizationId is required' } });
      if (!officeLocationId && !officeKey) return res.status(400).json({ error: { message: 'officeLocationId is required' } });
      // Allow manual miles override for school_travel (used when auto distance is unavailable).
      if (miles !== null) {
        if (!Number.isFinite(Number(miles)) || Number(miles) < 0) {
          return res.status(400).json({ error: { message: 'miles must be a non-negative number' } });
        }
      }
    } else {
      if (!Number.isFinite(Number(miles)) || Number(miles) < 0) {
        return res.status(400).json({ error: { message: 'miles must be a non-negative number' } });
      }
      if (!tripApprovedBy) {
        return res.status(400).json({ error: { message: 'tripApprovedBy is required for Other Mileage' } });
      }
      if (tripPreapproved === null) {
        return res.status(400).json({ error: { message: 'tripPreapproved must be true/false for Other Mileage' } });
      }
      if (!tripPurpose) {
        return res.status(400).json({ error: { message: 'tripPurpose is required for Other Mileage' } });
      }
    }
    if (!attestation) {
      return res.status(400).json({ error: { message: 'attestation is required' } });
    }
    if (tierLevel !== null && ![1, 2, 3].includes(tierLevel)) {
      return res.status(400).json({ error: { message: 'tierLevel must be 1, 2, 3, or null' } });
    }

    // If school_travel and distances not provided, compute them automatically from stored addresses.
    let computedHomeSchoolRt = homeSchoolRoundtripMiles;
    let computedHomeOfficeRt = homeOfficeRoundtripMiles;
    if (claimType === 'school_travel' && miles === null && (computedHomeSchoolRt === null || computedHomeOfficeRt === null)) {
      // Home address (user)
      const [uRows] = await pool.execute(
        `SELECT home_street_address, home_address_line2, home_city, home_state, home_postal_code
         FROM users WHERE id = ? LIMIT 1`,
        [userId]
      );
      const u = uRows?.[0] || {};
      const homeAddr = [u.home_street_address, u.home_address_line2, u.home_city, u.home_state, u.home_postal_code].filter(Boolean).join(', ');
      if (!homeAddr) {
        return res.status(409).json({ error: { message: 'Home address is required to auto-calculate mileage. Please set it first.' } });
      }

      // School address (agency org)
      const [sRows] = await pool.execute(
        `SELECT street_address, city, state, postal_code
         FROM agencies WHERE id = ? LIMIT 1`,
        [schoolOrganizationId]
      );
      const s = sRows?.[0] || {};
      const schoolAddr = [s.street_address, s.city, s.state, s.postal_code].filter(Boolean).join(', ');
      if (!schoolAddr) {
        return res.status(409).json({ error: { message: 'School address is not configured for mileage calculation.' } });
      }

      // Office address (office_locations)
      let officeAddr = '';
      if (officeLocationId) {
        const [oRows] = await pool.execute(
          `SELECT street_address, city, state, postal_code
           FROM office_locations WHERE id = ? LIMIT 1`,
          [officeLocationId]
        );
        const o = oRows?.[0] || {};
        officeAddr = [o.street_address, o.city, o.state, o.postal_code].filter(Boolean).join(', ');
      }
      if (!officeAddr) {
        return res.status(409).json({ error: { message: 'Office address is not configured for mileage calculation.' } });
      }

      try {
        const metersHomeSchoolOneWay = await getDrivingDistanceMeters(homeAddr, schoolAddr);
        const metersHomeOfficeOneWay = await getDrivingDistanceMeters(homeAddr, officeAddr);
        computedHomeSchoolRt = Math.round(metersToMiles(metersHomeSchoolOneWay) * 2 * 100) / 100;
        computedHomeOfficeRt = Math.round(metersToMiles(metersHomeOfficeOneWay) * 2 * 100) / 100;
      } catch (e) {
        const msg = e?.code === 'MAPS_KEY_MISSING'
          ? 'Automatic mileage requires GOOGLE_MAPS_API_KEY to be configured.'
          : (e.message || 'Failed to compute distance');
        return res.status(409).json({ error: { message: msg } });
      }
    }

    const eligibleMiles =
      claimType === 'school_travel'
        ? (miles !== null
          ? Math.round(Math.max(0, Number(miles)) * 100) / 100
          : (Number.isFinite(Number(computedHomeSchoolRt)) && Number.isFinite(Number(computedHomeOfficeRt))
            ? Math.round(Math.max(0, Number(computedHomeSchoolRt) - Number(computedHomeOfficeRt)) * 100) / 100
            : null))
        : null;

    const claim = await PayrollMileageClaim.create({
      agencyId,
      userId,
      driveDate,
      claimType,
      schoolOrganizationId,
      officeLocationId,
      officeKey,
      homeSchoolRoundtripMiles: computedHomeSchoolRt,
      homeOfficeRoundtripMiles: computedHomeOfficeRt,
      eligibleMiles,
      miles,
      roundTrip,
      startLocation,
      endLocation,
      tripPurpose,
      tripApprovedBy,
      tripPreapproved,
      costCenter,
      notes,
      attestation,
      tierLevel,
      suggestedPayrollPeriodId: suggestedPayrollPeriodIdOverride
    });
    res.json({ claim });
  } catch (e) {
    next(e);
  }
};

export const createUserMileageClaim = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId ? parseInt(req.params.userId, 10) : null;
    const body = req.body || {};
    const agencyId = body.agencyId ? parseInt(body.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    if (!(await requireTargetUserInAgency({ res, agencyId, targetUserId }))) return;

    const prev = req.user;
    req.user = { ...(prev || {}), id: targetUserId, role: 'provider' };
    try {
      return await createMyMileageClaim(req, res, next);
    } finally {
      req.user = prev;
    }
  } catch (e) {
    next(e);
  }
};

export const listAgencySchoolsForPayroll = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Membership for non-admins; admin/support can view.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [req.user.id, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const links = await AgencySchool.listByAgency(agencyId, { includeInactive: false });
    const schools = (links || []).map((r) => ({
      schoolOrganizationId: r.school_organization_id,
      name: r.school_name || `School #${r.school_organization_id}`
    }));
    res.json(schools);
  } catch (e) {
    next(e);
  }
};

export const listMyAssignedSchoolsForPayroll = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!req.user?.id) return res.status(401).json({ error: { message: 'Not authenticated' } });

    // Membership for non-admins; admin/support can view.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [req.user.id, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    // "Assigned schools" for provider-based in-school claims come from provider_school_assignments.
    // Use DISTINCT to collapse day-of-week rows into one school option.
    const [schools] = await pool.execute(
      `SELECT DISTINCT
              psa.school_organization_id AS schoolOrganizationId,
              s.name AS name
       FROM provider_school_assignments psa
       JOIN agencies s ON s.id = psa.school_organization_id
       JOIN organization_affiliations oa
         ON oa.organization_id = psa.school_organization_id
        AND oa.agency_id = ?
        AND oa.is_active = TRUE
       WHERE psa.provider_user_id = ?
         AND psa.is_active = TRUE
       ORDER BY s.name ASC`,
      [agencyId, req.user.id]
    );

    res.json(schools || []);
  } catch (e) {
    next(e);
  }
};

export const listOfficeLocationsForPayroll = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const includeInactive = req.query.includeInactive === 'true';

    // Membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [req.user.id, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const rows = await OfficeLocation.findByAgency(agencyId, { includeInactive });
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const getPayrollOtherRateTitles = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    // Defaults
    const base = { title1: 'Other 1', title2: 'Other 2', title3: 'Other 3' };
    let agencyRow = null;
    let userRow = null;

    try {
      const [aRows] = await pool.execute(
        `SELECT title_1, title_2, title_3
         FROM payroll_other_rate_titles
         WHERE agency_id = ?
         LIMIT 1`,
        [agencyId]
      );
      agencyRow = aRows?.[0] || null;
    } catch {
      agencyRow = null;
    }

    if (userId) {
      try {
        const [uRows] = await pool.execute(
          `SELECT title_1, title_2, title_3
           FROM payroll_user_other_rate_titles
           WHERE agency_id = ? AND user_id = ?
           LIMIT 1`,
          [agencyId, userId]
        );
        userRow = uRows?.[0] || null;
      } catch {
        userRow = null;
      }
    }

    const agencyTitles = {
      title1: String(agencyRow?.title_1 || '').trim() || base.title1,
      title2: String(agencyRow?.title_2 || '').trim() || base.title2,
      title3: String(agencyRow?.title_3 || '').trim() || base.title3
    };
    const userOverride = {
      title1: userRow?.title_1 === null || userRow?.title_1 === undefined ? null : String(userRow.title_1 || '').trim(),
      title2: userRow?.title_2 === null || userRow?.title_2 === undefined ? null : String(userRow.title_2 || '').trim(),
      title3: userRow?.title_3 === null || userRow?.title_3 === undefined ? null : String(userRow.title_3 || '').trim()
    };
    const effective = {
      title1: (userOverride.title1 ? userOverride.title1 : agencyTitles.title1),
      title2: (userOverride.title2 ? userOverride.title2 : agencyTitles.title2),
      title3: (userOverride.title3 ? userOverride.title3 : agencyTitles.title3)
    };
    const source =
      (userOverride.title1 || userOverride.title2 || userOverride.title3)
        ? 'user'
        : (agencyRow ? 'agency' : 'default');

      res.json({
      ...effective,
      source,
      agencyTitle1: agencyTitles.title1,
      agencyTitle2: agencyTitles.title2,
      agencyTitle3: agencyTitles.title3,
      userOverrideTitle1: userOverride.title1,
      userOverrideTitle2: userOverride.title2,
      userOverrideTitle3: userOverride.title3
    });
  } catch (e) {
    next(e);
  }
};

export const putPayrollOtherRateTitlesForAgency = async (req, res, next) => {
  try {
    const { agencyId, title1, title2, title3 } = req.body || {};
    const aId = agencyId ? parseInt(agencyId, 10) : null;
    if (!aId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, aId))) return;

    const norm = (v, fallback) => {
      const t = String(v ?? '').trim();
      if (!t) return fallback;
      if (t.length > 64) throw new Error('Titles must be 64 characters or fewer');
      return t;
    };
    const t1 = norm(title1, 'Other 1');
    const t2 = norm(title2, 'Other 2');
    const t3 = norm(title3, 'Other 3');

    await pool.execute(
      `INSERT INTO payroll_other_rate_titles (agency_id, title_1, title_2, title_3, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title_1 = VALUES(title_1),
         title_2 = VALUES(title_2),
         title_3 = VALUES(title_3),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [aId, t1, t2, t3, req.user.id]
    );

    res.json({ ok: true, agencyId: aId, title1: t1, title2: t2, title3: t3 });
  } catch (e) {
    res.status(400).json({ error: { message: e.message || 'Failed to save other rate titles' } });
  }
};

export const putPayrollOtherRateTitlesForUser = async (req, res, next) => {
  try {
    const { agencyId, title1, title2, title3 } = req.body || {};
    const aId = agencyId ? parseInt(agencyId, 10) : null;
    const userId = req.params.userId ? parseInt(req.params.userId, 10) : null;
    if (!aId || !userId) return res.status(400).json({ error: { message: 'agencyId and userId are required' } });
    if (!(await requirePayrollAccess(req, res, aId))) return;

    const normNullable = (v) => {
      if (v === null || v === undefined || String(v).trim() === '') return null;
      const t = String(v).trim();
      if (t.length > 64) throw new Error('Titles must be 64 characters or fewer');
      return t;
    };
    const t1 = normNullable(title1);
    const t2 = normNullable(title2);
    const t3 = normNullable(title3);

    await pool.execute(
      `INSERT INTO payroll_user_other_rate_titles (agency_id, user_id, title_1, title_2, title_3, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title_1 = VALUES(title_1),
         title_2 = VALUES(title_2),
         title_3 = VALUES(title_3),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [aId, userId, t1, t2, t3, req.user.id]
    );

    res.json({ ok: true, agencyId: aId, userId, title1: t1, title2: t2, title3: t3 });
  } catch (e) {
    res.status(400).json({ error: { message: e.message || 'Failed to save user other rate title overrides' } });
  }
};

export const createOfficeLocationForPayroll = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const name = req.body?.name ? String(req.body.name).slice(0, 255) : '';
    const timezone = req.body?.timezone ? String(req.body.timezone).slice(0, 64) : 'America/New_York';
    if (!name) return res.status(400).json({ error: { message: 'name is required' } });

    const loc = await OfficeLocation.create({ agencyId, name, timezone, svgMarkup: null });
    res.status(201).json(loc);
  } catch (e) {
    next(e);
  }
};

export const updateOfficeLocationForPayroll = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const locationId = parseInt(req.params.locationId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!locationId) return res.status(400).json({ error: { message: 'locationId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const loc = await OfficeLocation.findById(locationId);
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });
    if (Number(loc.agency_id) !== Number(agencyId)) {
      return res.status(403).json({ error: { message: 'Location does not belong to this agency' } });
    }

    const body = req.body || {};
    const updated = await OfficeLocation.update(locationId, {
      name: body.name !== undefined ? String(body.name).slice(0, 255) : undefined,
      timezone: body.timezone !== undefined ? String(body.timezone).slice(0, 64) : undefined,
      is_active: body.isActive !== undefined ? (body.isActive ? 1 : 0) : undefined,
      street_address: body.streetAddress !== undefined ? (body.streetAddress ? String(body.streetAddress).slice(0, 255) : null) : undefined,
      city: body.city !== undefined ? (body.city ? String(body.city).slice(0, 128) : null) : undefined,
      state: body.state !== undefined ? (body.state ? String(body.state).slice(0, 64) : null) : undefined,
      postal_code: body.postalCode !== undefined ? (body.postalCode ? String(body.postalCode).slice(0, 32) : null) : undefined
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const updateMyHomeAddress = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const body = req.body || {};
    const homeStreetAddress = body.homeStreetAddress ? String(body.homeStreetAddress).slice(0, 255) : null;
    const homeAddressLine2 = body.homeAddressLine2 ? String(body.homeAddressLine2).slice(0, 255) : null;
    const homeCity = body.homeCity ? String(body.homeCity).slice(0, 128) : null;
    const homeState = body.homeState ? String(body.homeState).slice(0, 64) : null;
    const homePostalCode = body.homePostalCode ? String(body.homePostalCode).slice(0, 32) : null;

    await pool.execute(
      `UPDATE users
       SET home_street_address = ?, home_address_line2 = ?, home_city = ?, home_state = ?, home_postal_code = ?
       WHERE id = ?`,
      [homeStreetAddress, homeAddressLine2, homeCity, homeState, homePostalCode, userId]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const getMyHomeAddress = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const [rows] = await pool.execute(
      `SELECT home_street_address, home_address_line2, home_city, home_state, home_postal_code
       FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const u = rows?.[0] || {};
    res.json({
      homeStreetAddress: u.home_street_address || '',
      homeAddressLine2: u.home_address_line2 || '',
      homeCity: u.home_city || '',
      homeState: u.home_state || '',
      homePostalCode: u.home_postal_code || ''
    });
  } catch (e) {
    next(e);
  }
};

export const updateUserHomeAddress = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId ? parseInt(req.params.userId, 10) : null;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    if (!(await requireTargetUserInAgency({ res, agencyId, targetUserId }))) return;

    const prev = req.user;
    req.user = { ...(prev || {}), id: targetUserId, role: 'provider' };
    try {
      return await updateMyHomeAddress(req, res, next);
    } finally {
      req.user = prev;
    }
  } catch (e) {
    next(e);
  }
};

export const getUserHomeAddress = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId ? parseInt(req.params.userId, 10) : null;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    if (!(await requireTargetUserInAgency({ res, agencyId, targetUserId }))) return;

    const prev = req.user;
    req.user = { ...(prev || {}), id: targetUserId, role: 'provider' };
    try {
      return await getMyHomeAddress(req, res, next);
    } finally {
      req.user = prev;
    }
  } catch (e) {
    next(e);
  }
};

export const updateOrganizationAddressForPayroll = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const orgId = parseInt(req.params.orgId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!orgId) return res.status(400).json({ error: { message: 'orgId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    // Only allow updating linked schools (or the agency itself).
    const linked = orgId === agencyId ? true : await (async () => {
      const links = await AgencySchool.listByAgency(agencyId, { includeInactive: true });
      return (links || []).some((x) => Number(x.school_organization_id) === Number(orgId));
    })();
    if (!linked) return res.status(403).json({ error: { message: 'Organization is not linked to this agency' } });

    const body = req.body || {};
    const streetAddress = body.streetAddress ? String(body.streetAddress).slice(0, 255) : null;
    const city = body.city ? String(body.city).slice(0, 128) : null;
    const state = body.state ? String(body.state).slice(0, 64) : null;
    const postalCode = body.postalCode ? String(body.postalCode).slice(0, 32) : null;

    await pool.execute(
      `UPDATE agencies
       SET street_address = ?, city = ?, state = ?, postal_code = ?
       WHERE id = ?`,
      [streetAddress, city, state, postalCode, orgId]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const updateOfficeLocationAddressForPayroll = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const locationId = parseInt(req.params.locationId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!locationId) return res.status(400).json({ error: { message: 'locationId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const loc = await OfficeLocation.findById(locationId);
    if (!loc) return res.status(404).json({ error: { message: 'Location not found' } });
    if (Number(loc.agency_id) !== Number(agencyId)) {
      return res.status(403).json({ error: { message: 'Location does not belong to this agency' } });
    }

    const body = req.body || {};
    const updated = await OfficeLocation.update(locationId, {
      street_address: body.streetAddress,
      city: body.city,
      state: body.state,
      postal_code: body.postalCode
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const listMyMileageClaims = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const status = req.query.status ? String(req.query.status) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const rows = await PayrollMileageClaim.listForUser({ agencyId, userId, status });
    const normalized = (rows || []).map((c) => {
      const computed = computeEligibleMilesForClaim(c);
      if (computed !== null && !(Number(c.eligible_miles) > 0)) {
        return { ...c, eligible_miles: computed };
      }
      return c;
    });
    res.json(normalized);
  } catch (e) {
    next(e);
  }
};

export const deleteMyMileageClaim = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const claim = await PayrollMileageClaim.findById(id);
    if (!claim) return res.status(404).json({ error: { message: 'Mileage claim not found' } });
    if (Number(claim.user_id) !== Number(userId)) return res.status(403).json({ error: { message: 'Access denied' } });

    // Only allow deleting claims that were sent back (needs changes).
    if (String(claim.status || '').toLowerCase() !== 'deferred') {
      return res.status(409).json({ error: { message: 'Only returned claims can be deleted' } });
    }

    await pool.execute('DELETE FROM payroll_mileage_claims WHERE id = ? LIMIT 1', [id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listMileageClaims = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const status = req.query.status ? String(req.query.status) : null;
    const suggestedPayrollPeriodId = req.query.suggestedPeriodId ? parseInt(req.query.suggestedPeriodId, 10) : null;
    const targetPayrollPeriodId = req.query.targetPeriodId ? parseInt(req.query.targetPeriodId, 10) : null;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;

    const rows = await PayrollMileageClaim.listForAgency({
      agencyId,
      status,
      suggestedPayrollPeriodId,
      targetPayrollPeriodId,
      userId
    });
    const normalized = (rows || []).map((c) => {
      const computed = computeEligibleMilesForClaim(c);
      if (computed !== null && !(Number(c.eligible_miles) > 0)) {
        return { ...c, eligible_miles: computed };
      }
      return c;
    });
    res.json(normalized);
  } catch (e) {
    next(e);
  }
};

export const createMyMedcancelClaim = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const body = req.body || {};
    const agencyId = body.agencyId ? parseInt(body.agencyId, 10) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const inSchoolEnabled = await isAgencyFeatureEnabled(agencyId, 'inSchoolSubmissionsEnabled', true);
    const medcancelEnabledForAgency = inSchoolEnabled && (await isAgencyFeatureEnabled(agencyId, 'medcancelEnabled', true));
    if (!medcancelEnabledForAgency) {
      return res.status(403).json({ error: { message: 'Med Cancel is disabled for this organization' } });
    }

    const claimDate = String(body.claimDate || '').slice(0, 10);
    const schoolOrganizationId = body.schoolOrganizationId ? parseInt(body.schoolOrganizationId, 10) : null;
    const itemsRaw = Array.isArray(body.items) ? body.items : [];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(claimDate)) {
      return res.status(400).json({ error: { message: 'claimDate (YYYY-MM-DD) is required' } });
    }

    // Enforce submission deadlines.
    const win = await computeSubmissionWindow({
      agencyId,
      effectiveDateYmd: claimDate,
      submittedAt: new Date(),
      timeZone: resolveClaimTimeZone(),
      hardStopPolicy: 'in_school'
    });
    if (!win.ok) {
      return res.status(win.status || 409).json({
        error: {
          message: win.errorMessage || CLAIM_DEADLINE_ERROR_MESSAGE,
          code: 'submission_window',
          meta: win.meta || win.cutoffs || null
        }
      });
    }
    if (!schoolOrganizationId) return res.status(400).json({ error: { message: 'schoolOrganizationId is required' } });
    // Feature flag: only allow if contract includes Med Cancel.
    const me = await User.findById(userId);
    const schedule = String(me?.medcancel_rate_schedule || '').toLowerCase();
    if (!me || (schedule !== 'low' && schedule !== 'high')) {
      return res.status(403).json({ error: { message: 'Med Cancel is not enabled for your account' } });
    }

    if (!itemsRaw.length) {
      return res.status(400).json({ error: { message: 'items is required (at least 1 missed service)' } });
    }
    const allowedCodes = new Set(['90832', '90834', '90837']);
    const items = itemsRaw.map((it) => ({
      missedServiceCode: String(it?.missedServiceCode || it?.serviceCode || '').trim(),
      clientInitials: String(it?.clientInitials || it?.client_initials || '').trim(),
      sessionTime: String(it?.sessionTime || it?.session_time || '').trim(),
      note: String(it?.note || it?.notes || '').trim(),
      attestation: !!it?.attestation
    }));
    for (const it of items) {
      if (!allowedCodes.has(it.missedServiceCode)) {
        return res.status(400).json({ error: { message: 'missedServiceCode must be one of 90832, 90834, 90837' } });
      }
      if (!it.clientInitials) {
        return res.status(400).json({ error: { message: 'Each item requires client initials' } });
      }
      if (!it.sessionTime) {
        return res.status(400).json({ error: { message: 'Each item requires session time' } });
      }
      if (!it.attestation) {
        return res.status(400).json({ error: { message: 'Each item requires attestation' } });
      }
      if (!it.note) {
        return res.status(400).json({ error: { message: 'Each item requires a note' } });
      }
    }

    // Store as encounter-count (services), not units.
    const unitsRaw = items.length;
    const notes = null;
    const attestation = 1;

    const claim = await PayrollMedcancelClaim.create({
      agencyId,
      userId,
      claimDate,
      schoolOrganizationId,
      units: unitsRaw,
      notes,
      attestation,
      suggestedPayrollPeriodId: win.suggestedPayrollPeriodId
    });

    await PayrollMedcancelClaimItem.createMany({ claimId: claim.id, items });

    const refreshed = await PayrollMedcancelClaim.findById(claim.id);
    const claimItems = await PayrollMedcancelClaimItem.listForClaim(claim.id);
    res.status(201).json({ claim: { ...refreshed, items: claimItems } });
  } catch (e) {
    next(e);
  }
};

export const createUserMedcancelClaim = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId ? parseInt(req.params.userId, 10) : null;
    const body = req.body || {};
    const agencyId = body.agencyId ? parseInt(body.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    if (!(await requireTargetUserInAgency({ res, agencyId, targetUserId }))) return;

    const prev = req.user;
    req.user = { ...(prev || {}), id: targetUserId, role: 'provider' };
    try {
      return await createMyMedcancelClaim(req, res, next);
    } finally {
      req.user = prev;
    }
  } catch (e) {
    next(e);
  }
};

export const createMyReimbursementClaim = [
  receiptUpload.single('receipt'),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const body = req.body || {};
      const agencyId = body.agencyId ? parseInt(body.agencyId, 10) : null;
      if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
      if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

      // Ensure membership for non-admins.
      if (!isAdminRole(req.user.role)) {
        const [rows] = await pool.execute(
          'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
          [userId, agencyId]
        );
        if (!rows || rows.length === 0) {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      }

      const expenseDate = String(body.expenseDate || '').slice(0, 10);
      const amount = body.amount === null || body.amount === undefined || body.amount === '' ? null : Number(body.amount);
      const paymentMethodRaw = String(body.paymentMethod || body.payment_method || '').trim().toLowerCase();
      const paymentMethod =
        ['personal_card', 'cash', 'check', 'other'].includes(paymentMethodRaw)
          ? paymentMethodRaw
          : (paymentMethodRaw ? paymentMethodRaw.slice(0, 32) : null);
      const vendor = body.vendor ? String(body.vendor).slice(0, 255) : null;
      const purchaseApprovedBy = body.purchaseApprovedBy ? String(body.purchaseApprovedBy).trim().slice(0, 255) : null;
      const purchasePreapprovedRaw = body.purchasePreapproved;
      const purchasePreapproved =
        purchasePreapprovedRaw === null || purchasePreapprovedRaw === undefined || purchasePreapprovedRaw === ''
          ? null
          : (purchasePreapprovedRaw === true || purchasePreapprovedRaw === 1 || purchasePreapprovedRaw === '1' || String(purchasePreapprovedRaw).toLowerCase() === 'true')
            ? 1
            : (purchasePreapprovedRaw === false || purchasePreapprovedRaw === 0 || purchasePreapprovedRaw === '0' || String(purchasePreapprovedRaw).toLowerCase() === 'false')
              ? 0
              : null;
      const projectRef = body.projectRef ? String(body.projectRef).trim().slice(0, 64) : null;
      const reason = body.reason ? String(body.reason).trim().slice(0, 255) : null;
      const splitsRaw = body.splits || body.splitsJson || body.splits_json || null;
      let splits = [];
      if (Array.isArray(splitsRaw)) {
        splits = splitsRaw;
      } else if (typeof splitsRaw === 'string' && splitsRaw.trim()) {
        try { splits = JSON.parse(splitsRaw); } catch { splits = []; }
      }
      splits = Array.isArray(splits) ? splits : [];
      const normalizedSplits = splits
        .map((s) => ({
          category: String(s?.category || '').trim().slice(0, 64),
          amount: Number(s?.amount)
        }))
        .filter((s) => s.category && Number.isFinite(s.amount) && s.amount > 0);
      const category = body.category ? String(body.category).slice(0, 64) : null;
      const notes = body.notes ? String(body.notes) : '';
      const attestation = body.attestation ? 1 : 0;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
        return res.status(400).json({ error: { message: 'expenseDate (YYYY-MM-DD) is required' } });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: { message: 'amount must be a positive number' } });
      }
      if (!purchaseApprovedBy) {
        return res.status(400).json({ error: { message: 'purchaseApprovedBy is required' } });
      }
      if (purchasePreapproved === null) {
        return res.status(400).json({ error: { message: 'purchasePreapproved must be true/false' } });
      }
      if (!paymentMethod) {
        return res.status(400).json({ error: { message: 'paymentMethod is required' } });
      }
      if (!reason) {
        return res.status(400).json({ error: { message: 'reason is required' } });
      }
      if (!String(notes || '').trim()) {
        return res.status(400).json({ error: { message: 'notes is required' } });
      }
      if (!attestation) {
        return res.status(400).json({ error: { message: 'attestation is required' } });
      }
      if (!req.file) {
        return res.status(400).json({ error: { message: 'receipt file is required' } });
      }

      // Validate split categories if provided (sum must match amount).
      let splitsJson = null;
      let resolvedCategory = category;
      if (normalizedSplits.length) {
        const sum = Math.round(normalizedSplits.reduce((a, s) => a + Number(s.amount || 0), 0) * 100) / 100;
        const amt = Math.round(Number(amount || 0) * 100) / 100;
        if (Math.abs(sum - amt) > 0.009) {
          return res.status(400).json({ error: { message: `Category splits must add up to ${amt.toFixed(2)}.` } });
        }
        splitsJson = JSON.stringify(normalizedSplits);
        if (normalizedSplits.length === 1) {
          resolvedCategory = normalizedSplits[0].category;
        }
      }

      // Enforce submission deadlines (and choose suggested period accordingly).
      const win = await computeSubmissionWindow({
        agencyId,
        effectiveDateYmd: expenseDate,
        submittedAt: new Date(),
        timeZone: resolveClaimTimeZone(),
        hardStopPolicy: '60_days'
      });
      if (!win.ok) {
        return res.status(win.status || 409).json({ error: { message: win.errorMessage || CLAIM_DEADLINE_ERROR_MESSAGE } });
      }
      const suggestedPayrollPeriodId = win.suggestedPayrollPeriodId;

      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const original = req.file.originalname || 'receipt';
      const ext = (original.includes('.') ? `.${original.split('.').pop()}` : '');
      const filename = `reimbursement-${agencyId}-${userId}-${uniqueSuffix}${ext}`;
      const storageResult = await StorageService.saveReimbursementReceipt(req.file.buffer, filename, req.file.mimetype);

      const claim = await PayrollReimbursementClaim.create({
        agencyId,
        userId,
        status: 'submitted',
        expenseDate,
        amount,
        paymentMethod,
        vendor,
        purchaseApprovedBy,
        purchasePreapproved,
        projectRef,
        reason,
        splitsJson,
        category: resolvedCategory,
        notes: String(notes || ''),
        attestation,
        receiptFilePath: storageResult.relativePath,
        receiptOriginalName: String(original).slice(0, 255),
        receiptMimeType: String(req.file.mimetype || '').slice(0, 128) || null,
        receiptSizeBytes: Number(req.file.size || 0) || null,
        suggestedPayrollPeriodId
      });

      res.status(201).json(claim);
    } catch (e) {
      next(e);
    }
  }
];

export const createUserReimbursementClaim = [
  receiptUpload.single('receipt'),
  async (req, res, next) => {
    try {
      const targetUserId = req.params.userId ? parseInt(req.params.userId, 10) : null;
      const body = req.body || {};
      const agencyId = body.agencyId ? parseInt(body.agencyId, 10) : null;
      if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
      if (!(await requirePayrollAccess(req, res, agencyId))) return;
      if (!(await requireTargetUserInAgency({ res, agencyId, targetUserId }))) return;

      const prev = req.user;
      req.user = { ...(prev || {}), id: targetUserId, role: 'provider' };
      try {
        return await createMyReimbursementClaim[1](req, res, next);
      } finally {
        req.user = prev;
      }
    } catch (e) {
      next(e);
    }
  }
];

export const listMyReimbursementClaims = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const rows = await PayrollReimbursementClaim.listForUser({ agencyId, userId, limit: 200, offset: 0 });
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const deleteMyReimbursementClaim = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const claim = await PayrollReimbursementClaim.findById(id);
    if (!claim) return res.status(404).json({ error: { message: 'Reimbursement claim not found' } });
    if (Number(claim.user_id) !== Number(userId)) return res.status(403).json({ error: { message: 'Access denied' } });

    if (String(claim.status || '').toLowerCase() !== 'deferred') {
      return res.status(409).json({ error: { message: 'Only returned claims can be deleted' } });
    }

    await pool.execute('DELETE FROM payroll_reimbursement_claims WHERE id = ? LIMIT 1', [id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const createMyCompanyCardExpense = [
  receiptUpload.single('receipt'),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const body = req.body || {};
      const agencyId = body.agencyId ? parseInt(body.agencyId, 10) : null;
      if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
      if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: { message: 'User not found' } });
      if (!(user.company_card_enabled === true || user.company_card_enabled === 1 || user.company_card_enabled === '1')) {
        return res.status(403).json({ error: { message: 'Company card expense submissions are not enabled for this user' } });
      }

      // Ensure membership for non-admins.
      if (!isAdminRole(req.user.role)) {
        const [rows] = await pool.execute(
          'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
          [userId, agencyId]
        );
        if (!rows || rows.length === 0) {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      }

      const expenseDate = String(body.expenseDate || '').slice(0, 10);
      const amount = body.amount === null || body.amount === undefined || body.amount === '' ? null : Number(body.amount);
      const paymentMethodRaw = String(body.paymentMethod || body.payment_method || 'company_card').trim().toLowerCase();
      const paymentMethod = paymentMethodRaw ? paymentMethodRaw.slice(0, 32) : 'company_card';
      const vendor = body.vendor ? String(body.vendor).slice(0, 255) : null;
      const supervisorName = body.supervisorName ? String(body.supervisorName).trim().slice(0, 255) : null;
      const projectRef = body.projectRef ? String(body.projectRef).trim().slice(0, 64) : null;
      const purpose = body.purpose ? String(body.purpose).trim().slice(0, 255) : null;
      const category = body.category ? String(body.category).trim().slice(0, 64) : null;
      const splitsRaw = body.splits || body.splitsJson || body.splits_json || null;
      let splits = [];
      if (Array.isArray(splitsRaw)) {
        splits = splitsRaw;
      } else if (typeof splitsRaw === 'string' && splitsRaw.trim()) {
        try { splits = JSON.parse(splitsRaw); } catch { splits = []; }
      }
      splits = Array.isArray(splits) ? splits : [];
      const normalizedSplits = splits
        .map((s) => ({
          category: String(s?.category || '').trim().slice(0, 64),
          amount: Number(s?.amount)
        }))
        .filter((s) => s.category && Number.isFinite(s.amount) && s.amount > 0);
      const notes = body.notes ? String(body.notes) : '';
      const attestation = body.attestation ? 1 : 0;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
        return res.status(400).json({ error: { message: 'expenseDate (YYYY-MM-DD) is required' } });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: { message: 'amount must be a positive number' } });
      }
      if (!supervisorName) {
        return res.status(400).json({ error: { message: 'supervisorName is required' } });
      }
      if (!String(purpose || '').trim()) {
        return res.status(400).json({ error: { message: 'purpose is required' } });
      }
      if (!String(notes || '').trim()) {
        return res.status(400).json({ error: { message: 'notes is required' } });
      }
      if (!attestation) {
        return res.status(400).json({ error: { message: 'attestation is required' } });
      }
      if (!req.file) {
        return res.status(400).json({ error: { message: 'receipt file is required' } });
      }

      // Validate split categories if provided (sum must match amount).
      let splitsJson = null;
      let resolvedCategory = category;
      if (normalizedSplits.length) {
        const sum = Math.round(normalizedSplits.reduce((a, s) => a + Number(s.amount || 0), 0) * 100) / 100;
        const amt = Math.round(Number(amount || 0) * 100) / 100;
        if (Math.abs(sum - amt) > 0.009) {
          return res.status(400).json({ error: { message: `Category splits must add up to ${amt.toFixed(2)}.` } });
        }
        splitsJson = JSON.stringify(normalizedSplits);
        if (normalizedSplits.length === 1) {
          resolvedCategory = normalizedSplits[0].category;
        }
      }

      // Enforce submission deadlines (and choose suggested period accordingly).
      const win = await computeSubmissionWindow({
        agencyId,
        effectiveDateYmd: expenseDate,
        submittedAt: new Date(),
        timeZone: resolveClaimTimeZone(),
        hardStopPolicy: '60_days'
      });
      if (!win.ok) {
        return res.status(win.status || 409).json({ error: { message: win.errorMessage || CLAIM_DEADLINE_ERROR_MESSAGE } });
      }
      const suggestedPayrollPeriodId = win.suggestedPayrollPeriodId;

      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const original = req.file.originalname || 'receipt';
      const ext = (original.includes('.') ? `.${original.split('.').pop()}` : '');
      const filename = `company-card-expense-${agencyId}-${userId}-${uniqueSuffix}${ext}`;
      const storageResult = await StorageService.saveCompanyCardExpenseReceipt(req.file.buffer, filename, req.file.mimetype);

      const claim = await PayrollCompanyCardExpense.create({
        agencyId,
        userId,
        status: 'submitted',
        expenseDate,
        amount,
        vendor,
        paymentMethod,
        supervisorName,
        projectRef,
        category: resolvedCategory,
        splitsJson,
        purpose,
        notes: String(notes || ''),
        attestation,
        receiptFilePath: storageResult.relativePath,
        receiptOriginalName: String(original).slice(0, 255),
        receiptMimeType: String(req.file.mimetype || '').slice(0, 128) || null,
        receiptSizeBytes: Number(req.file.size || 0) || null,
        suggestedPayrollPeriodId
      });

      res.status(201).json(claim);
    } catch (e) {
      next(e);
    }
  }
];

export const createUserCompanyCardExpense = [
  receiptUpload.single('receipt'),
  async (req, res, next) => {
    try {
      const targetUserId = req.params.userId ? parseInt(req.params.userId, 10) : null;
      const body = req.body || {};
      const agencyId = body.agencyId ? parseInt(body.agencyId, 10) : null;
      if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
      if (!(await requirePayrollAccess(req, res, agencyId))) return;
      if (!(await requireTargetUserInAgency({ res, agencyId, targetUserId }))) return;

      const user = await User.findById(targetUserId);
      if (!user) return res.status(404).json({ error: { message: 'User not found' } });

      const expenseDate = String(body.expenseDate || '').slice(0, 10);
      const amount = body.amount === null || body.amount === undefined || body.amount === '' ? null : Number(body.amount);
      const paymentMethodRaw = String(body.paymentMethod || body.payment_method || 'company_card').trim().toLowerCase();
      const paymentMethod = paymentMethodRaw ? paymentMethodRaw.slice(0, 32) : 'company_card';
      const vendor = body.vendor ? String(body.vendor).slice(0, 255) : null;
      const supervisorName = body.supervisorName ? String(body.supervisorName).trim().slice(0, 255) : null;
      const projectRef = body.projectRef ? String(body.projectRef).trim().slice(0, 64) : null;
      const purpose = body.purpose ? String(body.purpose).trim().slice(0, 255) : null;
      const category = body.category ? String(body.category).trim().slice(0, 64) : null;
      const splitsRaw = body.splits || body.splitsJson || body.splits_json || null;
      let splits = [];
      if (Array.isArray(splitsRaw)) {
        splits = splitsRaw;
      } else if (typeof splitsRaw === 'string' && splitsRaw.trim()) {
        try { splits = JSON.parse(splitsRaw); } catch { splits = []; }
      }
      splits = Array.isArray(splits) ? splits : [];
      const normalizedSplits = splits
        .map((s) => ({
          category: String(s?.category || '').trim().slice(0, 64),
          amount: Number(s?.amount)
        }))
        .filter((s) => s.category && Number.isFinite(s.amount) && s.amount > 0);
      const notes = body.notes ? String(body.notes) : '';
      const attestation = body.attestation ? 1 : 0;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
        return res.status(400).json({ error: { message: 'expenseDate (YYYY-MM-DD) is required' } });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: { message: 'amount must be a positive number' } });
      }
      if (!supervisorName) {
        return res.status(400).json({ error: { message: 'supervisorName is required' } });
      }
      if (!String(purpose || '').trim()) {
        return res.status(400).json({ error: { message: 'purpose is required' } });
      }
      if (!String(notes || '').trim()) {
        return res.status(400).json({ error: { message: 'notes is required' } });
      }
      if (!attestation) {
        return res.status(400).json({ error: { message: 'attestation is required' } });
      }
      if (!req.file) {
        return res.status(400).json({ error: { message: 'receipt file is required' } });
      }

      // Validate split categories if provided (sum must match amount).
      let splitsJson = null;
      let resolvedCategory = category;
      if (normalizedSplits.length) {
        const sum = Math.round(normalizedSplits.reduce((a, s) => a + Number(s.amount || 0), 0) * 100) / 100;
        const amt = Math.round(Number(amount || 0) * 100) / 100;
        if (Math.abs(sum - amt) > 0.009) {
          return res.status(400).json({ error: { message: `Category splits must add up to ${amt.toFixed(2)}.` } });
        }
        splitsJson = JSON.stringify(normalizedSplits);
        if (normalizedSplits.length === 1) {
          resolvedCategory = normalizedSplits[0].category;
        }
      }

      // Enforce submission deadlines (and choose suggested period accordingly).
      const win = await computeSubmissionWindow({
        agencyId,
        effectiveDateYmd: expenseDate,
        submittedAt: new Date(),
        timeZone: resolveClaimTimeZone(),
        hardStopPolicy: '60_days'
      });
      if (!win.ok) {
        return res.status(win.status || 409).json({ error: { message: win.errorMessage || CLAIM_DEADLINE_ERROR_MESSAGE } });
      }
      const suggestedPayrollPeriodId = win.suggestedPayrollPeriodId;

      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const original = req.file.originalname || 'receipt';
      const ext = (original.includes('.') ? `.${original.split('.').pop()}` : '');
      const filename = `company-card-expense-${agencyId}-${targetUserId}-${uniqueSuffix}${ext}`;
      const storageResult = await StorageService.saveCompanyCardExpenseReceipt(req.file.buffer, filename, req.file.mimetype);

      const claim = await PayrollCompanyCardExpense.create({
        agencyId,
        userId: targetUserId,
        status: 'submitted',
        expenseDate,
        amount,
        vendor,
        paymentMethod,
        supervisorName,
        projectRef,
        category: resolvedCategory,
        splitsJson,
        purpose,
        notes: String(notes || ''),
        attestation,
        receiptFilePath: storageResult.relativePath,
        receiptOriginalName: String(original).slice(0, 255),
        receiptMimeType: String(req.file.mimetype || '').slice(0, 128) || null,
        receiptSizeBytes: Number(req.file.size || 0) || null,
        suggestedPayrollPeriodId
      });

      res.status(201).json(claim);
    } catch (e) {
      next(e);
    }
  }
];

export const listMyCompanyCardExpenses = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const rows = await PayrollCompanyCardExpense.listForUser({ agencyId, userId, limit: 200, offset: 0 });
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const deleteMyCompanyCardExpense = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const claim = await PayrollCompanyCardExpense.findById(id);
    if (!claim) return res.status(404).json({ error: { message: 'Company card expense not found' } });
    if (Number(claim.user_id) !== Number(userId)) return res.status(403).json({ error: { message: 'Access denied' } });

    if (String(claim.status || '').toLowerCase() !== 'deferred') {
      return res.status(409).json({ error: { message: 'Only returned claims can be deleted' } });
    }

    await pool.execute('DELETE FROM payroll_company_card_expenses WHERE id = ? LIMIT 1', [id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listCompanyCardExpenses = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const status = req.query.status ? String(req.query.status) : null;
    const suggestedPayrollPeriodId = req.query.suggestedPeriodId ? parseInt(req.query.suggestedPeriodId, 10) : null;
    const targetPayrollPeriodId = req.query.targetPeriodId ? parseInt(req.query.targetPeriodId, 10) : null;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;

    const rows = await PayrollCompanyCardExpense.listForAgency({
      agencyId,
      status,
      suggestedPayrollPeriodId,
      targetPayrollPeriodId,
      userId
    });
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const patchCompanyCardExpense = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const claim = await PayrollCompanyCardExpense.findById(id);
    if (!claim) return res.status(404).json({ error: { message: 'Company card expense not found' } });
    if (!(await requirePayrollAccess(req, res, claim.agency_id))) return;

    const body = req.body || {};
    const action = String(body.action || '').toLowerCase();
    if (!action) return res.status(400).json({ error: { message: 'action is required' } });

    if (action === 'approve') {
      const targetPayrollPeriodId = Number(body.targetPayrollPeriodId || 0);
      if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) {
        return res.status(400).json({ error: { message: 'targetPayrollPeriodId is required' } });
      }

      const ok = await enforceTargetPeriodDeadline({
        req,
        res,
        agencyId: claim.agency_id,
        effectiveDateYmd: claim.expense_date,
        submittedAt: claim.created_at,
        targetPayrollPeriodId
      });
      if (!ok.ok) return;

      const updated = await PayrollCompanyCardExpense.approve({
        id,
        approverUserId: req.user.id,
        targetPayrollPeriodId,
        appliedAmount: 0
      });
      return res.json({ claim: updated });
    }

    if (action === 'reject') {
      const rejectionReason = body.rejectionReason ? String(body.rejectionReason).trim().slice(0, 255) : '';
      if (!rejectionReason) return res.status(400).json({ error: { message: 'rejectionReason is required' } });
      const updated = await PayrollCompanyCardExpense.reject({ id, rejectorUserId: req.user.id, rejectionReason });
      return res.json({ claim: updated });
    }

    if (action === 'return') {
      const note = body.note ? String(body.note).trim().slice(0, 255) : '';
      if (!note) return res.status(400).json({ error: { message: 'note is required' } });
      const updated = await PayrollCompanyCardExpense.returnForChanges({ id, actorUserId: req.user.id, note });
      return res.json({ claim: updated });
    }

    if (action === 'unapprove') {
      const updated = await PayrollCompanyCardExpense.unapprove({ id });
      return res.json({ claim: updated });
    }

    if (action === 'move') {
      const targetPayrollPeriodId = Number(body.targetPayrollPeriodId || 0);
      if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) {
        return res.status(400).json({ error: { message: 'targetPayrollPeriodId is required' } });
      }

      const ok = await enforceTargetPeriodDeadline({
        req,
        res,
        agencyId: claim.agency_id,
        effectiveDateYmd: claim.expense_date,
        submittedAt: claim.created_at,
        targetPayrollPeriodId
      });
      if (!ok.ok) return;

      const updated = await PayrollCompanyCardExpense.moveTargetPeriod({ id, targetPayrollPeriodId });
      return res.json({ claim: updated });
    }

    return res.status(400).json({ error: { message: 'Unknown action' } });
  } catch (e) {
    next(e);
  }
};

export const listReimbursementClaims = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const status = req.query.status ? String(req.query.status) : null;
    const suggestedPayrollPeriodId = req.query.suggestedPeriodId ? parseInt(req.query.suggestedPeriodId, 10) : null;
    const targetPayrollPeriodId = req.query.targetPeriodId ? parseInt(req.query.targetPeriodId, 10) : null;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;

    const rows = await PayrollReimbursementClaim.listForAgency({
      agencyId,
      status,
      suggestedPayrollPeriodId,
      targetPayrollPeriodId,
      userId
    });
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const patchReimbursementClaim = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const claim = await PayrollReimbursementClaim.findById(id);
    if (!claim) return res.status(404).json({ error: { message: 'Reimbursement claim not found' } });
    if (!(await requirePayrollAccess(req, res, claim.agency_id))) return;

    const body = req.body || {};
    const action = String(body.action || '').toLowerCase();
    if (!action) return res.status(400).json({ error: { message: 'action is required' } });

    if (action === 'approve') {
      const targetPayrollPeriodId = Number(body.targetPayrollPeriodId || 0);
      if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) {
        return res.status(400).json({ error: { message: 'targetPayrollPeriodId is required' } });
      }

      const ok = await enforceTargetPeriodDeadline({
        req,
        res,
        agencyId: claim.agency_id,
        effectiveDateYmd: claim.expense_date,
        submittedAt: claim.created_at,
        targetPayrollPeriodId
      });
      if (!ok.ok) return;

      const appliedAmount = Math.round((Number(claim.amount || 0)) * 100) / 100;
      if (!(appliedAmount > 0)) {
        return res.status(409).json({ error: { message: 'Claim amount must be > 0' } });
      }

      const updated = await PayrollReimbursementClaim.approve({
        id,
        approverUserId: req.user.id,
        targetPayrollPeriodId,
        appliedAmount
      });

      // If payroll has already been run for the target period, recompute immediately so totals reflect the approval.
      try {
        const period = await PayrollPeriod.findById(targetPayrollPeriodId);
        const st = String(period?.status || '').toLowerCase();
        if (period && st === 'ran') {
          await recomputeSummariesFromStaging({
            payrollPeriodId: targetPayrollPeriodId,
            agencyId: period.agency_id,
            periodStart: period.period_start,
            periodEnd: period.period_end
          });
        }
      } catch { /* best-effort */ }

      return res.json({ claim: updated });
    }

    if (action === 'reject') {
      const rejectionReason = body.rejectionReason ? String(body.rejectionReason).trim().slice(0, 255) : '';
      if (!rejectionReason) return res.status(400).json({ error: { message: 'rejectionReason is required' } });
      const updated = await PayrollReimbursementClaim.reject({ id, rejectorUserId: req.user.id, rejectionReason });
      return res.json({ claim: updated });
    }

    if (action === 'return') {
      const st = String(claim.status || '').toLowerCase();
      if (st === 'approved') {
        return res.status(409).json({ error: { message: 'Unapprove the claim first to return it for changes.' } });
      }
      const note = body.note ? String(body.note).trim().slice(0, 255) : '';
      if (!note) return res.status(400).json({ error: { message: 'note is required' } });
      const updated = await PayrollReimbursementClaim.returnForChanges({ id, actorUserId: req.user.id, note });

      // If it was previously approved into a ran period, recompute so totals drop immediately.
      try {
        const targetPayrollPeriodId = claim.target_payroll_period_id;
        if (targetPayrollPeriodId) {
          const period = await PayrollPeriod.findById(targetPayrollPeriodId);
          const st = String(period?.status || '').toLowerCase();
          if (period && st === 'ran') {
            await recomputeSummariesFromStaging({
              payrollPeriodId: targetPayrollPeriodId,
              agencyId: period.agency_id,
              periodStart: period.period_start,
              periodEnd: period.period_end
            });
          }
        }
      } catch { /* best-effort */ }

      return res.json({ claim: updated });
    }

    if (action === 'unapprove') {
      const st = String(claim.status || '').toLowerCase();
      if (st !== 'approved') return res.status(409).json({ error: { message: 'Only approved claims can be unapproved' } });
      const targetPayrollPeriodId = Number(claim.target_payroll_period_id || 0);
      if (targetPayrollPeriodId) {
        const period = await PayrollPeriod.findById(targetPayrollPeriodId);
        const pst = String(period?.status || '').toLowerCase();
        if (pst === 'posted' || pst === 'finalized') {
          return res.status(409).json({ error: { message: 'Cannot unapprove a claim that is in a posted/finalized pay period' } });
        }
      }
      const updated = await PayrollReimbursementClaim.unapprove({ id });
      try {
        if (targetPayrollPeriodId) {
          const period = await PayrollPeriod.findById(targetPayrollPeriodId);
          const pst = String(period?.status || '').toLowerCase();
          if (period && pst === 'ran') {
            await recomputeSummariesFromStaging({
              payrollPeriodId: targetPayrollPeriodId,
              agencyId: period.agency_id,
              periodStart: period.period_start,
              periodEnd: period.period_end
            });
          }
        }
      } catch { /* best-effort */ }
      return res.json({ claim: updated });
    }

    if (action === 'move') {
      const st = String(claim.status || '').toLowerCase();
      if (st !== 'approved') return res.status(409).json({ error: { message: 'Only approved claims can be moved' } });
      const targetPayrollPeriodId = Number(body.targetPayrollPeriodId || 0);
      if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) {
        return res.status(400).json({ error: { message: 'targetPayrollPeriodId is required' } });
      }
      const fromPeriodId = Number(claim.target_payroll_period_id || 0);
      if (fromPeriodId === targetPayrollPeriodId) return res.json({ claim });

      const toPeriod = await PayrollPeriod.findById(targetPayrollPeriodId);
      if (!toPeriod) return res.status(404).json({ error: { message: 'Target pay period not found' } });
      if (Number(toPeriod.agency_id) !== Number(claim.agency_id)) {
        return res.status(400).json({ error: { message: 'Target pay period does not belong to this agency' } });
      }

      const ok = await enforceTargetPeriodDeadline({
        req,
        res,
        agencyId: claim.agency_id,
        effectiveDateYmd: claim.expense_date,
        submittedAt: claim.created_at,
        targetPayrollPeriodId,
        targetPeriodRow: toPeriod
      });
      if (!ok.ok) return;

      const toStatus = String(toPeriod.status || '').toLowerCase();
      if (toStatus === 'posted' || toStatus === 'finalized') {
        return res.status(409).json({ error: { message: 'Target pay period is posted/finalized' } });
      }
      if (fromPeriodId) {
        const fromPeriod = await PayrollPeriod.findById(fromPeriodId);
        const fromStatus = String(fromPeriod?.status || '').toLowerCase();
        if (fromStatus === 'posted' || fromStatus === 'finalized') {
          return res.status(409).json({ error: { message: 'Cannot move a claim out of a posted/finalized pay period' } });
        }
      }

      const updated = await PayrollReimbursementClaim.moveTargetPeriod({ id, targetPayrollPeriodId });
      try {
        if (fromPeriodId) {
          const fromPeriod = await PayrollPeriod.findById(fromPeriodId);
          const fromStatus = String(fromPeriod?.status || '').toLowerCase();
          if (fromPeriod && fromStatus === 'ran') {
            await recomputeSummariesFromStaging({
              payrollPeriodId: fromPeriodId,
              agencyId: fromPeriod.agency_id,
              periodStart: fromPeriod.period_start,
              periodEnd: fromPeriod.period_end
            });
          }
        }
      } catch { /* best-effort */ }
      try {
        const toStatus2 = String(toPeriod?.status || '').toLowerCase();
        if (toPeriod && toStatus2 === 'ran') {
          await recomputeSummariesFromStaging({
            payrollPeriodId: targetPayrollPeriodId,
            agencyId: toPeriod.agency_id,
            periodStart: toPeriod.period_start,
            periodEnd: toPeriod.period_end
          });
        }
      } catch { /* best-effort */ }

      return res.json({ claim: updated });
    }

    return res.status(400).json({ error: { message: 'Unsupported action' } });
  } catch (e) {
    next(e);
  }
};

function timeClaimAllowedType(t) {
  const k = String(t || '').trim().toLowerCase();
  return ['meeting_training', 'excess_holiday', 'service_correction', 'overtime_evaluation'].includes(k) ? k : null;
}

function toMinutes(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export const createMyTimeClaim = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const body = req.body || {};
    const agencyId = body.agencyId ? parseInt(body.agencyId, 10) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const claimType = timeClaimAllowedType(body.claimType);
    const claimDate = String(body.claimDate || '').slice(0, 10);
    const payload = body.payload || {};
    const attestation = payload?.attestation === true || payload?.attestation === 1 || payload?.attestation === '1';

    if (!claimType) return res.status(400).json({ error: { message: 'claimType is invalid' } });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(claimDate)) {
      return res.status(400).json({ error: { message: 'claimDate (YYYY-MM-DD) is required' } });
    }
    if (!attestation) return res.status(400).json({ error: { message: 'attestation is required' } });

    // Light validation per type (keep payload flexible for iteration).
    if (claimType === 'meeting_training') {
      const totalMinutes = toMinutes(payload?.totalMinutes);
      if (!(totalMinutes >= 1)) return res.status(400).json({ error: { message: 'totalMinutes is required' } });
      if (!String(payload?.meetingType || '').trim()) return res.status(400).json({ error: { message: 'meetingType is required' } });
      if (!String(payload?.platform || '').trim()) return res.status(400).json({ error: { message: 'platform is required' } });
      if (!String(payload?.summary || '').trim()) return res.status(400).json({ error: { message: 'summary is required' } });
    } else if (claimType === 'excess_holiday') {
      const directMinutes = toMinutes(payload?.directMinutes);
      const indirectMinutes = toMinutes(payload?.indirectMinutes);
      if (!((directMinutes ?? 0) + (indirectMinutes ?? 0) >= 1)) {
        return res.status(400).json({ error: { message: 'directMinutes or indirectMinutes is required' } });
      }
      if (!String(payload?.reason || '').trim()) return res.status(400).json({ error: { message: 'reason is required' } });
    } else if (claimType === 'service_correction') {
      if (!String(payload?.clientInitials || '').trim()) return res.status(400).json({ error: { message: 'clientInitials is required' } });
      if (!String(payload?.originalService || '').trim()) return res.status(400).json({ error: { message: 'originalService is required' } });
      if (!String(payload?.correctedService || '').trim()) return res.status(400).json({ error: { message: 'correctedService is required' } });
      if (!String(payload?.duration || '').trim()) return res.status(400).json({ error: { message: 'duration is required' } });
      if (!String(payload?.reason || '').trim()) return res.status(400).json({ error: { message: 'reason is required' } });
    } else if (claimType === 'overtime_evaluation') {
      if (payload?.workedOver12Hours === undefined) return res.status(400).json({ error: { message: 'workedOver12Hours is required' } });
      if (!String(payload?.datesAndHours || '').trim()) return res.status(400).json({ error: { message: 'datesAndHours is required' } });
      const est = Number(payload?.estimatedWorkweekHours);
      if (!Number.isFinite(est) || est < 0) return res.status(400).json({ error: { message: 'estimatedWorkweekHours must be a number' } });
      if (payload?.allDirectServiceRecorded === undefined) return res.status(400).json({ error: { message: 'allDirectServiceRecorded is required' } });
      if (payload?.overtimeApproved === undefined) return res.status(400).json({ error: { message: 'overtimeApproved is required' } });
      if (!String(payload?.approvedBy || '').trim()) return res.status(400).json({ error: { message: 'approvedBy is required' } });
      if (!String(payload?.notesForPayroll || '').trim()) return res.status(400).json({ error: { message: 'notesForPayroll is required' } });
    }

    // Enforce submission deadlines (and choose suggested period accordingly).
    const win = await computeSubmissionWindow({
      agencyId,
      effectiveDateYmd: claimDate,
      submittedAt: new Date(),
      timeZone: resolveClaimTimeZone(),
      hardStopPolicy: '60_days'
    });
    if (!win.ok) {
      return res.status(win.status || 409).json({ error: { message: win.errorMessage || CLAIM_DEADLINE_ERROR_MESSAGE } });
    }
    const suggestedPayrollPeriodId = win.suggestedPayrollPeriodId;

    const claim = await PayrollTimeClaim.create({
      agencyId,
      userId,
      status: 'submitted',
      claimType,
      claimDate,
      payload,
      suggestedPayrollPeriodId
    });

    res.status(201).json(claim);
  } catch (e) {
    next(e);
  }
};

export const createUserTimeClaim = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId ? parseInt(req.params.userId, 10) : null;
    const body = req.body || {};
    const agencyId = body.agencyId ? parseInt(body.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    if (!(await requireTargetUserInAgency({ res, agencyId, targetUserId }))) return;

    const prev = req.user;
    req.user = { ...(prev || {}), id: targetUserId, role: 'provider' };
    try {
      return await createMyTimeClaim(req, res, next);
    } finally {
      req.user = prev;
    }
  } catch (e) {
    next(e);
  }
};

export const listMyTimeClaims = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const rows = await PayrollTimeClaim.listForUser({ agencyId, userId, limit: 200, offset: 0 });
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const deleteMyTimeClaim = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const claim = await PayrollTimeClaim.findById(id);
    if (!claim) return res.status(404).json({ error: { message: 'Time claim not found' } });
    if (Number(claim.user_id) !== Number(userId)) return res.status(403).json({ error: { message: 'Access denied' } });

    if (String(claim.status || '').toLowerCase() !== 'deferred') {
      return res.status(409).json({ error: { message: 'Only returned claims can be deleted' } });
    }

    await pool.execute('DELETE FROM payroll_time_claims WHERE id = ? LIMIT 1', [id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listTimeClaims = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const status = req.query.status ? String(req.query.status) : null;
    const suggestedPayrollPeriodId = req.query.suggestedPeriodId ? parseInt(req.query.suggestedPeriodId, 10) : null;
    const targetPayrollPeriodId = req.query.targetPeriodId ? parseInt(req.query.targetPeriodId, 10) : null;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;

    const rows = await PayrollTimeClaim.listForAgency({
      agencyId,
      status,
      suggestedPayrollPeriodId,
      targetPayrollPeriodId,
      userId
    });
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

function computeDefaultAppliedAmountForTimeClaim({ claim, rateCard }) {
  const type = String(claim?.claim_type || '').toLowerCase();
  const payload = claim?.payload || {};
  const directRate = Number(rateCard?.direct_rate || 0);
  const indirectRate = Number(rateCard?.indirect_rate || 0);

  if (type === 'meeting_training') {
    const mins = Number(payload?.totalMinutes || 0);
    if (Number.isFinite(mins) && mins > 0 && indirectRate > 0) {
      return Math.round(((mins / 60) * indirectRate) * 100) / 100;
    }
  }
  if (type === 'excess_holiday') {
    const d = Number(payload?.directMinutes || 0);
    const i = Number(payload?.indirectMinutes || 0);
    const amt = (Number.isFinite(d) ? (d / 60) * directRate : 0) + (Number.isFinite(i) ? (i / 60) * indirectRate : 0);
    if (amt > 0) return Math.round(amt * 100) / 100;
  }
  return null;
}

export const patchTimeClaim = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const claim = await PayrollTimeClaim.findById(id);
    if (!claim) return res.status(404).json({ error: { message: 'Time claim not found' } });
    if (!(await requirePayrollAccess(req, res, claim.agency_id))) return;

    const body = req.body || {};
    const action = String(body.action || '').toLowerCase();
    if (!action) return res.status(400).json({ error: { message: 'action is required' } });

    if (action === 'approve') {
      const targetPayrollPeriodId = Number(body.targetPayrollPeriodId || 0);
      if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) {
        return res.status(400).json({ error: { message: 'targetPayrollPeriodId is required' } });
      }

      const ok = await enforceTargetPeriodDeadline({
        req,
        res,
        agencyId: claim.agency_id,
        effectiveDateYmd: claim.claim_date,
        submittedAt: claim.created_at,
        targetPayrollPeriodId,
        hardStopPolicy: 'in_school'
      });
      if (!ok.ok) return;

      // Applied amount is dollar-based; do NOT compute from rate cards.
      // Prefer explicit admin override, otherwise use payload amount if provided.
      const override = body.appliedAmount === null || body.appliedAmount === undefined || body.appliedAmount === '' ? null : Number(body.appliedAmount);
      const payloadAmountRaw =
        claim?.payload?.amount === null || claim?.payload?.amount === undefined || claim?.payload?.amount === ''
          ? null
          : Number(claim?.payload?.amount);
      const appliedAmount = Number.isFinite(override)
        ? override
        : (Number.isFinite(payloadAmountRaw) ? payloadAmountRaw : 0);
      if (!Number.isFinite(appliedAmount) || appliedAmount < 0) {
        return res.status(400).json({ error: { message: 'appliedAmount must be a non-negative number' } });
      }

      const bucketRaw = String(body.bucket || body.category || 'indirect').trim().toLowerCase();
      const bucket = bucketRaw === 'direct' ? 'direct' : 'indirect';
      const creditsHoursRaw =
        body.creditsHours === null || body.creditsHours === undefined || body.creditsHours === ''
          ? (body.credits_hours === null || body.credits_hours === undefined || body.credits_hours === '' ? null : Number(body.credits_hours))
          : Number(body.creditsHours);
      if (creditsHoursRaw !== null && (!Number.isFinite(creditsHoursRaw) || creditsHoursRaw < 0)) {
        return res.status(400).json({ error: { message: 'creditsHours must be a non-negative number (or blank)' } });
      }

      const updated = await PayrollTimeClaim.approve({
        id,
        approverUserId: req.user.id,
        targetPayrollPeriodId,
        appliedAmount,
        bucket,
        creditsHours: creditsHoursRaw
      });

      try {
        const period = await PayrollPeriod.findById(targetPayrollPeriodId);
        const st = String(period?.status || '').toLowerCase();
        if (period && st === 'ran') {
          await recomputeSummariesFromStaging({
            payrollPeriodId: targetPayrollPeriodId,
            agencyId: period.agency_id,
            periodStart: period.period_start,
            periodEnd: period.period_end
          });
        }
      } catch { /* best-effort */ }

      return res.json({ claim: updated });
    }

    if (action === 'reject') {
      const rejectionReason = body.rejectionReason ? String(body.rejectionReason).trim().slice(0, 255) : '';
      if (!rejectionReason) return res.status(400).json({ error: { message: 'rejectionReason is required' } });
      const updated = await PayrollTimeClaim.reject({ id, rejectorUserId: req.user.id, rejectionReason });
      return res.json({ claim: updated });
    }

    if (action === 'return') {
      const st = String(claim.status || '').toLowerCase();
      if (st === 'approved') {
        return res.status(409).json({ error: { message: 'Unapprove the claim first to return it for changes.' } });
      }
      const note = body.note ? String(body.note).trim().slice(0, 255) : '';
      if (!note) return res.status(400).json({ error: { message: 'note is required' } });
      const updated = await PayrollTimeClaim.returnForChanges({ id, actorUserId: req.user.id, note });
      try {
        const targetPayrollPeriodId = claim.target_payroll_period_id;
        if (targetPayrollPeriodId) {
          const period = await PayrollPeriod.findById(targetPayrollPeriodId);
          const st = String(period?.status || '').toLowerCase();
          if (period && st === 'ran') {
            await recomputeSummariesFromStaging({
              payrollPeriodId: targetPayrollPeriodId,
              agencyId: period.agency_id,
              periodStart: period.period_start,
              periodEnd: period.period_end
            });
          }
        }
      } catch { /* best-effort */ }
      return res.json({ claim: updated });
    }

    if (action === 'unapprove') {
      const st = String(claim.status || '').toLowerCase();
      if (st !== 'approved') return res.status(409).json({ error: { message: 'Only approved claims can be unapproved' } });
      const targetPayrollPeriodId = Number(claim.target_payroll_period_id || 0);
      if (targetPayrollPeriodId) {
        const period = await PayrollPeriod.findById(targetPayrollPeriodId);
        const pst = String(period?.status || '').toLowerCase();
        if (pst === 'posted' || pst === 'finalized') {
          return res.status(409).json({ error: { message: 'Cannot unapprove a claim that is in a posted/finalized pay period' } });
        }
      }
      const updated = await PayrollTimeClaim.unapprove({ id });
      try {
        if (targetPayrollPeriodId) {
          const period = await PayrollPeriod.findById(targetPayrollPeriodId);
          const pst = String(period?.status || '').toLowerCase();
          if (period && pst === 'ran') {
            await recomputeSummariesFromStaging({
              payrollPeriodId: targetPayrollPeriodId,
              agencyId: period.agency_id,
              periodStart: period.period_start,
              periodEnd: period.period_end
            });
          }
        }
      } catch { /* best-effort */ }
      return res.json({ claim: updated });
    }

    if (action === 'move') {
      const st = String(claim.status || '').toLowerCase();
      if (st !== 'approved') return res.status(409).json({ error: { message: 'Only approved claims can be moved' } });
      const targetPayrollPeriodId = Number(body.targetPayrollPeriodId || 0);
      if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) {
        return res.status(400).json({ error: { message: 'targetPayrollPeriodId is required' } });
      }
      const fromPeriodId = Number(claim.target_payroll_period_id || 0);
      if (fromPeriodId === targetPayrollPeriodId) return res.json({ claim });

      const toPeriod = await PayrollPeriod.findById(targetPayrollPeriodId);
      if (!toPeriod) return res.status(404).json({ error: { message: 'Target pay period not found' } });
      if (Number(toPeriod.agency_id) !== Number(claim.agency_id)) {
        return res.status(400).json({ error: { message: 'Target pay period does not belong to this agency' } });
      }

      const ok = await enforceTargetPeriodDeadline({
        req,
        res,
        agencyId: claim.agency_id,
        effectiveDateYmd: claim.claim_date,
        submittedAt: claim.created_at,
        targetPayrollPeriodId,
        targetPeriodRow: toPeriod
      });
      if (!ok.ok) return;

      const toStatus = String(toPeriod.status || '').toLowerCase();
      if (toStatus === 'posted' || toStatus === 'finalized') {
        return res.status(409).json({ error: { message: 'Target pay period is posted/finalized' } });
      }
      if (fromPeriodId) {
        const fromPeriod = await PayrollPeriod.findById(fromPeriodId);
        const fromStatus = String(fromPeriod?.status || '').toLowerCase();
        if (fromStatus === 'posted' || fromStatus === 'finalized') {
          return res.status(409).json({ error: { message: 'Cannot move a claim out of a posted/finalized pay period' } });
        }
      }

      const updated = await PayrollTimeClaim.moveTargetPeriod({ id, targetPayrollPeriodId });
      try {
        if (fromPeriodId) {
          const fromPeriod = await PayrollPeriod.findById(fromPeriodId);
          const fromStatus = String(fromPeriod?.status || '').toLowerCase();
          if (fromPeriod && fromStatus === 'ran') {
            await recomputeSummariesFromStaging({
              payrollPeriodId: fromPeriodId,
              agencyId: fromPeriod.agency_id,
              periodStart: fromPeriod.period_start,
              periodEnd: fromPeriod.period_end
            });
          }
        }
      } catch { /* best-effort */ }
      try {
        const toStatus2 = String(toPeriod?.status || '').toLowerCase();
        if (toPeriod && toStatus2 === 'ran') {
          await recomputeSummariesFromStaging({
            payrollPeriodId: targetPayrollPeriodId,
            agencyId: toPeriod.agency_id,
            periodStart: toPeriod.period_start,
            periodEnd: toPeriod.period_end
          });
        }
      } catch { /* best-effort */ }

      return res.json({ claim: updated });
    }

    return res.status(400).json({ error: { message: 'Unsupported action' } });
  } catch (e) {
    next(e);
  }
};

export const listMyMedcancelClaims = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const status = req.query.status ? String(req.query.status) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const inSchoolEnabled = await isAgencyFeatureEnabled(agencyId, 'inSchoolSubmissionsEnabled', true);
    const medcancelEnabledForAgency = inSchoolEnabled && (await isAgencyFeatureEnabled(agencyId, 'medcancelEnabled', true));
    if (!medcancelEnabledForAgency) {
      return res.json([]);
    }

    const rows = await PayrollMedcancelClaim.listForUser({ agencyId, userId, status });
    const withItems = await Promise.all(
      (rows || []).map(async (c) => {
        try {
          const items = await PayrollMedcancelClaimItem.listForClaim(c.id);
          return { ...c, items };
        } catch {
          return { ...c, items: [] };
        }
      })
    );
    res.json(withItems);
  } catch (e) {
    next(e);
  }
};

export const deleteMyMedcancelClaim = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const claim = await PayrollMedcancelClaim.findById(id);
    if (!claim) return res.status(404).json({ error: { message: 'Med Cancel claim not found' } });
    if (Number(claim.user_id) !== Number(userId)) return res.status(403).json({ error: { message: 'Access denied' } });

    // Only allow deleting claims that were sent back (needs changes).
    if (String(claim.status || '').toLowerCase() !== 'deferred') {
      return res.status(409).json({ error: { message: 'Only returned claims can be deleted' } });
    }

    // Claim items table has ON DELETE CASCADE via FK, so deleting parent is enough.
    await pool.execute('DELETE FROM payroll_medcancel_claims WHERE id = ? LIMIT 1', [id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listMedcancelClaims = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const status = req.query.status ? String(req.query.status) : null;
    const suggestedPayrollPeriodId = req.query.suggestedPeriodId ? parseInt(req.query.suggestedPeriodId, 10) : null;
    const targetPayrollPeriodId = req.query.targetPeriodId ? parseInt(req.query.targetPeriodId, 10) : null;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;

    const rows = await PayrollMedcancelClaim.listForAgency({
      agencyId,
      status,
      suggestedPayrollPeriodId,
      targetPayrollPeriodId,
      userId
    });
    const withItems = await Promise.all(
      (rows || []).map(async (c) => {
        try {
          const items = await PayrollMedcancelClaimItem.listForClaim(c.id);
          return { ...c, items };
        } catch {
          return { ...c, items: [] };
        }
      })
    );
    res.json(withItems);
  } catch (e) {
    next(e);
  }
};

export const patchMedcancelClaim = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const claim = await PayrollMedcancelClaim.findById(id);
    if (!claim) return res.status(404).json({ error: { message: 'MedCancel claim not found' } });
    if (!(await requirePayrollAccess(req, res, claim.agency_id))) return;

    const body = req.body || {};
    const action = String(body.action || '').toLowerCase();
    if (!action) return res.status(400).json({ error: { message: 'action is required' } });

    if (action === 'approve') {
      const targetPayrollPeriodId = Number(body.targetPayrollPeriodId || 0);
      if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) {
        return res.status(400).json({ error: { message: 'targetPayrollPeriodId is required' } });
      }

      const ok = await enforceTargetPeriodDeadline({
        req,
        res,
        agencyId: claim.agency_id,
        effectiveDateYmd: claim.claim_date,
        submittedAt: claim.created_at,
        targetPayrollPeriodId
      });
      if (!ok.ok) return;

      const items = await PayrollMedcancelClaimItem.listForClaim(id);
      if (!items || items.length === 0) {
        return res.status(409).json({ error: { message: 'Claim has no missed services to approve' } });
      }

      const submitter = await User.findById(claim.user_id);
      const schedule = String(submitter?.medcancel_rate_schedule || '').toLowerCase();
      if (schedule !== 'low' && schedule !== 'high') {
        return res.status(409).json({ error: { message: 'Med Cancel rate schedule is not configured for this provider' } });
      }

      const baseRates =
        schedule === 'high'
          ? { '90832': 10, '90834': 15, '90837': 20 }
          : { '90832': 5, '90834': 7.5, '90837': 10 };

      let appliedAmount = 0;
      for (const it of items) {
        const code = String(it.missed_service_code || '').trim();
        const base = Number(baseRates[code] || 0);
        if (!(base > 0)) {
          return res.status(409).json({ error: { message: `Unsupported missed service code: ${code}` } });
        }
        appliedAmount += base;
      }
      appliedAmount = Math.round(appliedAmount * 100) / 100;
      const units = items.length;
      const rateAmount = units > 0 ? Math.round(((appliedAmount / units) * 10000)) / 10000 : 0;
      const serviceCode = 'MEDCANCEL';
      const updated = await PayrollMedcancelClaim.approve({
        id,
        approverUserId: req.user.id,
        targetPayrollPeriodId,
        serviceCode,
        rateAmount,
        rateUnit: 'per_unit',
        appliedAmount
      });

      // If payroll has already been run for the target period, recompute immediately so totals reflect the approval.
      try {
        const period = await PayrollPeriod.findById(targetPayrollPeriodId);
        const st = String(period?.status || '').toLowerCase();
        if (period && st === 'ran') {
          await recomputeSummariesFromStaging({
            payrollPeriodId: targetPayrollPeriodId,
            agencyId: period.agency_id,
            periodStart: period.period_start,
            periodEnd: period.period_end
          });
        }
        const label = period ? `${period.period_start} → ${period.period_end}` : null;
        await NotificationService.createMedcancelClaimApprovedNotification({
          claim: updated,
          agencyId: claim.agency_id,
          periodLabel: label
        });
      } catch { /* best-effort */ }

      return res.json({ claim: updated });
    }

    if (action === 'reject') {
      const rejectionReason = body.rejectionReason ? String(body.rejectionReason).trim().slice(0, 255) : '';
      if (!rejectionReason) {
        return res.status(400).json({ error: { message: 'rejectionReason is required' } });
      }
      const updated = await PayrollMedcancelClaim.reject({ id, rejectorUserId: req.user.id, rejectionReason });
      try {
        const actor = await User.findById(req.user.id);
        const actorName = actor ? `${actor.first_name || ''} ${actor.last_name || ''}`.trim() : '';
        await NotificationService.createMedcancelClaimRejectedNotification({
          claim: updated,
          agencyId: claim.agency_id,
          rejectionReason,
          actorName
        });
      } catch { /* best-effort */ }
      return res.json({ claim: updated });
    }

    if (action === 'defer') {
      const updated = await PayrollMedcancelClaim.defer({ id });
      return res.json({ claim: updated });
    }

    if (action === 'return') {
      const st = String(claim.status || '').toLowerCase();
      if (st === 'approved') {
        return res.status(409).json({ error: { message: 'Unapprove the claim first to return it for changes.' } });
      }
      const note = body.note ? String(body.note).trim().slice(0, 255) : '';
      if (!note) return res.status(400).json({ error: { message: 'note is required' } });
      const updated = await PayrollMedcancelClaim.returnForChanges({ id, actorUserId: req.user.id, note });
      try {
        const actor = await User.findById(req.user.id);
        const actorName = actor ? `${actor.first_name || ''} ${actor.last_name || ''}`.trim() : '';
        await NotificationService.createMedcancelClaimReturnedNotification({
          claim: updated,
          agencyId: claim.agency_id,
          note,
          actorName
        });
      } catch { /* best-effort */ }
      // If the claim was previously approved into a ran period, recompute so totals drop immediately.
      try {
        const targetPayrollPeriodId = claim.target_payroll_period_id;
        if (targetPayrollPeriodId) {
          const period = await PayrollPeriod.findById(targetPayrollPeriodId);
          const st = String(period?.status || '').toLowerCase();
          if (period && st === 'ran') {
            await recomputeSummariesFromStaging({
              payrollPeriodId: targetPayrollPeriodId,
              agencyId: period.agency_id,
              periodStart: period.period_start,
              periodEnd: period.period_end
            });
          }
        }
      } catch { /* best-effort */ }
      return res.json({ claim: updated });
    }

    if (action === 'unapprove') {
      const st = String(claim.status || '').toLowerCase();
      if (st !== 'approved') {
        return res.status(409).json({ error: { message: 'Only approved claims can be unapproved' } });
      }
      const targetPayrollPeriodId = Number(claim.target_payroll_period_id || 0);
      if (targetPayrollPeriodId) {
        const period = await PayrollPeriod.findById(targetPayrollPeriodId);
        const pst = String(period?.status || '').toLowerCase();
        if (pst === 'posted' || pst === 'finalized') {
          return res.status(409).json({ error: { message: 'Cannot unapprove a claim that is in a posted/finalized pay period' } });
        }
      }

      const updated = await PayrollMedcancelClaim.unapprove({ id });

      // If payroll has already been run for the former target period, recompute immediately so totals drop.
      try {
        if (targetPayrollPeriodId) {
          const period = await PayrollPeriod.findById(targetPayrollPeriodId);
          const pst = String(period?.status || '').toLowerCase();
          if (period && pst === 'ran') {
            await recomputeSummariesFromStaging({
              payrollPeriodId: targetPayrollPeriodId,
              agencyId: period.agency_id,
              periodStart: period.period_start,
              periodEnd: period.period_end
            });
          }
        }
      } catch { /* best-effort */ }

      return res.json({ claim: updated });
    }

    return res.status(400).json({ error: { message: 'Unsupported action' } });
  } catch (e) {
    next(e);
  }
};

// =========================
// Supervision tracking
// =========================

export const getSupervisionPolicy = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    const out = await getAgencySupervisionPolicy({ agencyId });
    res.json(out);
  } catch (e) {
    next(e);
  }
};

export const putSupervisionPolicy = async (req, res, next) => {
  try {
    const body = req.body || {};
    const agencyId = body.agencyId ? parseInt(body.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    const enabled = body.enabled === true || body.supervisionEnabled === true;
    const policy = body.policy && typeof body.policy === 'object' ? body.policy : {};
    const out = await upsertAgencySupervisionPolicy({ agencyId, enabled, policy });
    res.json(out);
  } catch (e) {
    next(e);
  }
};

export const importSupervisionCsv = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const payrollPeriodId = parseInt(req.params.id, 10);
      const period = await PayrollPeriod.findById(payrollPeriodId);
      if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
      if (!(await requirePayrollAccess(req, res, period.agency_id))) return;
      if (!req.file) return res.status(400).json({ error: { message: 'CSV file is required' } });

      const result = await importSupervisionForPeriod({
        agencyId: period.agency_id,
        payrollPeriodId,
        uploadedByUserId: req.user?.id || null,
        fileBuffer: req.file.buffer,
        originalName: req.file.originalname
      });
      if (!result.ok) {
        return res.status(result.status || 409).json({ error: { message: result.error || 'Failed to import supervision CSV' } });
      }
      res.json(result);
    } catch (e) {
      next(e);
    }
  }
];

export const listSupervisionAccountsForAgency = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    const rows = await listSupervisionAccounts({ agencyId, limit: req.query.limit ? parseInt(req.query.limit, 10) : 500 });
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

// =========================
// PTO (balances + requests)
// =========================

export const getPtoPolicy = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    const out = await getAgencyPtoPolicy({ agencyId });
    res.json({ ok: true, agencyId, ...out });
  } catch (e) {
    next(e);
  }
};

export const putPtoPolicy = async (req, res, next) => {
  try {
    const body = req.body || {};
    const agencyId = body.agencyId ? parseInt(body.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const policy = body.policy && typeof body.policy === 'object' ? body.policy : {};
    const defaultPayRate = Number(body.defaultPayRate ?? body.ptoDefaultPayRate ?? 0);
    const ptoEnabled = body.ptoEnabled === false ? false : true;

    const out = await upsertAgencyPtoPolicy({ agencyId, policy, defaultPayRate, ptoEnabled });
    res.json({ ok: true, agencyId, ...out });
  } catch (e) {
    next(e);
  }
};

export const getUserPtoAccount = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const userId = req.params.userId ? parseInt(req.params.userId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const acct = await ensurePtoAccount({ agencyId, userId, updatedByUserId: req.user.id });
    res.json({ ok: true, agencyId, userId, account: acct });
  } catch (e) {
    next(e);
  }
};

export const upsertUserPtoAccount = async (req, res, next) => {
  try {
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : (req.query.agencyId ? parseInt(req.query.agencyId, 10) : null);
    const userId = req.params.userId ? parseInt(req.params.userId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!userId) return res.status(400).json({ error: { message: 'userId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const body = req.body || {};
    const employmentTypeRaw = String(body.employmentType || body.employment_type || '').trim().toLowerCase();
    const employmentType = ['hourly', 'fee_for_service', 'salaried'].includes(employmentTypeRaw) ? employmentTypeRaw : 'hourly';
    const trainingPtoEligible = body.trainingPtoEligible === true || body.trainingPtoEligible === 1 || body.trainingPtoEligible === '1';

    const acct = await ensurePtoAccount({
      agencyId,
      userId,
      updatedByUserId: req.user.id,
      defaults: { employmentType, trainingPtoEligible }
    });

    // Update classification flags without touching balances.
    await PayrollPtoAccount.upsert({
      agencyId,
      userId,
      employmentType,
      trainingPtoEligible,
      sickStartHours: acct.sick_start_hours,
      sickStartEffectiveDate: acct.sick_start_effective_date,
      trainingStartHours: acct.training_start_hours,
      trainingStartEffectiveDate: acct.training_start_effective_date,
      sickBalanceHours: acct.sick_balance_hours,
      trainingBalanceHours: acct.training_balance_hours,
      lastAccruedPayrollPeriodId: acct.last_accrued_payroll_period_id,
      lastSickRolloverYear: acct.last_sick_rollover_year,
      trainingForfeitedAt: acct.training_forfeited_at,
      updatedByUserId: req.user.id
    });

    // Starting balances + effective dates (optional)
    const updated = await applyStartingBalances({
      agencyId,
      userId,
      updatedByUserId: req.user.id,
      sickStartHours: body.sickStartHours,
      sickStartEffectiveDate: body.sickStartEffectiveDate,
      trainingStartHours: body.trainingStartHours,
      trainingStartEffectiveDate: body.trainingStartEffectiveDate
    });

    res.json({ ok: true, agencyId, userId, account: updated });
  } catch (e) {
    next(e);
  }
};

export const getMyPtoBalances = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const out = await getPtoBalances({ agencyId, userId });
    res.json({ ok: true, agencyId, userId, ...out });
  } catch (e) {
    next(e);
  }
};

export const getUserPtoBalances = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId ? parseInt(req.params.userId, 10) : null;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    if (!(await requireTargetUserInAgency({ res, agencyId, targetUserId }))) return;

    const prev = req.user;
    req.user = { ...(prev || {}), id: targetUserId, role: 'provider' };
    try {
      return await getMyPtoBalances(req, res, next);
    } finally {
      req.user = prev;
    }
  } catch (e) {
    next(e);
  }
};

export const createMyPtoRequest = [
  receiptUpload.single('proof'),
  async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const body = req.body || {};
      const agencyId = body.agencyId ? parseInt(body.agencyId, 10) : null;
      if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
      if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

      // Ensure membership for non-admins.
      if (!isAdminRole(req.user.role)) {
        const [rows] = await pool.execute(
          'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
          [userId, agencyId]
        );
        if (!rows || rows.length === 0) {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      }

      const { policy } = await getAgencyPtoPolicy({ agencyId });
      if (policy.ptoEnabled === false) {
        return res.status(403).json({ error: { message: 'PTO is disabled for this organization' } });
      }

      const requestTypeRaw = String(body.requestType || body.request_type || '').trim().toLowerCase();
      const requestType = requestTypeRaw === 'training' ? 'training' : 'sick';
      const notes = body.notes ? String(body.notes) : null;
      const trainingDescription = body.trainingDescription ? String(body.trainingDescription) : null;

      let items = [];
      if (Array.isArray(body.items)) {
        items = body.items;
      } else if (typeof body.items === 'string' && body.items.trim()) {
        try { items = JSON.parse(body.items); } catch { items = []; }
      }
      items = (items || []).map((it) => ({
        requestDate: String(it?.date || it?.requestDate || '').slice(0, 10),
        hours: Number(it?.hours || 0)
      })).filter((it) => /^\d{4}-\d{2}-\d{2}$/.test(it.requestDate) && Number.isFinite(it.hours) && it.hours > 0);

      if (!items.length) {
        return res.status(400).json({ error: { message: 'At least one (date, hours) entry is required' } });
      }
      const totalHours = Math.round(items.reduce((a, it) => a + Number(it.hours || 0), 0) * 100) / 100;

      // Training eligibility + proof requirements.
      const acct = await ensurePtoAccount({ agencyId, userId, updatedByUserId: userId });
      if (requestType === 'training') {
        if (policy.trainingPtoEnabled !== true) {
          return res.status(403).json({ error: { message: 'Training PTO is disabled for this organization' } });
        }
        if (!acct.training_pto_eligible) {
          return res.status(403).json({ error: { message: 'Training PTO is not enabled for your account' } });
        }
        if (!String(trainingDescription || '').trim()) {
          return res.status(400).json({ error: { message: 'Training description is required' } });
        }
        if (!req.file) {
          return res.status(400).json({ error: { message: 'Training proof upload is required' } });
        }
      }

      const policyWarnings = computePtoPolicyWarnings({ policy, requestItems: items.map((x) => ({ requestDate: x.requestDate, hours: x.hours })) });

      let proofMeta = null;
      if (req.file) {
        const saved = await StorageService.savePtoProof(req.file.buffer, req.file.originalname, req.file.mimetype);
        proofMeta = {
          filePath: saved.path,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size
        };
      }

      const created = await PayrollPtoRequest.create({
        agencyId,
        userId,
        requestType,
        notes,
        trainingDescription,
        proof: proofMeta,
        policyWarningsJson: policyWarnings,
        policyAckJson: body.policyAck ? body.policyAck : null,
        totalHours
      });
      await PayrollPtoRequest.addItems({
        requestId: created.id,
        agencyId,
        items: items.map((it) => ({ requestDate: it.requestDate, hours: it.hours }))
      });
      const withItems = { ...created, items: await PayrollPtoRequest.listItemsForRequest(created.id) };
      res.status(201).json(withItems);
    } catch (e) {
      next(e);
    }
  }
];

export const createUserPtoRequest = [
  receiptUpload.single('proof'),
  async (req, res, next) => {
    try {
      const targetUserId = req.params.userId ? parseInt(req.params.userId, 10) : null;
      const body = req.body || {};
      const agencyId = body.agencyId ? parseInt(body.agencyId, 10) : null;
      if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
      if (!(await requirePayrollAccess(req, res, agencyId))) return;
      if (!(await requireTargetUserInAgency({ res, agencyId, targetUserId }))) return;

      const prev = req.user;
      req.user = { ...(prev || {}), id: targetUserId, role: 'provider' };
      try {
        return await createMyPtoRequest[1](req, res, next);
      } finally {
        req.user = prev;
      }
    } catch (e) {
      next(e);
    }
  }
];

export const listMyPtoRequests = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const rows = await PayrollPtoRequest.listForAgencyUser({ agencyId, userId, limit: 200 });
    const withItems = await Promise.all((rows || []).map(async (r) => ({ ...r, items: await PayrollPtoRequest.listItemsForRequest(r.id) })));
    res.json(withItems);
  } catch (e) {
    next(e);
  }
};

export const listPtoRequests = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    const status = req.query.status ? String(req.query.status) : 'submitted';
    const rows = await PayrollPtoRequest.listForAgency({ agencyId, status, limit: 500 });
    const withItems = await Promise.all((rows || []).map(async (r) => ({ ...r, items: await PayrollPtoRequest.listItemsForRequest(r.id) })));
    res.json(withItems);
  } catch (e) {
    next(e);
  }
};

export const patchPtoRequest = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const reqRow = await PayrollPtoRequest.findById(id);
    if (!reqRow) return res.status(404).json({ error: { message: 'PTO request not found' } });
    if (!(await requirePayrollAccess(req, res, reqRow.agency_id))) return;

    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!action) return res.status(400).json({ error: { message: 'action is required' } });

    if (action === 'approve') {
      const result = await approvePtoRequestAndPostToPayroll({
        agencyId: reqRow.agency_id,
        requestId: id,
        approvedByUserId: req.user.id
      });

      // If payroll has already been run for any affected pay period, recompute immediately
      // so totals reflect the PTO approval.
      try {
        const ids = Array.isArray(result?.affectedPayrollPeriodIds) ? result.affectedPayrollPeriodIds : [];
        for (const pid of ids) {
          const period = await PayrollPeriod.findById(pid);
          const st = String(period?.status || '').toLowerCase();
          if (period && st === 'ran') {
            await recomputeSummariesFromStaging({
              payrollPeriodId: pid,
              agencyId: period.agency_id,
              periodStart: period.period_start,
              periodEnd: period.period_end
            });
          }
        }
      } catch { /* best-effort */ }

      const updated = await PayrollPtoRequest.findById(id);
      res.json({ ...updated, items: await PayrollPtoRequest.listItemsForRequest(id) });
      return;
    }

    if (action === 'reject') {
      const reason = String(req.body?.rejectionReason || '').trim().slice(0, 255);
      if (!reason) return res.status(400).json({ error: { message: 'rejectionReason is required' } });
      const updated = await PayrollPtoRequest.updateStatus({
        requestId: id,
        agencyId: reqRow.agency_id,
        status: 'rejected',
        approvedByUserId: null,
        approvedAt: null,
        rejectedByUserId: req.user.id,
        rejectedAt: new Date(),
        rejectionReason: reason
      });
      res.json({ ...updated, items: await PayrollPtoRequest.listItemsForRequest(id) });
      return;
    }

    if (action === 'return' || action === 'defer') {
      const reason = String(req.body?.rejectionReason || req.body?.reason || '').trim().slice(0, 255);
      if (!reason) return res.status(400).json({ error: { message: 'reason is required' } });
      const updated = await PayrollPtoRequest.updateStatus({
        requestId: id,
        agencyId: reqRow.agency_id,
        status: 'deferred',
        approvedByUserId: null,
        approvedAt: null,
        rejectedByUserId: req.user.id,
        rejectedAt: new Date(),
        rejectionReason: reason
      });
      res.json({ ...updated, items: await PayrollPtoRequest.listItemsForRequest(id) });
      return;
    }

    res.status(400).json({ error: { message: `Unsupported action: ${action}` } });
  } catch (e) {
    next(e);
  }
};

export const patchMileageClaim = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const claim = await PayrollMileageClaim.findById(id);
    if (!claim) return res.status(404).json({ error: { message: 'Mileage claim not found' } });
    if (!(await requirePayrollAccess(req, res, claim.agency_id))) return;

    const body = req.body || {};
    const action = String(body.action || '').toLowerCase();
    if (!action) return res.status(400).json({ error: { message: 'action is required' } });

    if (action === 'unapprove') {
      // Allow only if the claim is currently approved and its target period is not locked.
      const st = String(claim.status || '').toLowerCase();
      if (st !== 'approved') {
        return res.status(409).json({ error: { message: 'Only approved claims can be unapproved' } });
      }
      const targetPayrollPeriodId = Number(claim.target_payroll_period_id || 0);
      if (targetPayrollPeriodId) {
        const period = await PayrollPeriod.findById(targetPayrollPeriodId);
        const pst = String(period?.status || '').toLowerCase();
        if (pst === 'posted' || pst === 'finalized') {
          return res.status(409).json({ error: { message: 'Cannot unapprove a claim that is in a posted/finalized pay period' } });
        }
      }

      const updated = await PayrollMileageClaim.unapprove({ id });

      // If payroll has already been run for the former target period, recompute immediately so totals drop.
      try {
        if (targetPayrollPeriodId) {
          const period = await PayrollPeriod.findById(targetPayrollPeriodId);
          const pst = String(period?.status || '').toLowerCase();
          if (period && pst === 'ran') {
            await recomputeSummariesFromStaging({
              payrollPeriodId: targetPayrollPeriodId,
              agencyId: period.agency_id,
              periodStart: period.period_start,
              periodEnd: period.period_end
            });
          }
        }
      } catch { /* best-effort */ }

      return res.json({ claim: updated });
    }

    if (action === 'move') {
      // Move an approved claim to a different target pay period.
      const st = String(claim.status || '').toLowerCase();
      if (st !== 'approved') {
        return res.status(409).json({ error: { message: 'Only approved claims can be moved' } });
      }
      const targetPayrollPeriodId = Number(body.targetPayrollPeriodId || 0);
      if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) {
        return res.status(400).json({ error: { message: 'targetPayrollPeriodId is required' } });
      }

      const fromPeriodId = Number(claim.target_payroll_period_id || 0);
      if (fromPeriodId === targetPayrollPeriodId) {
        return res.json({ claim });
      }

      // Validate both periods (must be same agency and not locked).
      const toPeriod = await PayrollPeriod.findById(targetPayrollPeriodId);
      if (!toPeriod) return res.status(404).json({ error: { message: 'Target pay period not found' } });
      if (Number(toPeriod.agency_id) !== Number(claim.agency_id)) {
        return res.status(400).json({ error: { message: 'Target pay period does not belong to this agency' } });
      }

      const hardStopPolicy =
        String(claim.claim_type || '').toLowerCase() === 'school_travel'
          ? 'in_school'
          : '60_days';
      const ok = await enforceTargetPeriodDeadline({
        req,
        res,
        agencyId: claim.agency_id,
        effectiveDateYmd: claim.drive_date,
        submittedAt: claim.created_at,
        targetPayrollPeriodId,
        targetPeriodRow: toPeriod,
        officeLocationId: claim.office_location_id,
        hardStopPolicy
      });
      if (!ok.ok) return;

      const toStatus = String(toPeriod.status || '').toLowerCase();
      if (toStatus === 'posted' || toStatus === 'finalized') {
        return res.status(409).json({ error: { message: 'Target pay period is posted/finalized' } });
      }
      if (fromPeriodId) {
        const fromPeriod = await PayrollPeriod.findById(fromPeriodId);
        const fromStatus = String(fromPeriod?.status || '').toLowerCase();
        if (fromStatus === 'posted' || fromStatus === 'finalized') {
          return res.status(409).json({ error: { message: 'Cannot move a claim out of a posted/finalized pay period' } });
        }
      }

      const updated = await PayrollMileageClaim.moveTargetPeriod({ id, targetPayrollPeriodId });

      // If payroll has already been run for either period, recompute so totals follow the claim.
      try {
        if (fromPeriodId) {
          const fromPeriod = await PayrollPeriod.findById(fromPeriodId);
          const fromStatus = String(fromPeriod?.status || '').toLowerCase();
          if (fromPeriod && fromStatus === 'ran') {
            await recomputeSummariesFromStaging({
              payrollPeriodId: fromPeriodId,
              agencyId: fromPeriod.agency_id,
              periodStart: fromPeriod.period_start,
              periodEnd: fromPeriod.period_end
            });
          }
        }
      } catch { /* best-effort */ }
      try {
        const toStatus2 = String(toPeriod?.status || '').toLowerCase();
        if (toPeriod && toStatus2 === 'ran') {
          await recomputeSummariesFromStaging({
            payrollPeriodId: targetPayrollPeriodId,
            agencyId: toPeriod.agency_id,
            periodStart: toPeriod.period_start,
            periodEnd: toPeriod.period_end
          });
        }
      } catch { /* best-effort */ }

      return res.json({ claim: updated });
    }

    if (action === 'approve') {
      const targetPayrollPeriodId = Number(body.targetPayrollPeriodId || 0);
      const tierLevel = Number(body.tierLevel || claim.tier_level || 0);
      if (!Number.isFinite(targetPayrollPeriodId) || targetPayrollPeriodId <= 0) {
        return res.status(400).json({ error: { message: 'targetPayrollPeriodId is required' } });
      }

      const hardStopPolicy =
        String(claim.claim_type || '').toLowerCase() === 'school_travel'
          ? 'in_school'
          : '60_days';
      const ok = await enforceTargetPeriodDeadline({
        req,
        res,
        agencyId: claim.agency_id,
        effectiveDateYmd: claim.drive_date,
        submittedAt: claim.created_at,
        targetPayrollPeriodId,
        officeLocationId: claim.office_location_id,
        hardStopPolicy
      });
      if (!ok.ok) return;

      if (![1, 2, 3].includes(tierLevel)) {
        return res.status(400).json({ error: { message: 'tierLevel must be 1, 2, or 3' } });
      }

      const rates = await AgencyMileageRate.listForAgency(claim.agency_id);
      const rateRow = (rates || []).find((r) => Number(r.tier_level) === tierLevel) || null;
      const ratePerMile = Number(rateRow?.rate_per_mile || 0);
      if (!Number.isFinite(ratePerMile) || ratePerMile <= 0) {
        return res.status(409).json({ error: { message: `Mileage rate not configured for Tier ${tierLevel}` } });
      }

      const computedEligible = computeEligibleMilesForClaim(claim);
      const eligibleMiles =
        (Number.isFinite(Number(claim.eligible_miles)) && Number(claim.eligible_miles) > 0)
          ? Number(claim.eligible_miles)
          : (computedEligible !== null ? computedEligible : Number(claim.miles || 0));
      const billableMiles =
        String(claim.claim_type || '').toLowerCase() === 'school_travel'
          ? Math.max(0, eligibleMiles)
          : ((claim.round_trip === 1 || claim.round_trip === true) ? (Math.max(0, eligibleMiles) * 2) : Math.max(0, eligibleMiles));
      const appliedAmount = Math.round((billableMiles * ratePerMile) * 100) / 100;

      const updated = await PayrollMileageClaim.approve({
        id,
        approverUserId: req.user.id,
        targetPayrollPeriodId,
        tierLevel,
        ratePerMile,
        appliedAmount
      });

      // If payroll has already been run for the target period, recompute immediately so totals reflect the approval.
      try {
        const period = await PayrollPeriod.findById(targetPayrollPeriodId);
        const st = String(period?.status || '').toLowerCase();
        if (period && st === 'ran') {
          await recomputeSummariesFromStaging({
            payrollPeriodId: targetPayrollPeriodId,
            agencyId: period.agency_id,
            periodStart: period.period_start,
            periodEnd: period.period_end
          });
        }
        const label = period ? `${period.period_start} → ${period.period_end}` : null;
        await NotificationService.createMileageClaimApprovedNotification({
          claim: updated,
          agencyId: claim.agency_id,
          periodLabel: label
        });
      } catch { /* best-effort */ }

      return res.json({ claim: updated });
    }

    if (action === 'reject') {
      const rejectionReason = body.rejectionReason ? String(body.rejectionReason).trim().slice(0, 255) : '';
      if (!rejectionReason) {
        return res.status(400).json({ error: { message: 'rejectionReason is required' } });
      }
      const updated = await PayrollMileageClaim.reject({ id, rejectorUserId: req.user.id, rejectionReason });
      try {
        const actor = await User.findById(req.user.id);
        const actorName = actor ? `${actor.first_name || ''} ${actor.last_name || ''}`.trim() : '';
        await NotificationService.createMileageClaimRejectedNotification({
          claim: updated,
          agencyId: claim.agency_id,
          rejectionReason,
          actorName
        });
      } catch { /* best-effort */ }
      return res.json({ claim: updated });
    }

    if (action === 'defer') {
      const updated = await PayrollMileageClaim.defer({ id });
      return res.json({ claim: updated });
    }

    if (action === 'return') {
      const st = String(claim.status || '').toLowerCase();
      if (st === 'approved') {
        return res.status(409).json({ error: { message: 'Unapprove the claim first to return it for changes.' } });
      }
      const note = body.note ? String(body.note).trim().slice(0, 255) : '';
      if (!note) return res.status(400).json({ error: { message: 'note is required' } });
      const updated = await PayrollMileageClaim.returnForChanges({ id, actorUserId: req.user.id, note });
      try {
        const actor = await User.findById(req.user.id);
        const actorName = actor ? `${actor.first_name || ''} ${actor.last_name || ''}`.trim() : '';
        await NotificationService.createMileageClaimReturnedNotification({
          claim: updated,
          agencyId: claim.agency_id,
          note,
          actorName
        });
      } catch { /* best-effort */ }
      // If the claim was previously approved into a ran period, recompute so totals drop immediately.
      try {
        const targetPayrollPeriodId = claim.target_payroll_period_id;
        if (targetPayrollPeriodId) {
          const period = await PayrollPeriod.findById(targetPayrollPeriodId);
          const st = String(period?.status || '').toLowerCase();
          if (period && st === 'ran') {
            await recomputeSummariesFromStaging({
              payrollPeriodId: targetPayrollPeriodId,
              agencyId: period.agency_id,
              periodStart: period.period_start,
              periodEnd: period.period_end
            });
          }
        }
      } catch { /* best-effort */ }
      return res.json({ claim: updated });
    }

    return res.status(400).json({ error: { message: 'Unsupported action' } });
  } catch (e) {
    next(e);
  }
};

export const listMyPayroll = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const rows = await PayrollSummary.listForUser({ userId, agencyId, limit: 100, offset: 0 });
    const postedOnly = (rows || []).filter((r) => {
      const st = String(r.status || '').toLowerCase();
      return st === 'posted' || st === 'finalized';
    });
    res.json(postedOnly);
  } catch (e) {
    next(e);
  }
};

export const getMyDashboardSummary = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const resolvedAgencyId = await resolvePayrollAgencyId(agencyId);
    if (!resolvedAgencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, resolvedAgencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const agency = await Agency.findById(resolvedAgencyId);

    const all = await PayrollSummary.listForUser({ userId, agencyId: resolvedAgencyId, limit: 100, offset: 0 });
    const posted = (all || []).filter((r) => {
      const st = String(r.status || '').toLowerCase();
      return st === 'posted' || st === 'finalized';
    });
    const lastPaycheck = posted?.[0] || null;
    const last6 = (posted || []).slice(0, 6);

    const unpaidLast = lastPaycheck
      ? {
          noNoteUnits: Number(lastPaycheck.no_note_units || 0),
          draftUnits: Number(lastPaycheck.draft_units || 0),
          totalUnits: Number(lastPaycheck.no_note_units || 0) + Number(lastPaycheck.draft_units || 0)
        }
      : { noNoteUnits: 0, draftUnits: 0, totalUnits: 0 };

    const priorStill = lastPaycheck?.breakdown?.__priorStillUnpaid || null;

    let twoPeriodsOld = null;
    try {
      if (lastPaycheck?.payroll_period_id) {
        const prev = await PayrollNotesAgingService.previewTwoPeriodsOldUnpaidNotesAlerts({
          agencyId: resolvedAgencyId,
          payrollPeriodId: Number(lastPaycheck.payroll_period_id),
          providerUserId: Number(userId)
        });
        if (prev?.ok && prev?.stalePeriod) {
          const n = (prev.notifications || [])[0] || null;
          twoPeriodsOld = {
            periodStart: String(prev.stalePeriod.period_start || '').slice(0, 10),
            periodEnd: String(prev.stalePeriod.period_end || '').slice(0, 10),
            noNoteUnits: Number(n?.noNote || 0),
            draftUnits: Number(n?.draft || 0),
            totalUnits: Number(n?.noNote || 0) + Number(n?.draft || 0)
          };
        }
      }
    } catch {
      twoPeriodsOld = null;
    }

    // Direct/Indirect ratio is only relevant for simple hourly rate cards (direct + indirect only).
    let showRatio = false;
    try {
      const comp = await getUserCompensationForAgency({ agencyId: resolvedAgencyId, userId });
      const rc = comp?.rateCard || null;
      if (rc) {
        const o1 = Number(rc.other_rate_1 || 0);
        const o2 = Number(rc.other_rate_2 || 0);
        const o3 = Number(rc.other_rate_3 || 0);
        showRatio = Math.abs(o1) < 1e-9 && Math.abs(o2) < 1e-9 && Math.abs(o3) < 1e-9;
      }
    } catch {
      showRatio = false;
    }

    const ratioOf = ({ direct, indirect }) => {
      const d = Number(direct || 0);
      const i = Number(indirect || 0);
      if (d > 1e-9) return i / d;
      if (i > 1e-9) return Infinity;
      return 0;
    };
    const ratioKind = (ratio) => {
      if (!Number.isFinite(ratio)) return 'red';
      if (ratio <= 0.15 + 1e-9) return 'green';
      if (ratio <= 0.25 + 1e-9) return 'yellow';
      return 'red';
    };

    const lastRatio = lastPaycheck
      ? ratioOf({ direct: lastPaycheck.direct_hours || 0, indirect: lastPaycheck.indirect_hours || 0 })
      : null;
    const avgRatio = (() => {
      const sumDirect = (last6 || []).reduce((a, p) => a + Number(p.direct_hours || 0), 0);
      const sumIndirect = (last6 || []).reduce((a, p) => a + Number(p.indirect_hours || 0), 0);
      return ratioOf({ direct: sumDirect, indirect: sumIndirect });
    })();

    const ratio = showRatio
      ? {
          last: lastPaycheck
            ? {
                directHours: Number(lastPaycheck.direct_hours || 0),
                indirectHours: Number(lastPaycheck.indirect_hours || 0),
                ratio: lastRatio,
                kind: ratioKind(lastRatio)
              }
            : null,
          avg90: {
            directHours: (last6 || []).reduce((a, p) => a + Number(p.direct_hours || 0), 0),
            indirectHours: (last6 || []).reduce((a, p) => a + Number(p.indirect_hours || 0), 0),
            ratio: avgRatio,
            kind: ratioKind(avgRatio),
            periods: (last6 || []).length
          }
        }
      : { disabled: true };

    // PTO balances
    const pto = await getPtoBalances({ agencyId: resolvedAgencyId, userId });

    // Supervision
    let supervision = { enabled: false };
    try {
      const pol = await getAgencySupervisionPolicy({ agencyId: resolvedAgencyId });
      if (pol?.policy?.enabled) {
        const [uaRows] = await pool.execute(
          `SELECT supervision_is_prelicensed
           FROM user_agencies
           WHERE agency_id = ? AND user_id = ?
           LIMIT 1`,
          [resolvedAgencyId, userId]
        );
        const ua = uaRows?.[0] || null;
        const isPre = ua?.supervision_is_prelicensed === 1 || ua?.supervision_is_prelicensed === true || String(ua?.supervision_is_prelicensed || '') === '1';
        if (isPre) {
          const acct = await recomputeSupervisionAccountForUser({ agencyId: resolvedAgencyId, userId });
          const ind = Number(acct?.individual_hours || 0);
          const grp = Number(acct?.group_hours || 0);
          supervision = {
            enabled: true,
            isPrelicensed: true,
            individualHours: ind,
            groupHours: grp,
            totalHours: ind + grp,
            requiredIndividualHours: Number(pol.policy.requiredIndividualHours || 50),
            requiredGroupHours: Number(pol.policy.requiredGroupHours || 50)
          };
        } else {
          supervision = { enabled: true, isPrelicensed: false };
        }
      }
    } catch {
      supervision = { enabled: false };
    }

    // Supervisor (primary)
    let supervisor = null;
    try {
      const arr = await SupervisorAssignment.findBySupervisee(userId, resolvedAgencyId);
      const s = (arr || [])[0] || null;
      if (s) {
        supervisor = {
          userId: Number(s.supervisor_id || 0),
          name: `${String(s.supervisor_first_name || '').trim()} ${String(s.supervisor_last_name || '').trim()}`.trim() || s.supervisor_email || 'Supervisor',
          email: s.supervisor_email || null
        };
      }
    } catch {
      supervisor = null;
    }

    // Primary office address: resolve from office_room_assignments -> office_rooms -> office_locations.
    let office = null;
    try {
      const [rows] = await pool.execute(
        `SELECT
            ol.id AS locationId,
            ol.name AS locationName,
            ol.street_address AS streetAddress,
            ol.city AS city,
            ol.state AS state,
            ol.postal_code AS postalCode
         FROM office_room_assignments ora
         JOIN office_rooms orr ON orr.id = ora.room_id
         JOIN office_locations ol ON ol.id = orr.location_id
         WHERE ora.assigned_user_id = ?
           AND ol.agency_id = ?
           AND (
             ora.assignment_type = 'PERMANENT'
             OR (ora.start_at <= NOW() AND (ora.end_at IS NULL OR ora.end_at >= NOW()))
           )
         ORDER BY (ora.assignment_type = 'PERMANENT') DESC, ora.start_at DESC, ora.id DESC
         LIMIT 1`,
        [userId, resolvedAgencyId]
      );
      const r = rows?.[0] || null;
      if (r) {
        office = {
          source: 'office_location',
          locationId: Number(r.locationId || 0),
          name: r.locationName || null,
          streetAddress: r.streetAddress || null,
          city: r.city || null,
          state: r.state || null,
          postalCode: r.postalCode || null
        };
      }
    } catch {
      office = null;
    }
    if (!office) {
      office = {
        source: 'agency',
        name: agency?.name || null,
        streetAddress: agency?.street_address || null,
        city: agency?.city || null,
        state: agency?.state || null,
        postalCode: agency?.postal_code || null
      };
    }

    res.json({
      ok: true,
      agencyId: resolvedAgencyId,
      lastPaycheck: lastPaycheck
        ? {
            payrollPeriodId: Number(lastPaycheck.payroll_period_id),
            periodStart: String(lastPaycheck.period_start || '').slice(0, 10),
            periodEnd: String(lastPaycheck.period_end || '').slice(0, 10),
            totalPay: Number(lastPaycheck.total_amount || 0),
            totalUnpaidUnits: unpaidLast.totalUnits,
            breakdown: lastPaycheck.breakdown || null
          }
        : null,
      unpaidNotes: {
        lastPayPeriod: unpaidLast,
        priorStillUnpaid: priorStill,
        twoPeriodsOld
      },
      directIndirect: ratio,
      supervision,
      pto,
      supervisor,
      office
    });
  } catch (e) {
    next(e);
  }
};

export const getMyCurrentTier = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, agencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const rows = await PayrollSummary.listForUser({ userId, agencyId, limit: 5, offset: 0 });
    const latest = (rows || []).find((r) => {
      const st = String(r.status || '').toLowerCase();
      return st === 'posted' || st === 'finalized';
    }) || null;

    const tier = latest?.breakdown?.__tier || null;
    res.json({
      ok: true,
      agencyId,
      payrollPeriodId: latest?.payroll_period_id || null,
      periodStart: latest?.period_start || null,
      periodEnd: latest?.period_end || null,
      tier
    });
  } catch (e) {
    next(e);
  }
};

export const getMyCompensation = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const resolvedAgencyId = await resolvePayrollAgencyId(agencyId);
    if (!resolvedAgencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Ensure membership for non-admins.
    if (!isAdminRole(req.user.role)) {
      const [rows] = await pool.execute(
        'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
        [userId, resolvedAgencyId]
      );
      if (!rows || rows.length === 0) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const result = await getUserCompensationForAgency({ agencyId: resolvedAgencyId, userId });
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const getPayrollRateCard = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    const userId = req.query.userId ? parseInt(req.query.userId) : null;
    if (!agencyId || !userId) return res.status(400).json({ error: { message: 'agencyId and userId are required' } });
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyId);
    if (!resolvedAgencyId) return;
    const card = await PayrollRateCard.findForUser(resolvedAgencyId, userId);
    res.json(card || {
      agency_id: resolvedAgencyId,
      user_id: userId,
      direct_rate: 0,
      indirect_rate: 0,
      other_rate_1: 0,
      other_rate_1_bucket: 'other',
      other_rate_2: 0,
      other_rate_2_bucket: 'other',
      other_rate_3: 0,
      other_rate_3_bucket: 'other'
    });
  } catch (e) {
    next(e);
  }
};

export const upsertPayrollRateCard = async (req, res, next) => {
  try {
    const { agencyId, userId, directRate, indirectRate, otherRate1, otherRate2, otherRate3, otherRate1Bucket, otherRate2Bucket, otherRate3Bucket } = req.body || {};
    if (!agencyId || !userId) return res.status(400).json({ error: { message: 'agencyId and userId are required' } });
    const agencyIdNum = parseInt(agencyId);
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyIdNum);
    if (!resolvedAgencyId) return;

    const toNum = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
    const normalizeBucket = (v) => {
      const s = String(v ?? '').trim().toLowerCase();
      if (s === 'direct' || s === 'indirect' || s === 'other') return s;
      return undefined; // preserve existing when omitted/invalid
    };
    const payload = {
      agencyId: resolvedAgencyId,
      userId: parseInt(userId),
      directRate: toNum(directRate),
      indirectRate: toNum(indirectRate),
      otherRate1: toNum(otherRate1),
      otherRate2: toNum(otherRate2),
      otherRate3: toNum(otherRate3),
      otherRate1Bucket: normalizeBucket(otherRate1Bucket),
      otherRate2Bucket: normalizeBucket(otherRate2Bucket),
      otherRate3Bucket: normalizeBucket(otherRate3Bucket),
      updatedByUserId: req.user.id
    };
    if (![payload.directRate, payload.indirectRate, payload.otherRate1, payload.otherRate2, payload.otherRate3].every((n) => Number.isFinite(n) && n >= 0)) {
      return res.status(400).json({ error: { message: 'Rates must be non-negative numbers' } });
    }

    const card = await PayrollRateCard.upsert(payload);
    res.json(card);
  } catch (e) {
    next(e);
  }
};

export const listServiceCodeRules = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyId);
    if (!resolvedAgencyId) return;
    const rows = await PayrollServiceCodeRule.listForAgency(resolvedAgencyId);
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const upsertServiceCodeRule = async (req, res, next) => {
  try {
    const { agencyId, serviceCode, category, otherSlot, unitToHourMultiplier, countsForTier, durationMinutes, tierCreditMultiplier, payDivisor, payRateUnit, creditValue, showInRateSheet } = req.body || {};
    if (!agencyId || !serviceCode) return res.status(400).json({ error: { message: 'agencyId and serviceCode are required' } });
    const agencyIdNum = parseInt(agencyId);
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyIdNum);
    if (!resolvedAgencyId) return;

    // IMPORTANT:
    // Some clients (e.g. agency settings UI) intentionally do not edit every column in payroll_service_code_rules.
    // Treat missing fields as "no change" so we never accidentally reset hidden settings back to defaults.
    const codeTrimmed = String(serviceCode).trim();
    const [existingRows] = await pool.execute(
      `SELECT *
       FROM payroll_service_code_rules
       WHERE agency_id = ? AND service_code = ?
       LIMIT 1`,
      [resolvedAgencyId, codeTrimmed]
    );
    const existing = existingRows?.[0] || null;

    const catInput = (category === undefined || category === null || String(category).trim() === '')
      ? (existing?.category || 'direct')
      : category;
    const cat = String(catInput || 'direct').trim().toLowerCase();
    const allowed = new Set(['direct', 'indirect', 'admin', 'meeting', 'other', 'tutoring', 'mileage', 'bonus', 'reimbursement', 'other_pay']);
    if (!allowed.has(cat)) {
      return res.status(400).json({
        error: { message: "category must be one of: direct, indirect, admin, meeting, other, tutoring, mileage, bonus, reimbursement, other_pay" }
      });
    }
    const slotRaw = (otherSlot === undefined || otherSlot === null || otherSlot === '')
      ? (existing?.other_slot ?? 1)
      : otherSlot;
    let slot = Number(slotRaw || 1);
    if (!Number.isFinite(slot) || slot < 1 || slot > 3) slot = 1;
    // Only meaningful for hourly "other" buckets.
    if (!(cat === 'other' || cat === 'tutoring')) slot = 1;

    const multRaw = (unitToHourMultiplier === undefined || unitToHourMultiplier === null || unitToHourMultiplier === '')
      ? (existing?.unit_to_hour_multiplier ?? 1)
      : unitToHourMultiplier;
    const mult = Number(multRaw ?? 1);
    if (!Number.isFinite(mult) || mult < 0) {
      return res.status(400).json({ error: { message: 'unitToHourMultiplier must be >= 0' } });
    }
    const durRaw = (durationMinutes === undefined)
      ? (existing?.duration_minutes ?? null)
      : durationMinutes;
    const dur = durRaw === null || durRaw === '' ? null : Number(durRaw);
    if (dur !== null && (!Number.isFinite(dur) || dur <= 0 || dur > 24 * 60)) {
      return res.status(400).json({ error: { message: 'durationMinutes must be a positive number of minutes (<= 1440)' } });
    }
    const pdRaw = (payDivisor === undefined || payDivisor === null || payDivisor === '')
      ? (existing?.pay_divisor ?? 1)
      : payDivisor;
    const pd = pdRaw === null || pdRaw === '' ? 1 : Number(pdRaw);
    if (!Number.isFinite(pd) || pd < 1) {
      return res.status(400).json({ error: { message: 'payDivisor must be an integer >= 1' } });
    }
    const pruRaw = (payRateUnit === undefined || payRateUnit === null || String(payRateUnit).trim() === '')
      ? (existing?.pay_rate_unit || 'per_unit')
      : payRateUnit;
    const pru = String(pruRaw || 'per_unit').trim().toLowerCase();
    const payUnit = (pru === 'per_hour') ? 'per_hour' : 'per_unit';
    const cvRaw = (creditValue === undefined || creditValue === null || creditValue === '')
      ? (existing?.credit_value ?? 0)
      : creditValue;
    const cv = cvRaw === null || cvRaw === '' ? 0 : Number(cvRaw);
    if (!Number.isFinite(cv) || cv < 0) {
      return res.status(400).json({ error: { message: 'creditValue must be a number >= 0' } });
    }
    const visRaw = (showInRateSheet === undefined || showInRateSheet === null)
      ? (existing?.show_in_rate_sheet ?? 1)
      : showInRateSheet;
    const vis = visRaw ? 1 : 0;
    const tcmRaw = (tierCreditMultiplier === undefined || tierCreditMultiplier === null || tierCreditMultiplier === '')
      ? (existing?.tier_credit_multiplier ?? 1)
      : tierCreditMultiplier;
    const tcm = tcmRaw === null || tcmRaw === '' ? 1 : Number(tcmRaw);
    if (!Number.isFinite(tcm) || tcm < 0 || tcm > 1) {
      return res.status(400).json({ error: { message: 'tierCreditMultiplier must be between 0 and 1' } });
    }
    await PayrollServiceCodeRule.upsert({
      agencyId: resolvedAgencyId,
      serviceCode: codeTrimmed,
      category: cat,
      otherSlot: slot,
      unitToHourMultiplier: mult,
      durationMinutes: dur,
      countsForTier: (countsForTier === undefined || countsForTier === null)
        ? (existing?.counts_for_tier === 0 ? 0 : 1)
        : (countsForTier === false || countsForTier === 0 ? 0 : 1),
      tierCreditMultiplier: tcm,
      payDivisor: Math.trunc(pd),
      payRateUnit: payUnit,
      creditValue: cv,
      showInRateSheet: vis
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const deleteServiceCodeRule = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : (req.body?.agencyId ? parseInt(req.body.agencyId) : null);
    const serviceCode = req.query.serviceCode || req.body?.serviceCode || null;
    if (!agencyId || !serviceCode) return res.status(400).json({ error: { message: 'agencyId and serviceCode are required' } });
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyId);
    if (!resolvedAgencyId) return;
    await PayrollServiceCodeRule.delete({ agencyId: resolvedAgencyId, serviceCode: String(serviceCode).trim() });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listPayrollRateTemplates = async (req, res, next) => {
  try {
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyId);
    if (!resolvedAgencyId) return;
    const rows = await PayrollRateTemplate.listForAgency(resolvedAgencyId);
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const createPayrollRateTemplateFromUser = async (req, res, next) => {
  try {
    const { agencyId, userId, name } = req.body || {};
    const agencyIdNum = agencyId ? parseInt(agencyId) : null;
    const userIdNum = userId ? parseInt(userId) : null;
    if (!agencyIdNum || !userIdNum || !name) {
      return res.status(400).json({ error: { message: 'agencyId, userId, and name are required' } });
    }
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyIdNum);
    if (!resolvedAgencyId) return;

    const trimmedName = String(name).trim();
    const existing = await PayrollRateTemplate.findByAgencyAndName({ agencyId: resolvedAgencyId, name: trimmedName });
    if (existing?.id) {
      return res.status(409).json({
        error: { message: `Template name already exists: "${trimmedName}". Please pick a different name or rename the existing template.` },
        existingTemplateId: existing.id
      });
    }

    const [rateCard, perCodeRates, rules] = await Promise.all([
      PayrollRateCard.findForUser(resolvedAgencyId, userIdNum),
      PayrollRate.listForUser(resolvedAgencyId, userIdNum),
      PayrollServiceCodeRule.listForAgency(resolvedAgencyId)
    ]);

    const isVariable = !rateCard; // Convention: no rate card => fee-for-service template
    const t = await PayrollRateTemplate.create({
      agencyId: resolvedAgencyId,
      name: trimmedName,
      isVariable: isVariable ? 1 : 0,
      directRate: Number(rateCard?.direct_rate || 0),
      indirectRate: Number(rateCard?.indirect_rate || 0),
      otherRate1: Number(rateCard?.other_rate_1 || 0),
      otherRate2: Number(rateCard?.other_rate_2 || 0),
      otherRate3: Number(rateCard?.other_rate_3 || 0),
      createdByUserId: req.user.id,
      updatedByUserId: req.user.id
    });

    const ruleByCode = new Map();
    for (const r of rules || []) {
      const code = String(r?.service_code || '').trim().toUpperCase();
      if (!code) continue;
      const visRaw = r?.show_in_rate_sheet;
      const vis = visRaw === undefined || visRaw === null ? 1 : (visRaw ? 1 : 0);
      ruleByCode.set(code, { showInRateSheet: vis });
    }

    await PayrollRateTemplateRate.replaceAllForTemplate({
      templateId: t.id,
      agencyId: resolvedAgencyId,
      rates: (perCodeRates || []).map((r) => ({
        serviceCode: r.service_code,
        rateAmount: Number(r.rate_amount || 0),
        rateUnit: r.rate_unit || 'per_unit',
        // Persist visibility as part of the template so applying it also hides/shows the same codes.
        showInRateSheet: (ruleByCode.get(String(r.service_code || '').trim().toUpperCase())?.showInRateSheet ?? 1)
      }))
    });

    const rates = await PayrollRateTemplateRate.listForTemplate(t.id);
    res.status(201).json({ template: t, rates });
  } catch (e) {
    next(e);
  }
};

export const deletePayrollRateTemplate = async (req, res, next) => {
  try {
    const templateId = parseInt(req.params.id);
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : (req.body?.agencyId ? parseInt(req.body.agencyId) : null);
    if (!templateId || !agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyId);
    if (!resolvedAgencyId) return;

    const t = await PayrollRateTemplate.findById(templateId);
    if (!t || t.agency_id !== resolvedAgencyId) return res.status(404).json({ error: { message: 'Template not found' } });

    await PayrollRateTemplate.deleteForAgency({ templateId, agencyId: resolvedAgencyId });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const renamePayrollRateTemplate = async (req, res, next) => {
  try {
    const templateId = parseInt(req.params.id);
    const { agencyId, name } = req.body || {};
    const agencyIdNum = agencyId ? parseInt(agencyId) : null;
    if (!agencyIdNum || !templateId || !name) return res.status(400).json({ error: { message: 'agencyId and name are required' } });
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyIdNum);
    if (!resolvedAgencyId) return;
    const updated = await PayrollRateTemplate.updateName({
      templateId,
      agencyId: resolvedAgencyId,
      name: String(name).trim(),
      updatedByUserId: req.user.id
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const getPayrollRateTemplate = async (req, res, next) => {
  try {
    const templateId = parseInt(req.params.id);
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    if (!agencyId || !templateId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyId);
    if (!resolvedAgencyId) return;
    const t = await PayrollRateTemplate.findById(templateId);
    if (!t || t.agency_id !== resolvedAgencyId) return res.status(404).json({ error: { message: 'Template not found' } });
    const rates = await PayrollRateTemplateRate.listForTemplate(templateId);
    res.json({ template: t, rates });
  } catch (e) {
    next(e);
  }
};

export const applyPayrollRateTemplateToUser = async (req, res, next) => {
  try {
    const templateId = parseInt(req.params.id);
    const { agencyId, userId } = req.body || {};
    const agencyIdNum = agencyId ? parseInt(agencyId) : null;
    const userIdNum = userId ? parseInt(userId) : null;
    if (!agencyIdNum || !userIdNum || !templateId) {
      return res.status(400).json({ error: { message: 'agencyId and userId are required' } });
    }
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyIdNum);
    if (!resolvedAgencyId) return;
    const t = await PayrollRateTemplate.findById(templateId);
    if (!t || t.agency_id !== resolvedAgencyId) return res.status(404).json({ error: { message: 'Template not found' } });
    const rates = await PayrollRateTemplateRate.listForTemplate(templateId);

    // Apply rate card behavior
    if (t.is_variable === 1 || t.is_variable === true) {
      await PayrollRateCard.deleteForUser(resolvedAgencyId, userIdNum);
    } else {
      await PayrollRateCard.upsert({
        agencyId: resolvedAgencyId,
        userId: userIdNum,
        directRate: Number(t.direct_rate || 0),
        indirectRate: Number(t.indirect_rate || 0),
        otherRate1: Number(t.other_rate_1 || 0),
        otherRate2: Number(t.other_rate_2 || 0),
        otherRate3: Number(t.other_rate_3 || 0),
        updatedByUserId: req.user.id
      });
    }

    // Replace per-code rates
    await PayrollRate.deleteAllForUser(resolvedAgencyId, userIdNum);
    for (const r of rates || []) {
      await PayrollRate.upsert({
        agencyId: resolvedAgencyId,
        userId: userIdNum,
        serviceCode: r.service_code,
        rateAmount: Number(r.rate_amount || 0),
        rateUnit: r.rate_unit || 'per_unit',
        effectiveStart: null,
        effectiveEnd: null
      });
    }

    // Also apply rate sheet visibility settings captured in the template (best-effort).
    // Visibility is stored on the agency-wide service code rules dictionary; only update codes present in the template.
    try {
      const desiredByCode = new Map();
      for (const r of rates || []) {
        const code = String(r?.service_code || '').trim().toUpperCase();
        if (!code) continue;
        if (r.show_in_rate_sheet === undefined || r.show_in_rate_sheet === null) continue; // older DB/template
        desiredByCode.set(code, r.show_in_rate_sheet ? 1 : 0);
      }
      const codes = Array.from(desiredByCode.keys());
      if (codes.length) {
        await ensureServiceCodeRulesExist({ agencyId: resolvedAgencyId, serviceCodes: codes });
        await Promise.all(
          codes.map((code) =>
            pool.execute(
              `UPDATE payroll_service_code_rules
               SET show_in_rate_sheet = ?
               WHERE agency_id = ? AND service_code = ?
               LIMIT 1`,
              [desiredByCode.get(code) ? 1 : 0, resolvedAgencyId, code]
            )
          )
        );
      }
    } catch {
      // Do not block template application if visibility updates fail or column doesn't exist yet.
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listUserPayroll = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    const rows = await PayrollSummary.listForUser({ userId, agencyId, limit: 100, offset: 0 });
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const requestAdpExport = async (req, res, next) => {
  try {
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    // Create a job record; attempt export if configured, otherwise mark failed with a clear message.
    const job = await PayrollAdpExportJob.create({
      payrollPeriodId,
      agencyId: period.agency_id,
      requestedByUserId: req.user.id,
      status: 'queued',
      provider: 'adp',
      requestPayload: { note: 'ADP export requested' }
    });

    try {
      const summaries = await PayrollSummary.listForPeriod(payrollPeriodId);
      const result = await AdpPayrollService.exportPeriod({
        agencyId: period.agency_id,
        payrollPeriodId,
        summaries
      });
      const updated = await PayrollAdpExportJob.update(job.id, { status: 'sent', responsePayload: result || { ok: true } });
      res.status(202).json(updated);
    } catch (e) {
      const updated = await PayrollAdpExportJob.update(job.id, {
        status: 'failed',
        errorMessage: e.message || 'ADP export failed',
        responsePayload: { code: e.code || 'ADP_ERROR' }
      });
      res.status(202).json(updated);
    }
  } catch (e) {
    next(e);
  }
};


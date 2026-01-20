import multer from 'multer';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import crypto from 'crypto';
import config from '../config/config.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import PayrollPeriod from '../models/PayrollPeriod.model.js';
import PayrollRate from '../models/PayrollRate.model.js';
import PayrollImport from '../models/PayrollImport.model.js';
import PayrollImportRow from '../models/PayrollImportRow.model.js';
import PayrollStagingOverride from '../models/PayrollStagingOverride.model.js';
import PayrollStageCarryover from '../models/PayrollStageCarryover.model.js';
import PayrollAdjustment from '../models/PayrollAdjustment.model.js';
import PayrollRateCard from '../models/PayrollRateCard.model.js';
import PayrollServiceCodeRule from '../models/PayrollServiceCodeRule.model.js';
import PayrollSummary from '../models/PayrollSummary.model.js';
import PayrollAdpExportJob from '../models/PayrollAdpExportJob.model.js';
import PayrollPeriodRun from '../models/PayrollPeriodRun.model.js';
import PayrollPeriodRunRow from '../models/PayrollPeriodRunRow.model.js';
import PayrollRateTemplate from '../models/PayrollRateTemplate.model.js';
import PayrollRateTemplateRate from '../models/PayrollRateTemplateRate.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencyMileageRate from '../models/AgencyMileageRate.model.js';
import PayrollMileageClaim from '../models/PayrollMileageClaim.model.js';
import PayrollMedcancelClaim from '../models/PayrollMedcancelClaim.model.js';
import PayrollMedcancelClaimItem from '../models/PayrollMedcancelClaimItem.model.js';
import PayrollReimbursementClaim from '../models/PayrollReimbursementClaim.model.js';
import PayrollCompanyCardExpense from '../models/PayrollCompanyCardExpense.model.js';
import PayrollTimeClaim from '../models/PayrollTimeClaim.model.js';
import PayrollPtoAccount from '../models/PayrollPtoAccount.model.js';
import PayrollPtoRequest from '../models/PayrollPtoRequest.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import pool from '../config/database.js';
import AdpPayrollService from '../services/adpPayroll.service.js';
import StorageService from '../services/storage.service.js';
import { getUserCompensationForAgency } from '../models/PayrollCompensation.service.js';
import { payrollDefaultsForCode } from '../services/payrollServiceCodeDefaults.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import { getDrivingDistanceMeters, metersToMiles } from '../services/googleDistance.service.js';
import NotificationService from '../services/notification.service.js';
import PayrollNotesAgingService from '../services/payrollNotesAging.service.js';
import {
  getAgencySupervisionPolicy,
  upsertAgencySupervisionPolicy,
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
  if (!tierLevel) return 'Out of Compliance';
  if (prevTierLevel && tierLevel < prevTierLevel && tierLevel >= 1) return 'Grace';
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

function titleCaseWords(s) {
  return String(s || '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function ensureUserForProviderName({ agencyId, providerName }) {
  const key = normalizeName(providerName);
  if (!key) return null;

  // Avoid creating obvious non-person placeholders / footer labels.
  const deny = new Set(['unassigned', 'unknown', 'total', 'grand total', 'summary']);
  if (deny.has(key)) return null;

  const parts = key.split(' ').filter(Boolean);
  if (parts.length < 2) return null;

  const last = titleCaseWords(parts[parts.length - 1]);
  const first = titleCaseWords(parts.slice(0, -1).join(' '));

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

function parsePayrollRows(records) {
  const rowsArr = Array.isArray(records) ? records : [];
  if (!rowsArr.length) return [];

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

    const noteStatusRaw =
      normalized['status'] ||
      normalized['note status'] ||
      normalized['note_status'] ||
      normalized['note'] ||
      '';

    const apptType =
      normalized['appt type'] ||
      normalized['appointment type'] ||
      normalized['appointment'] ||
      normalized['appt_type'] ||
      '';

    const paidStatus =
      normalized['paid status'] ||
      normalized['paid_status'] ||
      normalized['paid'] ||
      '';

    const amountRaw =
      normalized['amount'] ||
      normalized['amount collected'] ||
      normalized['amount_collected'] ||
      normalized['collected'] ||
      '';

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
    if (!providerName || !serviceCode) {
      const err = new Error(
        `Row ${idx + 2}: provider/clinician name and service code are required. ` +
          `Expected columns like "Clinician Name" (or "Provider Name") and "Service Code" (or "CPT Code").`
      );
      err.rowNumber = idx + 2;
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

    // Sanitize units: default empty/0 to 1.0 (counts the row).
    let unitCount = Number(String(unitsRaw).replace(/[^0-9.\\-]/g, '')) || 0;
    if (!unitCount || unitCount <= 0.0001) unitCount = 1;

    // Amount (currency-safe)
    let amountCollected = Number(String(amountRaw).replace(/[$,()]/g, '').trim());
    if (!Number.isFinite(amountCollected)) amountCollected = 0;
    amountCollected = Math.abs(amountCollected);

    // Missed appointment override
    const apptTypeStr = String(apptType || '');
    const paidStatusStr = String(paidStatus || '');
    let noteStatus = normalizeNoteStatus(noteStatusRaw);
    if (apptTypeStr.toLowerCase().includes('missed appointment') && amountCollected > 0 && paidStatusStr.toLowerCase().includes('paid in full')) {
      serviceCode = 'Missed Appt';
      unitCount = amountCollected * 0.5;
      noteStatus = 'FINALIZED';
    }

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
    const hdr = detectedHeaders.slice(0, 40).join(', ');
    throw new Error(
      `No rows found in report. Detected columns: ${hdr || '(none)'}`
    );
  }
  return out;
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

function computeRowFingerprint({ agencyId, userId, providerName, serviceCode, serviceDate, unitCount, noteStatus, fingerprintFields }) {
  const secret = process.env.PAYROLL_FINGERPRINT_SECRET || config.jwtSecret || 'dev-payroll-fingerprint-secret';
  const key = `${secret}:${agencyId}`;
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const parts = [
    `agency:${agencyId}`,
    `user:${userId || ''}`,
    `provider:${norm(providerName)}`,
    `code:${norm(serviceCode)}`,
    `dos:${ymdOrEmpty(serviceDate)}`,
    `units:${Number(unitCount || 0).toFixed(2)}`,
    `status:${norm(noteStatus)}`,
    `appt:${norm(fingerprintFields?.apptType)}`,
    `cnpi:${norm(fingerprintFields?.clinicianNpi)}`,
    `snpi:${norm(fingerprintFields?.supervisorNpi)}`,
    `bill:${norm(fingerprintFields?.billingMethod)}`,
    `pay:${norm(fingerprintFields?.paymentType)}`,
    `pos:${norm(fingerprintFields?.pos)}`,
    `loc:${norm(fingerprintFields?.location)}`,
    `rate:${norm(fingerprintFields?.rate)}`,
    `docs:${norm(fingerprintFields?.documentsCreated)}`,
    `m1:${norm(fingerprintFields?.modifier1)}`,
    `m2:${norm(fingerprintFields?.modifier2)}`,
    `m3:${norm(fingerprintFields?.modifier3)}`,
    `m4:${norm(fingerprintFields?.modifier4)}`
  ];
  return crypto.createHmac('sha256', key).update(parts.join('|')).digest('hex');
}

function parsePayrollFile(buffer, originalName) {
  const name = String(originalName || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) return [];
    const sheet = wb.Sheets[sheetName];
    const records = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    return parsePayrollRows(records);
  }

  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true
  });
  return parsePayrollRows(records);
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
        await PayrollPeriod.create({
          agencyId,
          label,
          periodStart,
          periodEnd,
          createdByUserId: req.user?.id
        });
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
    res.json({ period, rows, summaries });
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
    if (st === 'finalized' || st === 'posted') {
      return res.status(409).json({ error: { message: 'Pay period is posted/finalized' } });
    }

    // Draft payable toggle (draft rows only)
    if (wantsDraftPayable) {
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

    // Otherwise mark staged and clear any prior summaries.
    await pool.execute('DELETE FROM payroll_summaries WHERE payroll_period_id = ?', [period.id]);
    await pool.execute(
      `UPDATE payroll_periods
       SET status = 'staged',
           ran_at = NULL,
           ran_by_user_id = NULL,
           posted_at = NULL,
           posted_by_user_id = NULL,
           finalized_at = NULL,
           finalized_by_user_id = NULL
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
      'Units'
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
          r.unit_count ?? ''
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

    const header = [
      'Provider Name',
      'Tier Credits (Final)',
      'No Note Unpaid Units',
      'Draft Unpaid Units',
      'Total Unpaid Units',
      'Direct Credits/Hours',
      'Direct Amount',
      'Direct Effective Rate',
      'Indirect Credits/Hours',
      'Indirect Amount',
      'Indirect Effective Rate',
      'Other Credits/Hours',
      'Other Amount',
      'Other Effective Rate',
      'Total Credits/Hours',
      'Total Service Pay',
      'Total Effective Rate',
      'Mileage ($)',
      'MedCancel ($)',
      'Other Taxable ($)',
      'Bonus ($)',
      'Reimbursement ($)',
      'PTO Pay ($)',
      'Salary Override ($)',
      'Adjustments Total ($)',
      'Total Pay ($)',
      'Pay Period Start',
      'Pay Period End'
    ];

    const lines = [header.join(',')];
    const fmt2 = (n) => (Number(n || 0).toFixed(2));
    const safeNum = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

    for (const s of summaries || []) {
      const userId = Number(s.user_id);
      const fullName = `${s.first_name || ''} ${s.last_name || ''}`.trim();
      const noNoteUnpaid = safeNum(s.no_note_units || 0);
      const draftUnpaid = safeNum(s.draft_units || 0);
      const totalUnpaid = noNoteUnpaid + draftUnpaid;

      // Credits/Hours are stored in the *_hours columns.
      const totalCredits = safeNum(s.total_hours || 0);
      const directCredits = safeNum(s.direct_hours || 0);
      const indirectCredits = safeNum(s.indirect_hours || 0);
      const otherCreditsFromColumns = totalCredits - directCredits - indirectCredits;

      const adj = adjByUserId.get(userId) || {};
      const mileage = Number(adj.mileage_amount || 0);
      const medcancel = Number(adj.medcancel_amount || 0);
      const otherTaxable = Number(adj.other_taxable_amount || 0);
      const bonus = Number(adj.bonus_amount || 0);
      const reimbursement = Number(adj.reimbursement_amount || 0);
      const salary = Number(adj.salary_amount || 0);
      const ptoPay = Number(adj.pto_hours || 0) * Number(adj.pto_rate || 0);

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
          const cat = String(v.category || '').trim().toLowerCase();
          const bucket =
            (cat === 'indirect' || cat === 'admin' || cat === 'meeting') ? 'indirect'
              : (cat === 'other' || cat === 'tutoring') ? 'other'
                : (cat === 'mileage' || cat === 'bonus' || cat === 'reimbursement' || cat === 'other_pay') ? 'other'
                  : 'direct';
          const amt = safeNum(v.amount || 0);
          const creditsHours = safeNum(v.hours || 0);
          if (bucket === 'indirect') {
            indirectAmt += amt;
            indirectCreditsFromRows += creditsHours;
          } else if (bucket === 'other') {
            otherAmt += amt;
            otherCreditsFromRows += creditsHours;
          } else {
            directAmt += amt;
            directCreditsFromRows += creditsHours;
          }
        }
      }

      const servicePay = safeNum(s.subtotal_amount || 0);
      const adjustmentsTotal = safeNum(s.adjustments_amount || 0);
      const totalPay = safeNum(s.total_amount || 0);

      const directEff = directCreditsFromRows > 0 ? (directAmt / directCreditsFromRows) : 0;
      const indirectEff = indirectCreditsFromRows > 0 ? (indirectAmt / indirectCreditsFromRows) : 0;
      const otherEff = otherCreditsFromRows > 0 ? (otherAmt / otherCreditsFromRows) : 0;
      const totalEff = totalCredits > 0 ? (servicePay / totalCredits) : 0;

      const otherCredits = Number.isFinite(otherCreditsFromRows) && otherCreditsFromRows > 0
        ? otherCreditsFromRows
        : (Number.isFinite(otherCreditsFromColumns) ? otherCreditsFromColumns : 0);

      lines.push(
        [
          csvEscape(fullName),
          Number(s.tier_credits_final ?? s.tier_credits_current ?? 0),
          fmt2(noNoteUnpaid),
          fmt2(draftUnpaid),
          fmt2(totalUnpaid),
          fmt2(directCreditsFromRows || directCredits),
          fmt2(directAmt),
          fmt2(directEff),
          fmt2(indirectCreditsFromRows || indirectCredits),
          fmt2(indirectAmt),
          fmt2(indirectEff),
          fmt2(otherCredits),
          fmt2(otherAmt),
          fmt2(otherEff),
          fmt2(totalCredits),
          fmt2(servicePay),
          fmt2(totalEff),
          fmt2(mileage),
          fmt2(medcancel),
          fmt2(otherTaxable),
          fmt2(bonus),
          fmt2(reimbursement),
          fmt2(ptoPay),
          fmt2(salary),
          fmt2(adjustmentsTotal),
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
    const { agencyId, userId, serviceCode, rateAmount, rateUnit, effectiveStart, effectiveEnd } = req.body || {};
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
      rateUnit: rateUnit || 'per_unit',
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
      const lineAmount = (rate?.rate_unit === 'flat') ? rateAmount : units * rateAmount;

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
      const bucket =
        (category === 'indirect' || category === 'admin' || category === 'meeting') ? 'indirect'
          : (category === 'other' || category === 'tutoring') ? 'other'
            : (category === 'mileage' || category === 'bonus' || category === 'reimbursement' || category === 'other_pay') ? 'flat'
              : 'direct';
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
      const perCodeUnit = perCode ? String(perCode.rate_unit || 'per_unit') : null;
      if (perCode) {
        rateSource = 'per_code_rate';
        rateAmount = Number(perCode.rate_amount || 0);
      } else if (rateCard) {
        // For flat categories (bonus/mileage/etc), do NOT apply hourly rate card automatically.
        if (bucket !== 'flat') {
          rateSource = 'rate_card';
          if (bucket === 'indirect') rateAmount = Number(rateCard.indirect_rate || 0);
          else if (bucket === 'other') {
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
        if (perCode) {
          if (perCodeUnit === 'flat') return rateAmount;
          if (bucket !== 'flat') {
            // Per-code rates can be per-unit (fee-for-service) or per-hour (time-based).
            if (String(perCodeUnit || '').toLowerCase() === 'per_hour') return payHours * rateAmount;
            return units * rateAmount; // per_unit default
          }
          return units * rateAmount;
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
        otherSlot: (bucket === 'other') ? otherSlot : null,
        payDivisor: safeDivisor,
        creditValue: safeCreditValue,
        durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
        rateAmount,
        rateUnit: perCode ? (perCodeUnit || 'per_unit') : (rateSource === 'rate_card' ? 'per_hour' : 'per_unit'),
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
    let prevPeriodWeeklyAvg = 0;
    let graceActive = 0;
    let tierStatus = '';
    let displayBiWeeklyTotal = 0;
    let displayWeeklyAvg = 0;
    let displayTierLevel = 0;
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

      prevPeriodWeeklyAvg = await getImmediatePriorPeriodWeeklyAvg({
        agencyId,
        userId,
        periodStart,
        defaultWeeklyAvg: currentWeeklyAvg
      });
      graceActive = (prevPeriodWeeklyAvg > currentWeeklyAvg + 1e-9 && currentTierLevel >= 1) ? 1 : 0;
      tierStatus = graceActive
        ? `Grace (last pay period weekly avg ${Number(prevPeriodWeeklyAvg).toFixed(1)})`
        : tierStatusLabel({ tierLevel: currentTierLevel, prevTierLevel });
      // Display should reflect *current period* direct tier credits (Tier Credits (Final)), not rolling average.
      displayBiWeeklyTotal = tierCreditsCurrent;
      displayWeeklyAvg = displayBiWeeklyTotal / 2;
      displayTierLevel = tierLevelFromWeeklyAvg(displayWeeklyAvg, tierSettings.thresholds);
      tierLabel = fmtTierLabelCurrentPeriod({ tierLevel: displayTierLevel, biWeeklyTotal: displayBiWeeklyTotal, weeklyAvg: displayWeeklyAvg });

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
    const timeClaimsAmount = await PayrollTimeClaim.sumApprovedForPeriodUser({
      payrollPeriodId,
      agencyId,
      userId
    });
    const otherTaxableAmount = Number(adj?.other_taxable_amount || 0);
    const bonusAmount = Number(adj?.bonus_amount || 0);
    const salaryAmount = Number(adj?.salary_amount || 0);
    const sickPtoHours = Number(adj?.sick_pto_hours ?? 0);
    const trainingPtoHours = Number(adj?.training_pto_hours ?? 0);
    const legacyPtoHours = Number(adj?.pto_hours ?? 0);
    const ptoHours = (sickPtoHours + trainingPtoHours) > 0 ? (sickPtoHours + trainingPtoHours) : legacyPtoHours;
    const ptoRate = Number(adj?.pto_rate || 0);
    const ptoPay = ptoHours * ptoRate;

    const adjustmentsAmount = mileageAmount + medcancelAmount + otherTaxableAmount + bonusAmount + reimbursementAmount + timeClaimsAmount + ptoPay;
    const basePay = salaryAmount > 0.001 ? salaryAmount : subtotal;
    const totalAmount = basePay + adjustmentsAmount;

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
      timeClaimsAmount,
      otherTaxableAmount,
      bonusAmount,
      ptoHours,
      sickPtoHours,
      trainingPtoHours,
      ptoRate,
      ptoPay,
      salaryAmount,
      basePayIsSalaryOverride: salaryAmount > 0.001
    };

    breakdown.__carryover = {
      oldDoneNotesUnitsTotal
    };

    breakdown.__tier = {
      // Display fields (current period only; matches Tier Credits (Final))
      biWeeklyTotal: displayBiWeeklyTotal,
      weeklyAvg: displayWeeklyAvg,
      tierLevel: displayTierLevel,
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
      if (!req.file) return res.status(400).json({ error: { message: 'No CSV file uploaded' } });

      const agencyId = period.agency_id;
      let parsed = [];
      try {
        parsed = parsePayrollFile(req.file.buffer, req.file.originalname);
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
      if (!parsed || parsed.length === 0) {
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

      const nameToId = new Map();
      for (const u of agencyUsers || []) {
        const full = normalizeName(`${u.first_name || ''} ${u.last_name || ''}`);
        if (full) nameToId.set(full, u.id);
      }

      // Auto-create missing provider users so rows can be matched immediately.
      const createdUsers = [];
      const seen = new Set();
      for (const r of parsed || []) {
        const k = normalizeName(r.providerName);
        if (!k || nameToId.has(k) || seen.has(k)) continue;
        seen.add(k);
        const ensured = await ensureUserForProviderName({ agencyId, providerName: r.providerName });
        if (ensured?.userId) {
          nameToId.set(k, ensured.userId);
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

      const rowsToInsert = parsed.map((r) => {
        const key = normalizeName(r.providerName);
        const userId = nameToId.get(key) || null;
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
          userId,
          providerName: r.providerName,
          serviceCode: r.serviceCode,
          serviceDate: r.serviceDate,
          unitCount,
          noteStatus: r.noteStatus,
          fingerprintFields: r.fingerprintFields
        });
        return {
          payrollImportId: imp.id,
          payrollPeriodId,
          agencyId,
          userId,
          providerName: r.providerName,
          serviceCode: r.serviceCode,
          serviceDate: r.serviceDate ? formatYmd(r.serviceDate) : null,
          noteStatus: r.noteStatus,
          draftPayable: r.noteStatus === 'DRAFT' ? 1 : 1, // default payable for drafts; ignored otherwise
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
             ran_by_user_id = NULL,
             posted_at = NULL,
             posted_by_user_id = NULL,
             finalized_at = NULL,
             finalized_by_user_id = NULL
         WHERE id = ?`,
        [payrollPeriodId]
      );

      const unmatched = rowsToInsert.filter((r) => !r.userId).slice(0, 50);
      res.json({
        import: imp,
        inserted: rowsToInsert.length,
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
      try {
        parsed = parsePayrollFile(req.file.buffer, req.file.originalname);
      } catch (e) {
        return res.status(400).json({ error: { message: e.message || 'Failed to parse report' } });
      }
      if (!parsed || parsed.length === 0) {
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

      const nameToId = new Map();
      for (const u of agencyUsers || []) {
        const full = normalizeName(`${u.first_name || ''} ${u.last_name || ''}`);
        if (full) nameToId.set(full, u.id);
      }

      // Auto-create missing provider users so rows can be matched immediately.
      const createdUsers = [];
      const seen = new Set();
      for (const r of parsed || []) {
        const k = normalizeName(r.providerName);
        if (!k || nameToId.has(k) || seen.has(k)) continue;
        seen.add(k);
        const ensured = await ensureUserForProviderName({ agencyId: resolvedAgencyId, providerName: r.providerName });
        if (ensured?.userId) {
          nameToId.set(k, ensured.userId);
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

      const rowsToInsert = parsed.map((r) => {
        const key = normalizeName(r.providerName);
        const userId = nameToId.get(key) || null;
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
          userId,
          providerName: r.providerName,
          serviceCode: r.serviceCode,
          serviceDate: r.serviceDate,
          unitCount,
          noteStatus: r.noteStatus,
          fingerprintFields: r.fingerprintFields
        });
        return {
          payrollImportId: imp.id,
          payrollPeriodId: period.id,
          agencyId: resolvedAgencyId,
          userId,
          providerName: r.providerName,
          serviceCode: r.serviceCode,
          serviceDate: r.serviceDate ? formatYmd(r.serviceDate) : null,
          noteStatus: r.noteStatus,
          draftPayable: r.noteStatus === 'DRAFT' ? 1 : 1,
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
             ran_by_user_id = NULL,
             posted_at = NULL,
             posted_by_user_id = NULL,
             finalized_at = NULL,
             finalized_by_user_id = NULL
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
      try {
        parsed = parsePayrollFile(req.file.buffer, req.file.originalname);
      } catch (e) {
        return res.status(400).json({ error: { message: e.message || 'Failed to parse report' } });
      }
      if (!parsed || parsed.length === 0) {
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

    const supField = hasSupervisorPrivilegesCol ? ', u.has_supervisor_privileges' : '';
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.role${supField}
       FROM users u
       JOIN user_agencies ua ON u.id = ua.user_id
       WHERE ua.agency_id = ?
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

    // Load user names for matched rows.
    const idsFromAgg = (aggregates || []).map((a) => a.user_id).filter((x) => !!x);
    const idsFromCarry = (carryovers || []).map((c) => c.user_id).filter((x) => !!x);
    const userIds = Array.from(new Set([...idsFromAgg, ...idsFromCarry])).map((x) => parseInt(x));
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
      const carry = carryKey.get(`${a.user_id}:${a.service_code}`) || { oldDoneNotesUnits: 0 };
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
        carryover: carry,
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
        carryover: carry,
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
      const prevPeriodWeeklyAvg = await getImmediatePriorPeriodWeeklyAvg({
        agencyId: period.agency_id,
        userId: uid,
        periodStart: period.period_start,
        defaultWeeklyAvg: displayWeeklyAvg
      });
      const graceActive = (prevPeriodWeeklyAvg > displayWeeklyAvg + 1e-9 && displayTierLevel >= 1) ? 1 : 0;
      tierByUserId[uid] = {
        tierLevel: displayTierLevel,
        status: graceActive
          ? `Grace (last pay period weekly avg ${Number(prevPeriodWeeklyAvg).toFixed(1)})`
          : tierStatusLabel({ tierLevel: displayTierLevel, prevTierLevel: prevTier }),
        label: fmtTierLabelCurrentPeriod({ tierLevel: displayTierLevel, biWeeklyTotal: displayBiWeeklyTotal, weeklyAvg: displayWeeklyAvg }),
        biWeeklyTotal: displayBiWeeklyTotal,
        weeklyAvg: displayWeeklyAvg,
        rolling: {
          windowPeriods: windowCount,
          sum: windowSum,
          biWeeklyAvg,
          weeklyAvg,
          tierLevel,
          lastPayPeriodWeeklyAvg: prevPeriodWeeklyAvg,
          prev: { tierLevel: prevTier, weeklyAvg: prevWk, biWeeklyAvg: prevBi, sum: prevSum, windowPeriods: prevCount }
        }
      };
    }

    res.json({
      period,
      matched,
      unmatched,
      tierByUserId
    });
  } catch (e) {
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

    // Rule: If no-note/draft drops but finalized does NOT increase, do nothing.
    if (finalizedDelta <= 1e-9) continue;

    const unpaidDrop = Number((baseUnpaid - curUnpaid).toFixed(2));
    const hasUnpaidDrop = unpaidDrop > 1e-9;

    // Case A: Late note completion (unpaid decreased + finalized increased)
    if (hasUnpaidDrop) {
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
      continue;
    }

    // Case B: New session detected (finalized increased but there were no unpaid units to convert)
    deltas.push({
      userId: b.userId,
      serviceCode: b.serviceCode,
      prevUnpaidUnits: baseUnpaid,
      currUnpaidUnits: curUnpaid,
      prevFinalizedUnits: baseFinalized,
      currFinalizedUnits: curFinalized,
      finalizedDelta,
      carryoverFinalizedUnits: finalizedDelta,
      type: 'new_session_detected',
      flagged: 1
    });
  }
  return deltas;
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

    const baseRows = await PayrollPeriodRunRow.listForRun(baselineId);
    const curRows = await PayrollPeriodRunRow.listForRun(compareId);
    const deltas = computeRunToRunUnpaidDeltas({ baselineRows: baseRows, compareRows: curRows });

    // Enrich with user names.
    const userIds = Array.from(new Set(deltas.map((d) => d.userId))).map((x) => parseInt(x));
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

    res.json({
      title: 'No-note/Draft Unpaid',
      period,
      prior,
      baselineRunId: baselineId,
      compareRunId: compareId,
      deltas: out
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
    const requestRows = Array.isArray(req.body?.rows) ? req.body.rows : null;
    const hasRequestRows = !!(requestRows && requestRows.length);
    if (!priorPeriodId && !hasRequestRows) {
      return res.status(400).json({ error: { message: 'priorPeriodId is required (unless providing rows)' } });
    }

    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    if (!(await requirePayrollAccess(req, res, period.agency_id))) return;

    const st = String(period.status || '').toLowerCase();
    if (st === 'finalized' || st === 'posted') {
      return res.status(409).json({ error: { message: 'Pay period is posted/finalized' } });
    }

    // Gate: do not allow carryover apply if this period still has unprocessed H0031/H0032 rows
    // (unpaid NO_NOTE/DRAFT rows also must be corrected before they can be carried/paid).
    const pendingProcessingCount = await PayrollImportRow.countUnprocessedForPeriod({ payrollPeriodId });
    if (pendingProcessingCount > 0) {
      const sample = await PayrollImportRow.listUnprocessedForPeriod({ payrollPeriodId, limit: 50 });
      return res.status(409).json({
        error: {
          message: `Cannot apply carryover: ${pendingProcessingCount} H0031/H0032 row(s) require processing (minutes + Done) in the current pay period.`
        },
        pendingProcessing: { count: pendingProcessingCount, sample }
      });
    }

    let sourcePayrollPeriodId = null;
    if (priorPeriodId) {
      const prior = await PayrollPeriod.findById(priorPeriodId);
      if (!prior || prior.agency_id !== period.agency_id) {
        return res.status(404).json({ error: { message: 'Prior pay period not found for this agency' } });
      }
      sourcePayrollPeriodId = priorPeriodId;

      // Gate: do not allow carryover apply if the source period still has unprocessed required rows.
      const sourcePendingProcessingCount = await PayrollImportRow.countUnprocessedForPeriod({ payrollPeriodId: sourcePayrollPeriodId });
      if (sourcePendingProcessingCount > 0) {
        const sample = await PayrollImportRow.listUnprocessedForPeriod({ payrollPeriodId: sourcePayrollPeriodId, limit: 50 });
        return res.status(409).json({
          error: {
            message: `Cannot apply carryover: ${sourcePendingProcessingCount} H0031/H0032 row(s) require processing (minutes + Done) in the source pay period.`
          },
          pendingProcessing: { payrollPeriodId: sourcePayrollPeriodId, count: sourcePendingProcessingCount, sample }
        });
      }
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
        // H0031 carryover requires the source period processing workflow (minutes + Done).
        if (codeKey === 'H0031') {
          return res.status(409).json({
            error: { message: `Cannot apply manual carryover for ${codeKey}: these rows must be processed (minutes + Done) in their source pay period before carryover can be applied.` }
          });
        }
        if (codeKey === 'H0032') h0032ManualCarryoverUserIds.add(userId);
        if (!Number.isFinite(carry) || carry <= 1e-9) {
          return res.status(400).json({ error: { message: `rows[${i}].carryoverFinalizedUnits must be a positive number` } });
        }
        if (serviceCode.length > 64) {
          return res.status(400).json({ error: { message: `rows[${i}].serviceCode is too long` } });
        }
        userIds.add(userId);
        rows.push({
          userId,
          serviceCode,
          carryoverFinalizedUnits: Number(carry.toFixed(2))
        });
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
            return res.status(409).json({
              error: { message: 'Cannot apply manual carryover for H0032 Category-2 providers: these rows must be processed (minutes + Done) in their source pay period before carryover can be applied.' },
              pendingProcessing: { code: 'H0032', userIds: (hrows || []).map((x) => x.user_id) }
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
           ran_by_user_id = NULL,
           posted_at = NULL,
           posted_by_user_id = NULL,
           finalized_at = NULL,
           finalized_by_user_id = NULL
       WHERE id = ?`,
      [payrollPeriodId]
    );

    res.json({ ok: true, inserted: rows.length });
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
    const st = String(period.status || '').toLowerCase();
    if (st === 'finalized' || st === 'posted') {
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
           ran_by_user_id = NULL,
           posted_at = NULL,
           posted_by_user_id = NULL,
           finalized_at = NULL,
           finalized_by_user_id = NULL
       WHERE id = ?`,
      [payrollPeriodId]
    );

    res.json({ ok: true });
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

    const st = String(period.status || '').toLowerCase();
    if (st === 'posted' || st === 'finalized') {
      return res.status(409).json({ error: { message: 'Pay period is posted/finalized' } });
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
    if (pendingProcessingCount > 0) {
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

    await pool.execute(
      `UPDATE payroll_periods
       SET status = 'ran',
           ran_at = CURRENT_TIMESTAMP,
           ran_by_user_id = ?,
           posted_at = NULL,
           posted_by_user_id = NULL,
           finalized_at = NULL,
           finalized_by_user_id = NULL
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

    res.json(await PayrollPeriod.findById(payrollPeriodId));
  } catch (e) {
    next(e);
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
      bonus_amount: 0,
      reimbursement_amount: 0,
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
    const bonusAmount = toNum(body.bonusAmount);
    const reimbursementAmount = toNum(body.reimbursementAmount);
    const salaryAmount = toNum(body.salaryAmount);
    const ptoHours = toNum(body.ptoHours);
    const ptoRate = toNum(body.ptoRate);

    const nums = [mileageAmount, medcancelAmount, otherTaxableAmount, bonusAmount, reimbursementAmount, salaryAmount, ptoHours, ptoRate];
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
      bonusAmount,
      reimbursementAmount,
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
           ran_by_user_id = NULL,
           posted_at = NULL,
           posted_by_user_id = NULL,
           finalized_at = NULL,
           finalized_by_user_id = NULL
       WHERE id = ?`,
      [payrollPeriodId]
    );

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
        `SELECT home_street_address, home_city, home_state, home_postal_code
         FROM users WHERE id = ? LIMIT 1`,
        [userId]
      );
      const u = uRows?.[0] || {};
      const homeAddr = [u.home_street_address, u.home_city, u.home_state, u.home_postal_code].filter(Boolean).join(', ');
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
    const homeCity = body.homeCity ? String(body.homeCity).slice(0, 128) : null;
    const homeState = body.homeState ? String(body.homeState).slice(0, 64) : null;
    const homePostalCode = body.homePostalCode ? String(body.homePostalCode).slice(0, 32) : null;

    await pool.execute(
      `UPDATE users
       SET home_street_address = ?, home_city = ?, home_state = ?, home_postal_code = ?
       WHERE id = ?`,
      [homeStreetAddress, homeCity, homeState, homePostalCode, userId]
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
      `SELECT home_street_address, home_city, home_state, home_postal_code
       FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const u = rows?.[0] || {};
    res.json({
      homeStreetAddress: u.home_street_address || '',
      homeCity: u.home_city || '',
      homeState: u.home_state || '',
      homePostalCode: u.home_postal_code || ''
    });
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

      // Default: compute applied amount from rate card where possible; allow admin override.
      const rateCard = await PayrollRateCard.findForUser(claim.agency_id, claim.user_id);
      const computed = computeDefaultAppliedAmountForTimeClaim({ claim, rateCard });
      const override = body.appliedAmount === null || body.appliedAmount === undefined || body.appliedAmount === '' ? null : Number(body.appliedAmount);
      const appliedAmount = Number.isFinite(override) ? override : (computed ?? 0);
      if (!Number.isFinite(appliedAmount) || appliedAmount < 0) {
        return res.status(400).json({ error: { message: 'appliedAmount must be a non-negative number' } });
      }

      const updated = await PayrollTimeClaim.approve({
        id,
        approverUserId: req.user.id,
        targetPayrollPeriodId,
        appliedAmount
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
    res.json(card || { agency_id: resolvedAgencyId, user_id: userId, direct_rate: 0, indirect_rate: 0, other_rate_1: 0, other_rate_2: 0, other_rate_3: 0 });
  } catch (e) {
    next(e);
  }
};

export const upsertPayrollRateCard = async (req, res, next) => {
  try {
    const { agencyId, userId, directRate, indirectRate, otherRate1, otherRate2, otherRate3 } = req.body || {};
    if (!agencyId || !userId) return res.status(400).json({ error: { message: 'agencyId and userId are required' } });
    const agencyIdNum = parseInt(agencyId);
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyIdNum);
    if (!resolvedAgencyId) return;

    const toNum = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
    const payload = {
      agencyId: resolvedAgencyId,
      userId: parseInt(userId),
      directRate: toNum(directRate),
      indirectRate: toNum(indirectRate),
      otherRate1: toNum(otherRate1),
      otherRate2: toNum(otherRate2),
      otherRate3: toNum(otherRate3),
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
    const { agencyId, serviceCode, category, otherSlot, unitToHourMultiplier, countsForTier, durationMinutes, tierCreditMultiplier, payDivisor, creditValue, showInRateSheet } = req.body || {};
    if (!agencyId || !serviceCode) return res.status(400).json({ error: { message: 'agencyId and serviceCode are required' } });
    const agencyIdNum = parseInt(agencyId);
    const resolvedAgencyId = await requirePayrollAccess(req, res, agencyIdNum);
    if (!resolvedAgencyId) return;

    const cat = String(category || 'direct').trim().toLowerCase();
    const allowed = new Set(['direct', 'indirect', 'admin', 'meeting', 'other', 'tutoring', 'mileage', 'bonus', 'reimbursement', 'other_pay']);
    if (!allowed.has(cat)) {
      return res.status(400).json({
        error: { message: "category must be one of: direct, indirect, admin, meeting, other, tutoring, mileage, bonus, reimbursement, other_pay" }
      });
    }
    let slot = Number(otherSlot || 1);
    if (!Number.isFinite(slot) || slot < 1 || slot > 3) slot = 1;
    // Only meaningful for hourly "other" buckets.
    if (!(cat === 'other' || cat === 'tutoring')) slot = 1;

    const mult = Number(unitToHourMultiplier ?? 1);
    if (!Number.isFinite(mult) || mult < 0) {
      return res.status(400).json({ error: { message: 'unitToHourMultiplier must be >= 0' } });
    }
    const dur = durationMinutes === null || durationMinutes === undefined || durationMinutes === '' ? null : Number(durationMinutes);
    if (dur !== null && (!Number.isFinite(dur) || dur <= 0 || dur > 24 * 60)) {
      return res.status(400).json({ error: { message: 'durationMinutes must be a positive number of minutes (<= 1440)' } });
    }
    const pd = payDivisor === null || payDivisor === undefined || payDivisor === '' ? 1 : Number(payDivisor);
    if (!Number.isFinite(pd) || pd < 1) {
      return res.status(400).json({ error: { message: 'payDivisor must be an integer >= 1' } });
    }
    const cv = creditValue === null || creditValue === undefined || creditValue === '' ? 0 : Number(creditValue);
    if (!Number.isFinite(cv) || cv < 0) {
      return res.status(400).json({ error: { message: 'creditValue must be a number >= 0' } });
    }
    const vis = showInRateSheet === undefined || showInRateSheet === null ? 1 : (showInRateSheet ? 1 : 0);
    const tcm = tierCreditMultiplier === null || tierCreditMultiplier === undefined || tierCreditMultiplier === '' ? 1 : Number(tierCreditMultiplier);
    if (!Number.isFinite(tcm) || tcm < 0 || tcm > 1) {
      return res.status(400).json({ error: { message: 'tierCreditMultiplier must be between 0 and 1' } });
    }
    await PayrollServiceCodeRule.upsert({
      agencyId: resolvedAgencyId,
      serviceCode: String(serviceCode).trim(),
      category: cat,
      otherSlot: slot,
      unitToHourMultiplier: mult,
      durationMinutes: dur,
      countsForTier: countsForTier === false || countsForTier === 0 ? 0 : 1,
      tierCreditMultiplier: tcm,
      payDivisor: Math.trunc(pd),
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

    const [rateCard, perCodeRates] = await Promise.all([
      PayrollRateCard.findForUser(resolvedAgencyId, userIdNum),
      PayrollRate.listForUser(resolvedAgencyId, userIdNum)
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

    await PayrollRateTemplateRate.replaceAllForTemplate({
      templateId: t.id,
      agencyId: resolvedAgencyId,
      rates: (perCodeRates || []).map((r) => ({
        serviceCode: r.service_code,
        rateAmount: Number(r.rate_amount || 0),
        rateUnit: r.rate_unit || 'per_unit'
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


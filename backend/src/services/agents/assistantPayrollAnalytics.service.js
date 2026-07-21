/**
 * Payroll analytics for Ask Assistant (admin / super_admin / has_payroll_access).
 * Open-ended timeframes default to the last 4 schedule-aligned pay periods.
 */
import pool from '../../config/database.js';
import PayrollPeriod from '../../models/PayrollPeriod.model.js';
import PayrollRateCard from '../../models/PayrollRateCard.model.js';
import PayrollRate from '../../models/PayrollRate.model.js';
import { getPtoBalances } from '../payrollPto.service.js';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function ymd(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfYearYmd(ref = new Date()) {
  const x = ref instanceof Date ? ref : new Date(ref);
  return `${x.getFullYear()}-01-01`;
}

/** Monday-start calendar week containing today. */
function thisWeekRangeYmd(ref = new Date()) {
  const x = new Date(ref);
  x.setHours(12, 0, 0, 0);
  const day = x.getDay(); // 0 Sun .. 6 Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(x);
  mon.setDate(x.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { startDate: ymd(mon), endDate: ymd(sun) };
}

function weeksInRange(startDate, endDate) {
  if (!startDate || !endDate) return 1;
  const a = new Date(`${startDate}T12:00:00`);
  const b = new Date(`${endDate}T12:00:00`);
  const days = Math.max(1, Math.round((b - a) / 86400000) + 1);
  return Math.max(1, days / 7);
}

/**
 * Resolve which pay periods to use.
 * @returns {{ ok: true, periods, startDate, endDate, timeframe } | { ok: false, needsDateRange, prompt } | { ok: false, error }}
 */
export async function resolvePayrollWindow({
  agencyId,
  timeframe = 'last_4_periods',
  startDate = null,
  endDate = null,
  requireDatesIfCustom = false
} = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return { ok: false, error: 'agencyId is required' };

  let tf = String(timeframe || 'last_4_periods').trim().toLowerCase();
  let start = startDate && YMD_RE.test(String(startDate).slice(0, 10)) ? String(startDate).slice(0, 10) : null;
  let end = endDate && YMD_RE.test(String(endDate).slice(0, 10)) ? String(endDate).slice(0, 10) : null;

  if (tf === 'custom' || (requireDatesIfCustom && !start && !end && tf !== 'last_4_periods' && tf !== 'ytd' && tf !== 'last_period' && tf !== 'this_week')) {
    if (!start || !end) {
      return {
        ok: false,
        needsDateRange: true,
        prompt: 'What date range should I use? Reply with start and end dates (YYYY-MM-DD), or say “last 4 pay periods” or “year to date”.'
      };
    }
    tf = 'custom';
  }

  if (tf === 'this_week') {
    const w = thisWeekRangeYmd();
    start = w.startDate;
    end = w.endDate;
  } else if (tf === 'ytd') {
    start = startOfYearYmd();
    end = ymd();
  } else if (tf === 'last_period' || tf === 'last_4_periods') {
    // filled from periods below
  } else if (start && end) {
    tf = 'custom';
  } else if (!start && !end) {
    tf = 'last_4_periods';
  } else if (start && !end) {
    end = ymd();
    tf = 'custom';
  } else if (!start && end) {
    return {
      ok: false,
      needsDateRange: true,
      prompt: 'I have an end date — what start date should I use (YYYY-MM-DD)?'
    };
  }

  const all = await PayrollPeriod.listByAgency(aid, { limit: 80, offset: 0 });
  let candidates = (all || []).filter((p) => Number(p.schedule_aligned) === 1);
  if (!candidates.length) candidates = all || [];
  candidates.sort((a, b) => String(b.period_end || '').localeCompare(String(a.period_end || '')));

  let periods = [];
  if (tf === 'last_4_periods') {
    periods = candidates.slice(0, 4);
  } else if (tf === 'last_period') {
    periods = candidates.slice(0, 1);
  } else if (start && end) {
    periods = candidates.filter((p) => {
      const ps = String(p.period_start || '').slice(0, 10);
      const pe = String(p.period_end || '').slice(0, 10);
      return ps && pe && ps <= end && pe >= start;
    });
  }

  if (!periods.length && (tf === 'last_4_periods' || tf === 'last_period')) {
    return { ok: false, error: 'No pay periods found for this organization.' };
  }

  if (!start || !end) {
    if (periods.length) {
      const sortedAsc = [...periods].sort((a, b) => String(a.period_start || '').localeCompare(String(b.period_start || '')));
      start = String(sortedAsc[0].period_start || '').slice(0, 10);
      end = String(sortedAsc[sortedAsc.length - 1].period_end || '').slice(0, 10);
    }
  }

  return {
    ok: true,
    timeframe: tf,
    startDate: start,
    endDate: end,
    periods: periods.map((p) => ({
      id: Number(p.id),
      periodStart: String(p.period_start || '').slice(0, 10),
      periodEnd: String(p.period_end || '').slice(0, 10),
      status: String(p.status || '')
    })),
    periodCount: periods.length
  };
}

export async function resolvePersonInAgency({ agencyId, userId = null, personName = null }) {
  const aid = Number(agencyId || 0);
  const uid = Number(userId || 0);
  if (uid > 0) {
    const [rows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role,
              u.benefits_notes, u.benefits_enrollment_json
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE u.id = ?
       LIMIT 1`,
      [aid, uid]
    );
    const u = rows?.[0];
    if (!u) return { ok: false, error: `User #${uid} not found in this organization.` };
    return {
      ok: true,
      user: {
        id: Number(u.id),
        name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email,
        role: u.role,
        benefitsNotes: u.benefits_notes || null,
        benefitsEnrollment: safeJson(u.benefits_enrollment_json),
        benefitsEligibilityOverrides: null
      }
    };
  }

  const q = String(personName || '').trim();
  if (!q) return { ok: false, error: 'personName or userId is required for this question.' };

  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role,
            u.benefits_notes, u.benefits_enrollment_json
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?
            OR CONCAT_WS(' ', u.first_name, u.last_name) LIKE ?)
       AND (u.is_archived IS NULL OR u.is_archived = FALSE)
       AND (u.is_active IS NULL OR u.is_active = TRUE)
     ORDER BY u.last_name, u.first_name
     LIMIT 8`,
    [aid, like, like, like, like]
  );

  if (!(rows || []).length) {
    return { ok: false, error: `No staff member matching “${q}” in this organization.` };
  }
  if (rows.length > 1) {
    return {
      ok: false,
      needsPersonDisambiguation: true,
      matches: rows.map((u) => ({
        id: Number(u.id),
        name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
        role: u.role,
        email: u.email
      })),
      prompt: `I found ${rows.length} people matching “${q}”. Which one did you mean?`
    };
  }

  const u = rows[0];
  return {
    ok: true,
    user: {
      id: Number(u.id),
      name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      email: u.email,
      role: u.role,
      benefitsNotes: u.benefits_notes || null,
      benefitsEnrollment: safeJson(u.benefits_enrollment_json),
      benefitsEligibilityOverrides: null
    }
  };
}

function safeJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

async function latestImportIdsForPeriods(periodIds) {
  const ids = (periodIds || []).map((n) => Number(n)).filter((n) => n > 0);
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT pi.payroll_period_id, pi.id
     FROM payroll_imports pi
     INNER JOIN (
       SELECT payroll_period_id, MAX(id) AS max_id
       FROM payroll_imports
       WHERE payroll_period_id IN (${placeholders})
       GROUP BY payroll_period_id
     ) t ON t.max_id = pi.id`,
    ids
  );
  const map = new Map();
  for (const r of rows || []) {
    map.set(Number(r.payroll_period_id), Number(r.id));
  }
  return map;
}

async function countSessions({ agencyId, userId = null, serviceCode = null, periodIds = [], startDate = null, endDate = null }) {
  const importMap = await latestImportIdsForPeriods(periodIds);
  const importIds = Array.from(importMap.values());
  if (!importIds.length) {
    // Fall back to date window on all rows for agency if no period imports
    if (!startDate || !endDate) return { sessions: 0, units: 0 };
  }

  const where = ['pir.agency_id = ?'];
  const params = [agencyId];

  if (importIds.length) {
    where.push(`pir.payroll_import_id IN (${importIds.map(() => '?').join(',')})`);
    params.push(...importIds);
  } else {
    where.push('pir.service_date BETWEEN ? AND ?');
    params.push(startDate, endDate);
  }

  if (userId) {
    where.push('pir.user_id = ?');
    params.push(userId);
  } else {
    where.push('pir.user_id IS NOT NULL');
  }

  if (serviceCode) {
    where.push('UPPER(TRIM(pir.service_code)) = ?');
    params.push(String(serviceCode).trim().toUpperCase());
  }

  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS sessions, COALESCE(SUM(pir.unit_count), 0) AS units
     FROM payroll_import_rows pir
     WHERE ${where.join(' AND ')}`,
    params
  );
  return {
    sessions: Number(rows?.[0]?.sessions || 0),
    units: Number(Number(rows?.[0]?.units || 0).toFixed(2))
  };
}

async function countIncompleteNotes({ agencyId, userId = null, periodIds = [] }) {
  const importMap = await latestImportIdsForPeriods(periodIds);
  const importIds = Array.from(importMap.values());
  if (!importIds.length) return { noNoteNotes: 0, draftNotes: 0, totalNotes: 0, byPeriod: [] };

  const where = [
    'pir.agency_id = ?',
    `pir.payroll_import_id IN (${importIds.map(() => '?').join(',')})`,
    `(
      UPPER(TRIM(pir.note_status)) = 'NO_NOTE'
      OR (UPPER(TRIM(pir.note_status)) = 'DRAFT' AND COALESCE(pir.draft_payable, 1) = 0)
    )`
  ];
  const params = [agencyId, ...importIds];
  if (userId) {
    where.push('pir.user_id = ?');
    params.push(userId);
  }

  const [rows] = await pool.execute(
    `SELECT
       pir.payroll_period_id,
       SUM(CASE WHEN UPPER(TRIM(pir.note_status)) = 'NO_NOTE' THEN 1 ELSE 0 END) AS noNoteNotes,
       SUM(CASE WHEN UPPER(TRIM(pir.note_status)) = 'DRAFT' AND COALESCE(pir.draft_payable, 1) = 0 THEN 1 ELSE 0 END) AS draftNotes
     FROM payroll_import_rows pir
     WHERE ${where.join(' AND ')}
     GROUP BY pir.payroll_period_id`,
    params
  );

  let noNoteNotes = 0;
  let draftNotes = 0;
  const byPeriod = [];
  for (const r of rows || []) {
    const nn = Number(r.noNoteNotes || 0);
    const dr = Number(r.draftNotes || 0);
    noNoteNotes += nn;
    draftNotes += dr;
    byPeriod.push({
      payrollPeriodId: Number(r.payroll_period_id),
      noNoteNotes: nn,
      draftNotes: dr,
      totalNotes: nn + dr
    });
  }
  return { noNoteNotes, draftNotes, totalNotes: noNoteNotes + draftNotes, byPeriod };
}

async function sumPay({ agencyId, userId = null, periodIds = [], statuses = ['posted', 'finalized', 'ran'] }) {
  if (!periodIds.length) return { totalPay: 0, byUser: [] };
  const placeholders = periodIds.map(() => '?').join(',');
  const statusPh = statuses.map(() => '?').join(',');
  const params = [agencyId, ...periodIds, ...statuses];
  let userClause = '';
  if (userId) {
    userClause = ' AND ps.user_id = ?';
    params.push(userId);
  }
  const [rows] = await pool.execute(
    `SELECT ps.user_id,
            u.first_name, u.last_name,
            COALESCE(SUM(ps.total_amount), 0) AS total_pay,
            COALESCE(SUM(ps.no_note_units), 0) AS no_note_units
     FROM payroll_summaries ps
     JOIN payroll_periods pp ON pp.id = ps.payroll_period_id
     LEFT JOIN users u ON u.id = ps.user_id
     WHERE ps.agency_id = ?
       AND ps.payroll_period_id IN (${placeholders})
       AND LOWER(pp.status) IN (${statusPh})
       ${userClause}
     GROUP BY ps.user_id, u.first_name, u.last_name
     ORDER BY total_pay DESC`,
    params
  );
  const byUser = (rows || []).map((r) => ({
    userId: Number(r.user_id),
    name: `${r.last_name || ''}, ${r.first_name || ''}`.replace(/^,\s*|,\s*$/g, '') || `User #${r.user_id}`,
    totalPay: Number(Number(r.total_pay || 0).toFixed(2)),
    noNoteUnits: Number(Number(r.no_note_units || 0).toFixed(2))
  }));
  const totalPay = byUser.reduce((a, r) => a + Number(r.totalPay || 0), 0);
  return { totalPay: Number(totalPay.toFixed(2)), byUser };
}

async function topByDistinctClients({ agencyId, periodIds = [], limit = 5 }) {
  const importMap = await latestImportIdsForPeriods(periodIds);
  const importIds = Array.from(importMap.values());
  if (!importIds.length) return [];

  const [rows] = await pool.execute(
    `SELECT
       pir.user_id,
       u.first_name,
       u.last_name,
       COUNT(*) AS sessions,
       COUNT(DISTINCT CONCAT(
         COALESCE(pir.patient_first_name, ''),
         '|',
         COALESCE(DATE_FORMAT(pir.service_date, '%Y-%m-%d'), ''),
         '|',
         COALESCE(pir.service_code, '')
       )) AS client_proxy_sessions,
       COUNT(DISTINCT LOWER(TRIM(COALESCE(pir.patient_first_name, '')))) AS distinct_clients
     FROM payroll_import_rows pir
     LEFT JOIN users u ON u.id = pir.user_id
     WHERE pir.agency_id = ?
       AND pir.payroll_import_id IN (${importIds.map(() => '?').join(',')})
       AND pir.user_id IS NOT NULL
       AND TRIM(COALESCE(pir.patient_first_name, '')) <> ''
     GROUP BY pir.user_id, u.first_name, u.last_name
     ORDER BY distinct_clients DESC, sessions DESC
     LIMIT ${Math.max(1, Math.min(25, parseInt(limit, 10) || 5))}`,
    [agencyId, ...importIds]
  );

  return (rows || []).map((r) => ({
    userId: Number(r.user_id),
    name: `${r.last_name || ''}, ${r.first_name || ''}`.replace(/^,\s*|,\s*$/g, '') || `User #${r.user_id}`,
    distinctClients: Number(r.distinct_clients || 0),
    sessions: Number(r.sessions || 0)
  }));
}

async function topSessionsInDateRange({ agencyId, startDate, endDate, limit = 5 }) {
  if (!startDate || !endDate) return [];
  const [rows] = await pool.execute(
    `SELECT
       pir.user_id,
       u.first_name,
       u.last_name,
       COUNT(*) AS sessions,
       COALESCE(SUM(pir.unit_count), 0) AS units
     FROM payroll_import_rows pir
     LEFT JOIN users u ON u.id = pir.user_id
     WHERE pir.agency_id = ?
       AND pir.user_id IS NOT NULL
       AND pir.service_date BETWEEN ? AND ?
     GROUP BY pir.user_id, u.first_name, u.last_name
     ORDER BY sessions DESC
     LIMIT ${Math.max(1, Math.min(25, parseInt(limit, 10) || 5))}`,
    [agencyId, startDate, endDate]
  );
  return (rows || []).map((r) => ({
    userId: Number(r.user_id),
    name: `${r.last_name || ''}, ${r.first_name || ''}`.replace(/^,\s*|,\s*$/g, '') || `User #${r.user_id}`,
    sessions: Number(r.sessions || 0),
    units: Number(Number(r.units || 0).toFixed(2))
  }));
}

/**
 * Main entry for queryPayrollAnalytics tool.
 */
export async function runPayrollAnalyticsQuery({ agencyId, args = {} } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return { ok: false, error: 'agencyId is required' };

  const intent = String(args.intent || '').trim().toLowerCase();
  const limit = Math.max(1, Math.min(25, parseInt(args.limit, 10) || 5));
  const serviceCode = args.serviceCode ? String(args.serviceCode).trim().toUpperCase() : null;
  const timeframe = String(args.timeframe || 'last_4_periods').trim().toLowerCase();
  const startDate = args.startDate || null;
  const endDate = args.endDate || null;
  const requireDatesIfCustom = !!args.requireDatesIfCustom
    || timeframe === 'custom'
    || (!!args.needsDateRangeHint);

  const personIntents = new Set([
    'sessions',
    'incomplete_notes',
    'ytd_pay',
    'avg_weekly_pay',
    'avg_weekly_sessions',
    'no_notes_last_period',
    'no_notes_average',
    'rates',
    'pto',
    'benefits'
  ]);

  let person = null;
  if (personIntents.has(intent)) {
    const resolved = await resolvePersonInAgency({
      agencyId: aid,
      userId: args.userId,
      personName: args.personName
    });
    if (!resolved.ok) return resolved;
    person = resolved.user;
  }

  // Intents that don't need a period window
  if (intent === 'pto') {
    const bal = await getPtoBalances({ agencyId: aid, userId: person.id });
    return {
      ok: true,
      intent,
      person: { id: person.id, name: person.name },
      asOf: ymd(),
      pto: {
        sickHours: Number(bal?.balances?.sickHours || 0),
        trainingHours: Number(bal?.balances?.trainingHours || 0),
        trainingEligible: bal?.account ? !!bal.account.training_pto_eligible : null
      }
    };
  }

  if (intent === 'benefits') {
    return {
      ok: true,
      intent,
      person: { id: person.id, name: person.name },
      benefits: {
        notes: person.benefitsNotes,
        enrollment: person.benefitsEnrollment,
        eligibilityOverrides: person.benefitsEligibilityOverrides
      }
    };
  }

  if (intent === 'rates') {
    const card = await PayrollRateCard.findForUser(aid, person.id);
    const perCode = await PayrollRate.listForUser(aid, person.id);
    let codeRate = null;
    if (serviceCode) {
      const match = (perCode || []).find((r) => String(r.service_code || '').toUpperCase() === serviceCode);
      codeRate = match
        ? {
            serviceCode,
            rateAmount: Number(match.rate_amount || 0),
            rateUnit: match.rate_unit || 'per_unit',
            payPercent: match.pay_percent != null ? Number(match.pay_percent) : null
          }
        : { serviceCode, rateAmount: null, note: 'No per-code rate; falls back to direct/indirect rate card.' };
    }
    return {
      ok: true,
      intent,
      person: { id: person.id, name: person.name },
      rateCard: {
        directRate: Number(card?.direct_rate || 0),
        indirectRate: Number(card?.indirect_rate || 0),
        otherRate1: Number(card?.other_rate_1 || 0),
        otherRate2: Number(card?.other_rate_2 || 0),
        otherRate3: Number(card?.other_rate_3 || 0),
        percentPayEnabled: !!(card?.percent_pay_enabled)
      },
      serviceCodeRate: codeRate,
      perCodeRates: (perCode || []).slice(0, 40).map((r) => ({
        serviceCode: r.service_code,
        rateAmount: Number(r.rate_amount || 0),
        rateUnit: r.rate_unit || 'per_unit',
        payPercent: r.pay_percent != null ? Number(r.pay_percent) : null
      }))
    };
  }

  // Windowed intents
  const effectiveTimeframe = intent === 'ytd_pay' && (!timeframe || timeframe === 'last_4_periods')
    ? 'ytd'
    : (intent === 'no_notes_last_period' ? 'last_period'
      : (intent === 'top_sessions_week' ? 'this_week' : timeframe));

  const window = await resolvePayrollWindow({
    agencyId: aid,
    timeframe: effectiveTimeframe,
    startDate,
    endDate,
    requireDatesIfCustom
  });
  if (!window.ok) return window;

  const periodIds = (window.periods || []).map((p) => p.id);

  if (intent === 'sessions' || intent === 'avg_weekly_sessions') {
    const counts = await countSessions({
      agencyId: aid,
      userId: person.id,
      serviceCode,
      periodIds,
      startDate: window.startDate,
      endDate: window.endDate
    });
    const weeks = weeksInRange(window.startDate, window.endDate);
    return {
      ok: true,
      intent,
      person: { id: person.id, name: person.name },
      serviceCode: serviceCode || 'ALL',
      window: { timeframe: window.timeframe, startDate: window.startDate, endDate: window.endDate, periodCount: window.periodCount },
      sessions: counts.sessions,
      units: counts.units,
      avgSessionsPerWeek: Number((counts.sessions / weeks).toFixed(2))
    };
  }

  if (intent === 'incomplete_notes' || intent === 'no_notes_last_period' || intent === 'no_notes_average') {
    const notes = await countIncompleteNotes({ agencyId: aid, userId: person.id, periodIds });
    const periodCount = Math.max(1, window.periodCount || notes.byPeriod.length || 1);
    return {
      ok: true,
      intent,
      person: { id: person.id, name: person.name },
      window: { timeframe: window.timeframe, startDate: window.startDate, endDate: window.endDate, periodCount: window.periodCount },
      noNoteNotes: notes.noNoteNotes,
      draftNotes: notes.draftNotes,
      totalIncompleteNotes: notes.totalNotes,
      averageNoNotesPerPeriod: Number((notes.noNoteNotes / periodCount).toFixed(2)),
      byPeriod: notes.byPeriod
    };
  }

  if (intent === 'ytd_pay' || intent === 'avg_weekly_pay') {
    const pay = await sumPay({
      agencyId: aid,
      userId: person.id,
      periodIds,
      statuses: intent === 'ytd_pay' ? ['posted', 'finalized'] : ['posted', 'finalized', 'ran']
    });
    const weeks = weeksInRange(window.startDate, window.endDate);
    return {
      ok: true,
      intent,
      person: { id: person.id, name: person.name },
      window: { timeframe: window.timeframe, startDate: window.startDate, endDate: window.endDate, periodCount: window.periodCount },
      totalPay: pay.totalPay,
      avgPayPerWeek: Number((pay.totalPay / weeks).toFixed(2))
    };
  }

  if (intent === 'top_pay') {
    const pay = await sumPay({
      agencyId: aid,
      periodIds,
      statuses: ['posted', 'finalized', 'ran']
    });
    return {
      ok: true,
      intent,
      window: { timeframe: window.timeframe, startDate: window.startDate, endDate: window.endDate, periodCount: window.periodCount },
      top: (pay.byUser || []).slice(0, limit)
    };
  }

  if (intent === 'top_clients') {
    const top = await topByDistinctClients({ agencyId: aid, periodIds, limit });
    return {
      ok: true,
      intent,
      window: { timeframe: window.timeframe, startDate: window.startDate, endDate: window.endDate, periodCount: window.periodCount },
      top,
      note: 'Clients approximated as distinct patient first-name tokens on billing import rows.'
    };
  }

  if (intent === 'top_sessions_week') {
    const top = await topSessionsInDateRange({
      agencyId: aid,
      startDate: window.startDate,
      endDate: window.endDate,
      limit
    });
    return {
      ok: true,
      intent,
      window: { timeframe: 'this_week', startDate: window.startDate, endDate: window.endDate },
      top
    };
  }

  return {
    ok: false,
    error: `Unknown intent “${intent}”. Use one of: sessions, incomplete_notes, ytd_pay, avg_weekly_pay, avg_weekly_sessions, no_notes_last_period, no_notes_average, rates, pto, benefits, top_pay, top_clients, top_sessions_week.`
  };
}

export default {
  resolvePayrollWindow,
  resolvePersonInAgency,
  runPayrollAnalyticsQuery
};

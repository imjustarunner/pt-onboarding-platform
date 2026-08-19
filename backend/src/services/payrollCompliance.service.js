/**
 * Payroll Compliance digest: late notes + psychotherapy session limits.
 * Used by the payroll wizard Compliance step.
 */
import pool from '../config/database.js';
import PayrollPeriod from '../models/PayrollPeriod.model.js';
import PayrollImportRow from '../models/PayrollImportRow.model.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import NotificationEvent from '../models/NotificationEvent.model.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { createNotificationAndDispatch } from './notificationDispatcher.service.js';

export const PSYCHOTHERAPY_CODES = new Set([
  '90832', '90833', '90834', '90836', '90837', '90838',
  '90839', '90840', '90846', '90847', '90849', '90853'
]);

export const PSYCHOTHERAPY_MIN_SERVICE_YMD = '2025-07-01';
export const COMPLIANCE_UNLOCK_PERIOD_START = '2026-08-15';
export const COMPLIANCE_UNLOCK_PERIOD_END = '2026-08-28';
export const SESSION_LIMIT_THRESHOLDS = [20, 24, 30, 40];

/** Fiscal year Jul 1 – Jun 30. Returns YYYY-07-01 for the FY containing the date. */
export function computeFiscalYearStartJulYmd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getUTCFullYear();
  const month = dt.getUTCMonth() + 1;
  const startYear = month >= 7 ? y : y - 1;
  return `${startYear}-07-01`;
}

function ymd(v) {
  return String(v || '').slice(0, 10);
}

function formatShortDate(ymdStr) {
  const s = ymd(ymdStr);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  return `${m}/${d}`;
}

function periodLabel(p) {
  const a = ymd(p?.period_start);
  const b = ymd(p?.period_end);
  return a && b ? `${a} → ${b}` : (a || b || `Period #${p?.id}`);
}

function isOutstandingNote(row) {
  const st = String(row?.note_status || '').trim().toUpperCase();
  if (st === 'NO_NOTE') return true;
  if (st === 'DRAFT' && Number(row?.draft_payable ?? 1) === 0) return true;
  return false;
}

function lateNoteLineLabel(row) {
  const date = formatShortDate(row.service_date);
  const client = String(row.patient_first_name || '').trim();
  const code = String(row.service_code || '').trim();
  const appt = String(row.appt_type || '').trim();
  if (client && appt) return `${date} - ${client} (${appt})`;
  if (client && code) return `${date} - ${client} (${code})`;
  if (appt && code) return `${date} - ${code} ${appt}`;
  if (code && /99414/i.test(code)) return `${date} - ${code} Supervision Session`;
  if (code) return `${date} - ${code}${appt ? ` ${appt}` : ''}`;
  return `${date} - Outstanding note`;
}

function thresholdMessage({ threshold, total, clientLabel, perCode }) {
  const breakdown = Object.entries(perCode || {})
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([code, count]) => `${code} (${count})`)
    .join(' ');
  const label = clientLabel || 'Client';
  const base = `${label}${breakdown ? ` ${breakdown}` : ''} total (${total})`;
  if (threshold === 20) {
    return (
      `${base}\n\n` +
      'This client is 4 psychotherapy services away from 24. Please plan to re-evaluate medical necessity for ongoing treatment as defined in Colorado Code of Regulations (CCR) ' +
      '10 CCR 2505-10 8.076.1.8 and 10 CCR 2505-10 8.280.4.E. (for children) due to senate bill 22-156.'
    );
  }
  if (threshold === 24) {
    return (
      `${base}\n\n` +
      'This client has reached 24 psychotherapy services. Please ensure you re-evaluate or have re-evaluated medical necessity for treatment for ongoing services as defined in Colorado Code of Regulations (CCR) ' +
      '10 CCR 2505-10 8.076.1.8 and 10 CCR 2505-10 8.280.4.E. (for children) due to senate bill 22-156.'
    );
  }
  if (threshold === 30) {
    return (
      `${base}\n\n` +
      'URGENT: This client has reached 30 psychotherapy services. Ongoing services without documented clinical medical necessity require immediate attention under Colorado Code of Regulations (CCR) ' +
      '10 CCR 2505-10 8.076.1.8 and 10 CCR 2505-10 8.280.4.E. (for children) due to senate bill 22-156.'
    );
  }
  return (
    `${base}\n\n` +
    'CRITICAL: This client has reached 40 psychotherapy services. Clinical medical necessity for ongoing treatment must be addressed immediately under Colorado Code of Regulations (CCR) ' +
    '10 CCR 2505-10 8.076.1.8 and 10 CCR 2505-10 8.280.4.E. (for children) due to senate bill 22-156.'
  );
}

export async function isPayrollComplianceUnlocked(agencyId) {
  const aid = Number(agencyId);
  if (!aid) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT payroll_compliance_unlocked_at FROM agencies WHERE id = ? LIMIT 1`,
      [aid]
    );
    return !!rows?.[0]?.payroll_compliance_unlocked_at;
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') return false;
    throw e;
  }
}

export function periodMatchesComplianceUnlock(period) {
  return (
    ymd(period?.period_start) === COMPLIANCE_UNLOCK_PERIOD_START &&
    ymd(period?.period_end) === COMPLIANCE_UNLOCK_PERIOD_END
  );
}

export async function maybeUnlockPayrollCompliance({ agencyId, period }) {
  const aid = Number(agencyId);
  if (!aid || !period) return { unlocked: await isPayrollComplianceUnlocked(aid), justUnlocked: false };
  if (await isPayrollComplianceUnlocked(aid)) {
    return { unlocked: true, justUnlocked: false };
  }
  if (!periodMatchesComplianceUnlock(period)) {
    return { unlocked: false, justUnlocked: false };
  }
  try {
    await pool.execute(
      `UPDATE agencies
       SET payroll_compliance_unlocked_at = COALESCE(payroll_compliance_unlocked_at, CURRENT_TIMESTAMP)
       WHERE id = ?`,
      [aid]
    );
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') return { unlocked: false, justUnlocked: false };
    throw e;
  }
  return { unlocked: true, justUnlocked: true };
}

async function listPriorPeriodsWithImports({ agencyId, currentPeriod, limit = 8 }) {
  const periods = await PayrollPeriod.listByAgency(Number(agencyId), { limit: 80, offset: 0 });
  const currentStart = ymd(currentPeriod.period_start);
  const list = (periods || [])
    .filter((p) => ymd(p.period_start) <= currentStart)
    .sort((a, b) => ymd(b.period_end).localeCompare(ymd(a.period_end)));
  const out = [];
  for (const p of list.slice(0, limit)) {
    const rows = await PayrollImportRow.listForPeriod(p.id);
    if (rows?.length) out.push({ period: p, rows });
  }
  return out;
}

async function listSessionLimitItems({ agencyId, mutedClientIds = new Set() }) {
  const fyStart = computeFiscalYearStartJulYmd(new Date());
  const startYear = Number(fyStart.slice(0, 4));
  const fyEnd = `${startYear + 1}-06-30`;
  const effectiveStart = fyStart < PSYCHOTHERAPY_MIN_SERVICE_YMD ? PSYCHOTHERAPY_MIN_SERVICE_YMD : fyStart;

  const codeList = [...PSYCHOTHERAPY_CODES];
  const ph = codeList.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT
       be.provider_user_id,
       be.client_id,
       c.full_name AS client_name,
       c.initials AS client_initials,
       be.service_code,
       COUNT(*) AS code_count
     FROM billing_encounters be
     LEFT JOIN clients c ON c.id = be.client_id
     WHERE be.agency_id = ?
       AND be.provider_user_id IS NOT NULL
       AND be.service_date >= ?
       AND be.service_date <= ?
       AND UPPER(TRIM(be.service_code)) IN (${ph})
     GROUP BY be.provider_user_id, be.client_id, c.full_name, c.initials, be.service_code`,
    [Number(agencyId), effectiveStart, fyEnd, ...codeList]
  );

  const byKey = new Map();
  for (const r of rows || []) {
    const providerUserId = Number(r.provider_user_id || 0);
    const clientId = Number(r.client_id || 0);
    if (!providerUserId || !clientId) continue;
    const k = `${providerUserId}|${clientId}`;
    if (!byKey.has(k)) {
      byKey.set(k, {
        providerUserId,
        clientId,
        clientLabel: String(r.client_initials || r.client_name || `Client #${clientId}`).trim(),
        fiscalYearStart: fyStart,
        perCode: {},
        total: 0,
        muted: mutedClientIds.has(clientId)
      });
    }
    const rec = byKey.get(k);
    const code = String(r.service_code || '').trim().toUpperCase();
    const n = Number(r.code_count || 0);
    rec.perCode[code] = (rec.perCode[code] || 0) + n;
    rec.total += n;
  }

  const items = [];
  for (const rec of byKey.values()) {
    let highest = null;
    for (const t of SESSION_LIMIT_THRESHOLDS) {
      if (rec.total >= t) highest = t;
    }
    if (!highest) continue;
    items.push({
      id: `sl:${rec.providerUserId}:${rec.clientId}:${highest}`,
      providerUserId: rec.providerUserId,
      clientId: rec.clientId,
      clientLabel: rec.clientLabel,
      fiscalYearStart: rec.fiscalYearStart,
      total: rec.total,
      threshold: highest,
      perCode: rec.perCode,
      muted: !!rec.muted,
      message: thresholdMessage({
        threshold: highest,
        total: rec.total,
        clientLabel: rec.clientLabel,
        perCode: rec.perCode
      })
    });
  }
  return items;
}

async function listMutes({ agencyId }) {
  try {
    const [rows] = await pool.execute(
      `SELECT provider_user_id, client_id, mute_type
       FROM agency_compliance_notification_mutes
       WHERE agency_id = ? AND mute_type = 'session_limit'`,
      [Number(agencyId)]
    );
    return rows || [];
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

export async function setSessionLimitMute({
  agencyId,
  providerUserId,
  clientId,
  muted,
  mutedByUserId
}) {
  const aid = Number(agencyId);
  const pid = Number(providerUserId);
  const cid = Number(clientId);
  if (!aid || !pid || !cid) {
    const err = new Error('agencyId, providerUserId, and clientId are required');
    err.status = 400;
    throw err;
  }
  if (muted) {
    await pool.execute(
      `INSERT INTO agency_compliance_notification_mutes
         (agency_id, provider_user_id, client_id, mute_type, muted_by_user_id)
       VALUES (?, ?, ?, 'session_limit', ?)
       ON DUPLICATE KEY UPDATE muted_by_user_id = VALUES(muted_by_user_id), muted_at = CURRENT_TIMESTAMP`,
      [aid, pid, cid, mutedByUserId || null]
    );
  } else {
    await pool.execute(
      `DELETE FROM agency_compliance_notification_mutes
       WHERE agency_id = ? AND provider_user_id = ? AND client_id = ? AND mute_type = 'session_limit'`,
      [aid, pid, cid]
    );
  }
  return { ok: true, muted: !!muted };
}

async function resolveSupervisors(providerUserId, agencyId) {
  const ids = await SupervisorAssignment.getSupervisorIds(providerUserId, agencyId);
  if (!ids?.length) return [];
  const ph = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, first_name, last_name, email
     FROM users
     WHERE id IN (${ph}) AND email IS NOT NULL AND TRIM(email) <> ''`,
    ids
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
    email: String(r.email || '').trim()
  }));
}

export async function buildComplianceDigest({ agencyId, payrollPeriodId }) {
  const period = await PayrollPeriod.findById(payrollPeriodId);
  if (!period || Number(period.agency_id) !== Number(agencyId)) {
    const err = new Error('Pay period not found');
    err.status = 404;
    throw err;
  }

  const unlock = await maybeUnlockPayrollCompliance({ agencyId, period });
  if (!unlock.unlocked) {
    return {
      unlocked: false,
      unlockPeriod: {
        periodStart: COMPLIANCE_UNLOCK_PERIOD_START,
        periodEnd: COMPLIANCE_UNLOCK_PERIOD_END
      },
      providers: []
    };
  }

  const mutes = await listMutes({ agencyId });
  const mutedByProvider = new Map(); // providerId -> Set(clientId)
  for (const m of mutes) {
    const pid = Number(m.provider_user_id);
    const cid = Number(m.client_id);
    if (!mutedByProvider.has(pid)) mutedByProvider.set(pid, new Set());
    mutedByProvider.get(pid).add(cid);
  }

  const periodBundles = await listPriorPeriodsWithImports({ agencyId, currentPeriod: period });
  const byProvider = new Map();

  const ensureProvider = (userId, meta = {}) => {
    const id = Number(userId || 0);
    if (!id) return null;
    if (!byProvider.has(id)) {
      byProvider.set(id, {
        userId: id,
        firstName: meta.firstName || '',
        lastName: meta.lastName || '',
        email: meta.email || null,
        name: `${meta.firstName || ''} ${meta.lastName || ''}`.trim() || meta.providerName || `User #${id}`,
        lateNotesByPeriod: [],
        sessionLimits: [],
        supervisors: []
      });
    } else {
      const p = byProvider.get(id);
      if (!p.email && meta.email) p.email = meta.email;
      if ((!p.firstName || !p.lastName) && (meta.firstName || meta.lastName)) {
        p.firstName = meta.firstName || p.firstName;
        p.lastName = meta.lastName || p.lastName;
        p.name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.name;
      }
    }
    return byProvider.get(id);
  };

  // Prefetch emails for providers on late-note rows
  const userIds = new Set();
  for (const bundle of periodBundles) {
    for (const row of bundle.rows || []) {
      if (row.user_id && isOutstandingNote(row)) userIds.add(Number(row.user_id));
    }
  }
  const emailByUser = new Map();
  if (userIds.size) {
    const ids = [...userIds];
    const ph = ids.map(() => '?').join(',');
    const [urows] = await pool.execute(
      `SELECT id, first_name, last_name, email FROM users WHERE id IN (${ph})`,
      ids
    );
    for (const u of urows || []) {
      emailByUser.set(Number(u.id), u);
    }
  }

  for (const bundle of periodBundles) {
    const outstanding = (bundle.rows || []).filter(isOutstandingNote);
    if (!outstanding.length) continue;
    const byUserRows = new Map();
    for (const row of outstanding) {
      const uid = Number(row.user_id || 0);
      if (!uid) continue;
      if (!byUserRows.has(uid)) byUserRows.set(uid, []);
      byUserRows.get(uid).push(row);
    }
    for (const [uid, rows] of byUserRows.entries()) {
      const u = emailByUser.get(uid) || {};
      const prov = ensureProvider(uid, {
        firstName: u.first_name || rowFirst(rows, 'first_name'),
        lastName: u.last_name || rowFirst(rows, 'last_name'),
        email: u.email || null,
        providerName: rows[0]?.provider_name
      });
      if (!prov) continue;
      prov.lateNotesByPeriod.push({
        payrollPeriodId: Number(bundle.period.id),
        periodStart: ymd(bundle.period.period_start),
        periodEnd: ymd(bundle.period.period_end),
        periodLabel: periodLabel(bundle.period),
        rows: rows
          .sort((a, b) => ymd(a.service_date).localeCompare(ymd(b.service_date)))
          .map((r) => ({
            id: Number(r.id),
            serviceDate: ymd(r.service_date),
            serviceCode: r.service_code,
            apptType: r.appt_type || null,
            patientFirstName: r.patient_first_name || null,
            noteStatus: r.note_status,
            draftPayable: r.draft_payable,
            label: lateNoteLineLabel(r)
          }))
      });
    }
  }

  const sessionItems = await listSessionLimitItems({ agencyId, mutedClientIds: new Set() });
  for (const item of sessionItems) {
    const mutedSet = mutedByProvider.get(item.providerUserId) || new Set();
    item.muted = mutedSet.has(item.clientId);
    let prov = byProvider.get(item.providerUserId);
    if (!prov) {
      const [urows] = await pool.execute(
        `SELECT id, first_name, last_name, email FROM users WHERE id = ? LIMIT 1`,
        [item.providerUserId]
      );
      const u = urows?.[0] || {};
      prov = ensureProvider(item.providerUserId, {
        firstName: u.first_name,
        lastName: u.last_name,
        email: u.email
      });
    }
    if (prov) prov.sessionLimits.push(item);
  }

  const providers = [];
  for (const prov of byProvider.values()) {
    if (!prov.lateNotesByPeriod.length && !prov.sessionLimits.length) continue;
    prov.supervisors = await resolveSupervisors(prov.userId, agencyId);
    if (!prov.email) {
      const [urows] = await pool.execute(
        `SELECT email, first_name, last_name FROM users WHERE id = ? LIMIT 1`,
        [prov.userId]
      );
      if (urows?.[0]) {
        prov.email = urows[0].email || null;
        prov.firstName = urows[0].first_name || prov.firstName;
        prov.lastName = urows[0].last_name || prov.lastName;
        prov.name = `${prov.firstName || ''} ${prov.lastName || ''}`.trim() || prov.name;
      }
    }
    providers.push(prov);
  }

  providers.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return {
    unlocked: true,
    justUnlocked: !!unlock.justUnlocked,
    period: {
      id: Number(period.id),
      periodStart: ymd(period.period_start),
      periodEnd: ymd(period.period_end),
      label: periodLabel(period)
    },
    providers
  };
}

function rowFirst(rows, field) {
  for (const r of rows || []) {
    if (r?.[field]) return r[field];
  }
  return '';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildComplianceEmailBody({
  provider,
  excludedRowIds = new Set(),
  excludedClientKeys = new Set(),
  includeLateNotes = true,
  includeSessionLimits = true
}) {
  const excludedRows = excludedRowIds instanceof Set
    ? excludedRowIds
    : new Set((excludedRowIds || []).map(Number));
  const excludedClients = excludedClientKeys instanceof Set
    ? excludedClientKeys
    : new Set((excludedClientKeys || []).map(String));

  const lateLines = [];
  if (includeLateNotes) {
    for (const group of provider.lateNotesByPeriod || []) {
      const kept = (group.rows || []).filter((r) => !excludedRows.has(Number(r.id)));
      if (!kept.length) continue;
      lateLines.push(`Pay period ${group.periodLabel}:`);
      for (const r of kept) lateLines.push(r.label);
      lateLines.push('');
    }
  }

  const sessionLines = [];
  if (includeSessionLimits) {
    for (const item of provider.sessionLimits || []) {
      if (item.muted) continue;
      const key = `${item.providerUserId}:${item.clientId}`;
      if (excludedClients.has(key) || excludedClients.has(String(item.clientId))) continue;
      sessionLines.push(item.message);
      sessionLines.push('');
    }
  }

  if (!lateLines.length && !sessionLines.length) {
    return { subject: null, text: null, html: null, hasContent: false };
  }

  const parts = [];
  if (lateLines.length) {
    parts.push(
      'Below are notes showing as outstanding in Therapy Notes. Please prioritize completing the following notes ASAP.',
      '',
      ...lateLines
    );
  }
  if (sessionLines.length) {
    if (parts.length) parts.push('---', '');
    parts.push('Psychotherapy session limits:', '', ...sessionLines);
  }
  parts.push('Compliance Team');

  const text = parts.filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n').trim() + '\n';
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.5">${
    text
      .split('\n')
      .map((line) => (line ? escapeHtml(line) : '<br/>'))
      .join('<br/>')
  }</div>`;

  const subjectBits = [];
  if (lateLines.length) subjectBits.push('Late notes');
  if (sessionLines.length) subjectBits.push('Session limits');
  const subject = `Compliance: ${subjectBits.join(' & ') || 'Update'} — ${provider.name || 'Provider'}`;

  return { subject, text, html, hasContent: true };
}

export async function previewComplianceEmail({
  agencyId,
  payrollPeriodId,
  userId,
  excludedRowIds = [],
  excludedClientKeys = [],
  includeLateNotes = true,
  includeSessionLimits = true
}) {
  const digest = await buildComplianceDigest({ agencyId, payrollPeriodId });
  if (!digest.unlocked) {
    const err = new Error('Compliance is not unlocked for this agency yet');
    err.status = 403;
    throw err;
  }
  const provider = (digest.providers || []).find((p) => Number(p.userId) === Number(userId));
  if (!provider) {
    const err = new Error('No compliance items for this provider');
    err.status = 404;
    throw err;
  }
  const body = buildComplianceEmailBody({
    provider,
    excludedRowIds,
    excludedClientKeys,
    includeLateNotes,
    includeSessionLimits
  });
  return {
    provider: {
      userId: provider.userId,
      name: provider.name,
      email: provider.email,
      supervisors: provider.supervisors
    },
    ...body
  };
}

export async function sendComplianceEmail({
  agencyId,
  payrollPeriodId,
  userId,
  excludedRowIds = [],
  excludedClientKeys = [],
  includeLateNotes = true,
  includeSessionLimits = true,
  generatedByUserId = null
}) {
  const preview = await previewComplianceEmail({
    agencyId,
    payrollPeriodId,
    userId,
    excludedRowIds,
    excludedClientKeys,
    includeLateNotes,
    includeSessionLimits
  });
  if (!preview.hasContent) {
    const err = new Error('Nothing selected to send for this provider');
    err.status = 400;
    throw err;
  }
  if (!preview.provider?.email) {
    const err = new Error('Provider has no email address');
    err.status = 400;
    throw err;
  }

  const identity =
    (await EmailSenderIdentity.findByAgencyAndIdentityKey(agencyId, 'compliance')) ||
    (await EmailSenderIdentity.findByFromEmail('Compliance@ITSCO.health', { preferAgencyId: agencyId }));
  if (!identity) {
    const err = new Error('Compliance sender identity is not configured for this agency');
    err.status = 409;
    throw err;
  }

  const cc = (preview.provider.supervisors || [])
    .map((s) => s.email)
    .filter(Boolean)
    .filter((e) => e.toLowerCase() !== String(preview.provider.email).toLowerCase());

  // Auditable send marker (allows intentional re-sends; unique key includes timestamp bucket)
  const stamp = new Date().toISOString().slice(0, 16);
  await NotificationEvent.tryCreate({
    agencyId: Number(agencyId),
    triggerKey: `compliance_digest_send|period:${payrollPeriodId}|user:${userId}|at:${stamp}`,
    providerUserId: Number(userId),
    recipientUserId: Number(userId)
  }).catch(() => {});

  const result = await sendEmailFromIdentity({
    senderIdentityId: identity.id,
    to: preview.provider.email,
    cc: cc.length ? cc : null,
    subject: preview.subject,
    text: preview.text,
    html: preview.html,
    source: 'auto',
    generatedByUserId,
    userId: Number(userId),
    templateType: 'compliance_digest'
  });

  return {
    ok: true,
    result,
    to: preview.provider.email,
    cc,
    subject: preview.subject
  };
}

/**
 * After billing ingest: notify providers who crossed 20/24/30/40 thresholds.
 * Supervisor is notified via createNotificationAndDispatch audience when available;
 * email CC is handled by the wizard digest path.
 */
export async function notifyPsychotherapyThresholdsFromEncounters({ agencyId }) {
  const items = await listSessionLimitItems({ agencyId, mutedClientIds: new Set() });
  const mutes = await listMutes({ agencyId });
  const muted = new Set(mutes.map((m) => `${m.provider_user_id}:${m.client_id}`));

  let attempted = 0;
  let created = 0;
  for (const item of items) {
    if (muted.has(`${item.providerUserId}:${item.clientId}`)) continue;
    // Fire for each crossed threshold (deduped per threshold)
    for (const t of SESSION_LIMIT_THRESHOLDS) {
      if (item.total < t) continue;
      attempted += 1;
      const triggerKey =
        `psychotherapy_threshold_${t}|fy:${item.fiscalYearStart}|client:${item.clientId}|provider:${item.providerUserId}`;
      const ok = await NotificationEvent.tryCreate({
        agencyId: Number(agencyId),
        triggerKey,
        providerUserId: item.providerUserId,
        recipientUserId: item.providerUserId
      });
      if (!ok) continue;

      const msg = thresholdMessage({
        threshold: t,
        total: item.total,
        clientLabel: item.clientLabel,
        perCode: item.perCode
      });

      const severity = t >= 40 ? 'critical' : t >= 30 ? 'error' : t >= 24 ? 'warning' : 'info';
      await createNotificationAndDispatch(
        {
          type: 'psychotherapy_threshold_exceeded',
          severity,
          title:
            t === 20
              ? 'Approaching psychotherapy session limit'
              : t === 24
                ? 'Psychotherapy threshold reached (24)'
                : t === 30
                  ? 'Psychotherapy threshold escalated (30)'
                  : 'Psychotherapy threshold critical (40)',
          message: msg,
          userId: item.providerUserId,
          agencyId: Number(agencyId),
          relatedEntityType: 'client',
          relatedEntityId: item.clientId,
          actorSource: 'System'
        },
        { context: { isUrgent: t >= 30 } }
      );

      // Also notify supervisors in-app
      const supervisors = await resolveSupervisors(item.providerUserId, agencyId);
      for (const s of supervisors) {
        await createNotificationAndDispatch(
          {
            type: 'psychotherapy_threshold_exceeded',
            severity,
            title: `Supervisee: psychotherapy threshold ${t}`,
            message: msg,
            userId: s.id,
            agencyId: Number(agencyId),
            relatedEntityType: 'client',
            relatedEntityId: item.clientId,
            actorSource: 'System'
          },
          { context: { isUrgent: t >= 30 } }
        ).catch(() => {});
      }

      created += 1;
    }
  }
  return { attempted, created };
}

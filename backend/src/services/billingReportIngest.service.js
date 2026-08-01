import crypto from 'crypto';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import {
  encryptBillingSecret,
  decryptBillingSecret,
  isBillingEncryptionConfigured
} from './billingEncryption.service.js';
import { getClientStatusIdByKey } from '../utils/clientStatusCatalog.js';
import { seedClientAffiliations } from '../utils/clientProvisioning.js';
import { recordProviderAssignmentChange } from './officeClientAcceptance.service.js';
import ReceivablesReportUpload from '../models/ReceivablesReportUpload.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';

const CHUNK = 200;

function getKeyMaterial() {
  const b64 =
    process.env.BILLING_ENCRYPTION_KEY_BASE64 ||
    process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;
  if (!b64) return null;
  const buf = Buffer.from(b64, 'base64');
  return buf.length === 32 ? buf : null;
}

function hmacHex(keyMaterial, payload) {
  return crypto.createHmac('sha256', keyMaterial).update(String(payload || ''), 'utf8').digest('hex');
}

export function normalizeHeaderKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function safeMoney(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function parseServiceDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const mm = parseInt(m[1], 10);
    const dd = parseInt(m[2], 10);
    let yy = parseInt(m[3], 10);
    if (yy < 100) yy = 2000 + yy;
    const d = new Date(Date.UTC(yy, mm - 1, dd));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatYmd(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Fiscal year Aug 1 – Jul 31. Returns YYYY-08-01 for the FY containing the date. */
export function computeFiscalYearStartAugYmd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getUTCFullYear();
  const month = dt.getUTCMonth() + 1;
  const startYear = month >= 8 ? y : y - 1;
  return `${startYear}-08-01`;
}

export function normalizeNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseHumanNameToFirstLast(raw) {
  const s = String(raw || '').trim();
  if (!s) return { first: '', last: '' };
  if (s.includes(',')) {
    const [lastPart, firstPart] = s.split(',').map((x) => String(x || '').trim());
    const firstTokens = normalizeNameKey(firstPart).split(' ').filter(Boolean);
    const lastTokens = normalizeNameKey(lastPart).split(' ').filter(Boolean);
    return { first: firstTokens[0] || '', last: lastTokens[lastTokens.length - 1] || '' };
  }
  const parts = normalizeNameKey(s).split(' ').filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts[parts.length - 1] };
}

function initialsFromName(raw) {
  const { first, last } = parseHumanNameToFirstLast(raw);
  const a = (first || '').slice(0, 3);
  const b = (last || '').slice(0, 3);
  const title = (s) => (s ? s.slice(0, 1).toUpperCase() + s.slice(1).toLowerCase() : '');
  const out = `${title(a)}${title(b)}`.trim();
  return out || 'Cli';
}

function nameKeyCandidates(raw) {
  const { first, last } = parseHumanNameToFirstLast(raw);
  const out = new Set();
  if (first && last) {
    out.add(normalizeNameKey(`${first} ${last}`));
    out.add(normalizeNameKey(`${last} ${first}`));
  }
  const full = normalizeNameKey(raw);
  if (full) out.add(full);
  return Array.from(out).filter(Boolean);
}

function getFirst(n, keys) {
  for (const k of keys) {
    const v = n?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}

function firstMatchByRegexes(n, regexes) {
  for (const [k, v] of Object.entries(n || {})) {
    if (!k || v === undefined || v === null || String(v).trim() === '') continue;
    for (const rx of regexes || []) {
      if (rx?.test?.(k)) return v;
    }
  }
  return null;
}

function moneyFromRow(n, keys, regexes = []) {
  const raw = getFirst(n, keys) ?? firstMatchByRegexes(n, regexes);
  return safeMoney(raw);
}

export function deriveBillingOutstandingAmounts({
  chargeRate = 0,
  patientAmount = 0,
  patientResponsibility = 0,
  patientBalance = 0,
  insuranceAmount = 0,
  insuranceAmountPaid = 0,
  insuranceOutstanding = 0,
  primaryPayer = ''
} = {}) {
  const charge = safeMoney(chargeRate);
  const patientPaid = safeMoney(patientAmount);
  let patientOwed = safeMoney(patientBalance);
  let insuranceBilled = safeMoney(insuranceAmount);
  const insurancePaid = safeMoney(insuranceAmountPaid);
  let insuranceOwed = safeMoney(insuranceOutstanding);
  const responsibility = safeMoney(patientResponsibility);
  const payerLower = String(primaryPayer || '').toLowerCase();
  const isSelfPay =
    !!primaryPayer &&
    /self[\s-]*pay|private[\s-]*pay|cash|patient[\s-]*pay|out[\s-]*of[\s-]*pocket|\boop\b/i.test(payerLower);

  if (!patientOwed && responsibility > 0) {
    patientOwed = Math.max(0, Math.round((responsibility - patientPaid) * 100) / 100);
  }

  if (!insuranceBilled && charge > 0 && (insurancePaid > 0 || !isSelfPay)) {
    insuranceBilled = charge;
  }

  if (!insuranceOwed && insuranceBilled > 0) {
    insuranceOwed = Math.max(0, Math.round((insuranceBilled - insurancePaid) * 100) / 100);
  }

  let totalRemaining = Math.max(
    0,
    Math.round((charge - patientPaid - insurancePaid - patientOwed - insuranceOwed) * 100) / 100
  );

  if (totalRemaining > 0.009) {
    if (isSelfPay) {
      patientOwed = Math.max(patientOwed, totalRemaining);
    } else {
      if (!insuranceBilled) insuranceBilled = charge;
      insuranceOwed = Math.max(insuranceOwed, totalRemaining);
    }
    totalRemaining = Math.max(
      0,
      Math.round((charge - patientPaid - insurancePaid - patientOwed - insuranceOwed) * 100) / 100
    );
    if (totalRemaining > 0.009) {
      insuranceOwed = Math.max(insuranceOwed, totalRemaining);
    }
  }

  return {
    patientBalance: patientOwed,
    insuranceAmount: insuranceBilled,
    insuranceOutstanding: insuranceOwed
  };
}

function encToCols(enc) {
  if (!enc) return { ciphertextB64: null, ivB64: null, authTagB64: null, keyId: null };
  return {
    ciphertextB64: enc.ciphertextB64,
    ivB64: enc.ivB64,
    authTagB64: enc.authTagB64,
    keyId: enc.keyId
  };
}

export function parseBillingReportFile(buffer, originalName) {
  const name = String(originalName || '').toLowerCase();
  let records = [];
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    records = XLSX.utils.sheet_to_json(ws, { defval: '' });
  } else {
    const txt = buffer.toString('utf8');
    const delimiterCandidates = [',', '\t', ';', '|'];
    let best = { delim: ',', count: 0 };
    for (const d of delimiterCandidates) {
      const c = (txt.split('\n')[0] || '').split(d).length;
      if (c > best.count) best = { delim: d, count: c };
    }
    records = parse(txt, {
      columns: true,
      skip_empty_lines: true,
      delimiter: best.delim,
      relax_quotes: true
    });
  }
  const normalizedRows = [];
  for (const raw of records || []) {
    const n = {};
    for (const [k, v] of Object.entries(raw || {})) n[normalizeHeaderKey(k)] = v;
    normalizedRows.push(n);
  }
  return normalizedRows;
}

export function computeLineFingerprint({
  agencyId,
  serviceDateYmd,
  patientNameNorm,
  dobYmd,
  memberId,
  clinicianNorm,
  placeOfService,
  rowType,
  diagnosis,
  chargeRate
}) {
  const payload = [
    `agency:${Number(agencyId) || 0}`,
    `dos:${serviceDateYmd || ''}`,
    `patient:${patientNameNorm || ''}`,
    `dob:${dobYmd || ''}`,
    `member:${String(memberId || '').trim().toLowerCase()}`,
    `clin:${clinicianNorm || ''}`,
    `pos:${String(placeOfService || '').trim()}`,
    `type:${String(rowType || '').trim().toLowerCase()}`,
    `dx:${String(diagnosis || '').trim().toLowerCase()}`,
    `rate:${Number(chargeRate || 0).toFixed(2)}`
  ].join('|');
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

function mapNormalizedRow(n, agencyId, keyMaterial) {
  const serviceDate = parseServiceDate(getFirst(n, ['date', 'date of service', 'dos', 'service date']));
  const serviceYmd = formatYmd(serviceDate);
  const patientName =
    String(getFirst(n, ['patient', 'patient name', 'client', 'client name']) || '').trim() ||
    `${String(getFirst(n, ['patient first name', 'first name']) || '').trim()} ${String(getFirst(n, ['patient last name', 'last name']) || '').trim()}`.trim();
  const dobRaw = getFirst(n, ['dob', 'date of birth', 'birth date', 'patient dob', 'patient date of birth']);
  const dobYmd = formatYmd(parseServiceDate(dobRaw));
  const memberId = String(
    getFirst(n, [
      'patient account number or member id',
      'patient account number',
      'member id',
      'account number',
      'patient account'
    ]) || ''
  ).trim();
  const rowType = String(getFirst(n, ['type of charge or payment', 'type', 'row type', 'charge type']) || '').trim();
  const placeOfService = String(
    getFirst(n, ['place of service code', 'place of service', 'pos', 'pos code']) || ''
  )
    .trim()
    .padStart(2, '0')
    .slice(-2);
  const clinician = String(
    getFirst(n, ['clinician', 'clinician name', 'provider', 'provider name', 'rendering provider']) || ''
  ).trim();
  const diagnosis = String(
    getFirst(n, [
      'diagnosis',
      'diagnosis code',
      'diagnosis codes',
      'diagnosis/es',
      'diagnoses',
      'dx',
      'dx code',
      'icd10',
      'icd 10',
      'icd-10',
      'icd10 code',
      'icd-10 code',
      'primary diagnosis',
      'primary dx'
    ]) || ''
  ).trim();
  const primaryPayer = String(
    getFirst(n, [
      'primary payer name',
      'primary payer',
      'primary insurance',
      'primary insurance name',
      'insurance',
      'insurance name',
      'payer',
      'payer name'
    ]) ||
      firstMatchByRegexes(n, [/primary\s*payer/i, /primary\s*insurance/i, /^payer$/i, /^insurance$/i]) ||
      ''
  ).trim();
  const secondaryPayer = String(
    getFirst(n, ['secondary payer name', 'secondary payer', 'secondary insurance']) ||
      firstMatchByRegexes(n, [/secondary\s*payer/i, /secondary\s*insurance/i]) ||
      ''
  ).trim();
  const insuranceStatus = String(
    getFirst(n, ['insurance status', 'claim status', 'paid status', 'patient balance status']) ||
      firstMatchByRegexes(n, [/insurance\s*status/i, /patient\s*balance\s*status/i, /claim\s*status/i]) ||
      ''
  ).trim();
  const serviceCode = String(
    getFirst(n, ['service code', 'cpt code', 'hcpcs', 'procedure code', 'code']) || ''
  )
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

  const chargeRate = moneyFromRow(
    n,
    ['rate', 'charge', 'charge amount', 'amount', 'total charge'],
    [/^(rate|charge|amount)$/i, /charge\s*amount/i, /total\s*charge/i]
  );
  const patientAmount = moneyFromRow(
    n,
    ['patient amount', 'patient amount paid', 'patient paid', 'patient payment', 'copay', 'copay amount'],
    [/patient\s*amount\s*paid/i, /patient\s*paid/i, /patient\s*payment/i, /^copay/i]
  );
  const patientResponsibility = moneyFromRow(
    n,
    [
      'patient responsibility',
      'patient responsibility amount',
      'patient resp',
      'patient responsible',
      'patient owes',
      'patient owe'
    ],
    [/patient\s*responsib/i, /patient\s*owe/i]
  );
  let patientBalance = moneyFromRow(
    n,
    ['patient balance', 'patient outstanding', 'patient balance due', 'balance due'],
    [/patient\s*balance(?!\s*status)/i, /patient\s*outstanding/i, /patient\s*balance\s*due/i]
  );
  let insuranceAmount = moneyFromRow(
    n,
    ['insurance amount', 'insurance billed', 'insurance charge', 'billed amount', 'amount billed'],
    [/insurance\s*amount(?!\s*paid)/i, /insurance\s*billed/i, /billed\s*to\s*insurance/i]
  );
  const insuranceAmountPaid = moneyFromRow(
    n,
    ['insurance amount paid', 'insurance paid', 'payer paid', 'insurance payment', 'ins payment'],
    [/insurance\s*amount\s*paid/i, /insurance\s*paid/i, /insurance\s*payment/i]
  );
  let insuranceOutstanding = moneyFromRow(
    n,
    ['insurance outstanding', 'insurance balance', 'insurance amount outstanding', 'insurance due'],
    [/insurance\s*outstanding/i, /insurance\s*balance/i, /insurance\s*due/i]
  );

  const derived = deriveBillingOutstandingAmounts({
    chargeRate,
    patientAmount,
    patientResponsibility,
    patientBalance,
    insuranceAmount,
    insuranceAmountPaid,
    insuranceOutstanding,
    primaryPayer
  });
  patientBalance = derived.patientBalance;
  insuranceAmount = derived.insuranceAmount;
  insuranceOutstanding = derived.insuranceOutstanding;

  const patientNameNorm = normalizeNameKey(patientName);
  const clinicianNorm = normalizeNameKey(clinician);
  const fingerprint = computeLineFingerprint({
    agencyId,
    serviceDateYmd: serviceYmd,
    patientNameNorm,
    dobYmd,
    memberId,
    clinicianNorm,
    placeOfService,
    rowType,
    diagnosis,
    chargeRate
  });

  const patientNameHash = patientNameNorm
    ? hmacHex(keyMaterial, `agency:${agencyId}|patient:${patientNameNorm}`)
    : null;
  const patientDobHash = dobYmd ? hmacHex(keyMaterial, `agency:${agencyId}|dob:${dobYmd}`) : null;
  const memberIdHash = memberId
    ? hmacHex(keyMaterial, `agency:${agencyId}|member:${memberId.toLowerCase()}`)
    : null;

  return {
    serviceDate: serviceYmd || null,
    serviceCode: serviceCode || null,
    placeOfService: placeOfService || null,
    rowType: rowType || null,
    diagnosis: diagnosis || null,
    primaryPayer: primaryPayer || null,
    secondaryPayer: secondaryPayer || null,
    insuranceStatus: insuranceStatus || null,
    clinician,
    clinicianNorm,
    patientName,
    patientNameNorm,
    dobYmd: dobYmd || null,
    memberId: memberId || null,
    chargeRate,
    patientAmount,
    patientBalance,
    insuranceAmount,
    insuranceAmountPaid,
    insuranceOutstanding,
    fingerprint,
    patientNameHash,
    patientDobHash,
    memberIdHash
  };
}

async function loadProviderNameMap(agencyId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id, u.first_name, u.last_name
     FROM users u
     JOIN user_agencies ua ON u.id = ua.user_id
     WHERE ua.agency_id = ?
       AND (u.status IS NULL OR u.status NOT IN ('pending', 'ready_for_review'))
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)`,
    [agencyId]
  );
  const nameToIds = new Map();
  for (const u of rows || []) {
    const first = String(u.first_name || '').trim();
    const last = String(u.last_name || '').trim();
    for (const k of nameKeyCandidates(`${first} ${last}`)) {
      const arr = nameToIds.get(k) || [];
      if (!arr.includes(u.id)) arr.push(u.id);
      nameToIds.set(k, arr);
    }
  }
  return nameToIds;
}

async function loadBillingOrgContext(agencyId) {
  const aid = Number(agencyId);
  const orgs = await OrganizationAffiliation.listActiveOrganizationsForAgency(aid);
  const schoolOrgIds = [];
  let clinicalOrgId = null;

  for (const org of orgs || []) {
    const orgId = Number(org?.id || 0);
    if (!orgId) continue;
    const orgType = String(org?.organization_type || '').toLowerCase();
    if (orgType === 'clinical') {
      if (!clinicalOrgId) clinicalOrgId = orgId;
      continue;
    }
    if (orgType === 'school' || orgType === 'program') {
      if (!schoolOrgIds.includes(orgId)) schoolOrgIds.push(orgId);
    }
  }

  if (!schoolOrgIds.length) {
    try {
      const AgencySchool = (await import('../models/AgencySchool.model.js')).default;
      const links = await AgencySchool.listByAgency(aid, { includeInactive: false });
      for (const link of links || []) {
        const schoolOrgId = Number(link?.school_organization_id || 0);
        if (schoolOrgId && !schoolOrgIds.includes(schoolOrgId)) schoolOrgIds.push(schoolOrgId);
      }
    } catch {
      // best-effort only
    }
  }

  return {
    clinicalOrgId,
    schoolOrgIds,
    fallbackOrgId: aid
  };
}

function resolveBillingImportOrganizationId({ preferSchool, orgContext }) {
  if (preferSchool && orgContext?.schoolOrgIds?.length) {
    return orgContext.schoolOrgIds[0];
  }
  if (orgContext?.clinicalOrgId) return orgContext.clinicalOrgId;
  return orgContext?.fallbackOrgId || null;
}

function resolveProviderUserId(nameToIds, clinicianName) {
  const keys = nameKeyCandidates(clinicianName);
  if (!keys.length) return null;
  const ids = new Set();
  for (const k of keys) {
    for (const id of nameToIds.get(k) || []) ids.add(Number(id));
  }
  return ids.size === 1 ? Array.from(ids)[0] : null;
}

function pickBillingClientMatch(rows, preferSchool) {
  const list = Array.isArray(rows) ? rows.filter((r) => r?.id) : [];
  if (!list.length) return null;
  if (list.length === 1) return Number(list[0].id);
  if (preferSchool) {
    const school = list.find((r) => String(r.organization_type || '').toLowerCase() === 'school');
    if (school) return Number(school.id);
  } else {
    const nonSchool = list.find((r) => String(r.organization_type || '').toLowerCase() !== 'school');
    if (nonSchool) return Number(nonSchool.id);
  }
  return Number(list[0].id);
}

async function findClientByIdentity({ agencyId, patientNameHash, patientDobHash, memberIdHash, preferSchool }) {
  const schoolOrder = preferSchool
    ? `CASE WHEN LOWER(COALESCE(org.organization_type,'')) = 'school' THEN 0 ELSE 1 END`
    : `CASE WHEN LOWER(COALESCE(org.organization_type,'')) = 'school' THEN 1 ELSE 0 END`;

  if (memberIdHash) {
    const [byMember] = await pool.execute(
      `SELECT c.id, c.organization_id, c.client_type, org.organization_type
       FROM client_billing_identities i
       JOIN clients c ON c.id = i.client_id
       LEFT JOIN agencies org ON org.id = c.organization_id
       WHERE i.agency_id = ? AND i.member_id_hash = ?
       ORDER BY ${schoolOrder}, c.id ASC
       LIMIT 10`,
      [agencyId, memberIdHash]
    );
    const picked = pickBillingClientMatch(byMember, preferSchool);
    if (picked) return picked;
  }

  if (patientNameHash && patientDobHash) {
    const [byNameDob] = await pool.execute(
      `SELECT c.id, c.organization_id, org.organization_type
       FROM client_billing_identities i
       JOIN clients c ON c.id = i.client_id
       LEFT JOIN agencies org ON org.id = c.organization_id
       WHERE i.agency_id = ? AND i.patient_name_hash = ? AND i.patient_dob_hash = ?
       ORDER BY ${schoolOrder}, c.id ASC
       LIMIT 10`,
      [agencyId, patientNameHash, patientDobHash]
    );
    if (!byNameDob?.length) {
      // Fallback: match clients.date_of_birth + normalized full_name via identity not yet stored
      const [clients] = await pool.execute(
        `SELECT c.id, c.full_name, c.date_of_birth, c.organization_id, org.organization_type
         FROM clients c
         LEFT JOIN agencies org ON org.id = c.organization_id
         WHERE c.agency_id = ? AND c.date_of_birth IS NOT NULL
           AND c.status <> 'ARCHIVED'`,
        [agencyId]
      );
      const matches = [];
      for (const c of clients || []) {
        const dob = formatYmd(c.date_of_birth);
        const nm = normalizeNameKey(c.full_name);
        if (!dob || !nm) continue;
        const nh = hmacHex(getKeyMaterial(), `agency:${agencyId}|patient:${nm}`);
        const dh = hmacHex(getKeyMaterial(), `agency:${agencyId}|dob:${dob}`);
        if (nh === patientNameHash && dh === patientDobHash) matches.push(c);
      }
      const picked = pickBillingClientMatch(matches, preferSchool);
      if (picked) return picked;
      return null;
    }
    const picked = pickBillingClientMatch(byNameDob, preferSchool);
    if (picked) return picked;
  }
  return null;
}

async function upsertClientIdentity({ agencyId, clientId, patientNameHash, patientDobHash, memberIdHash }) {
  await pool.execute(
    `INSERT INTO client_billing_identities
       (agency_id, client_id, patient_name_hash, patient_dob_hash, member_id_hash)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       patient_name_hash = COALESCE(VALUES(patient_name_hash), patient_name_hash),
       patient_dob_hash = COALESCE(VALUES(patient_dob_hash), patient_dob_hash),
       member_id_hash = COALESCE(VALUES(member_id_hash), member_id_hash),
       updated_at = CURRENT_TIMESTAMP`,
    [agencyId, clientId, patientNameHash, patientDobHash, memberIdHash]
  );
}

async function ensureProviderAssignment({ clientId, agencyId, providerUserId, actingUserId, clientType, organizationId }) {
  if (!clientId || !providerUserId) return;
  let orgId = Number(organizationId || 0) || Number(agencyId);
  if (!organizationId) {
    try {
      const [cRows] = await pool.execute(
        `SELECT organization_id FROM clients WHERE id = ? LIMIT 1`,
        [clientId]
      );
      const clientOrg = Number(cRows?.[0]?.organization_id || 0);
      if (clientOrg > 0) orgId = clientOrg;
    } catch {
      // keep agencyId
    }
  }

  // UNIQUE(client_id, organization_id, provider_user_id, service_day) treats each NULL
  // service_day as distinct in MySQL, so billing imports (one row per session) must upsert
  // the existing Unknown-day assignment instead of inserting again.
  const [nullDayRows] = await pool.execute(
    `SELECT id
     FROM client_provider_assignments
     WHERE client_id = ? AND organization_id = ? AND provider_user_id = ? AND service_day IS NULL
     ORDER BY is_active DESC, id ASC`,
    [clientId, orgId, providerUserId]
  );
  const rows = nullDayRows || [];
  if (rows.length > 0) {
    const keepId = Number(rows[0].id);
    const extraIds = rows.slice(1).map((r) => Number(r.id)).filter((id) => id > 0);
    await pool.execute(
      `UPDATE client_provider_assignments
       SET is_active = TRUE,
           updated_by_user_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [actingUserId || null, keepId]
    );
    if (extraIds.length) {
      const placeholders = extraIds.map(() => '?').join(', ');
      await pool.execute(
        `UPDATE client_provider_assignments
         SET is_active = FALSE,
             updated_by_user_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${placeholders})`,
        [actingUserId || null, ...extraIds]
      );
    }
  } else {
    await pool.execute(
      `INSERT INTO client_provider_assignments
         (client_id, organization_id, provider_user_id, service_day, is_active, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, NULL, TRUE, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_active = TRUE,
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [clientId, orgId, providerUserId, actingUserId || null, actingUserId || null]
    );
  }

  try {
    const [cur] = await pool.execute(`SELECT provider_id FROM clients WHERE id = ? LIMIT 1`, [clientId]);
    const oldPid = cur?.[0]?.provider_id ? Number(cur[0].provider_id) : null;
    if (oldPid !== providerUserId) {
      await pool.execute(`UPDATE clients SET provider_id = ? WHERE id = ?`, [providerUserId, clientId]);
      await recordProviderAssignmentChange({
        clientId,
        agencyId,
        clientType: clientType || 'clinical',
        oldProviderUserId: oldPid,
        newProviderUserId: providerUserId,
        actingUserId
      });
    }
  } catch {
    // best-effort
  }
}

async function reactivateClientIfTerminated({ clientId, agencyId, actingUserId, providerUserId, organizationId }) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.client_status_id, cs.status_key
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.id = ? AND c.agency_id = ?
     LIMIT 1`,
    [clientId, agencyId]
  );
  const row = rows?.[0];
  if (!row) return false;
  if (String(row.status_key || '').toLowerCase() !== 'terminated') return false;

  const currentId = await getClientStatusIdByKey({ agencyId, statusKey: 'current' });
  if (!currentId) return false;

  await Client.update(
    clientId,
    {
      client_status_id: currentId,
      termination_reason: null,
      terminated_at: null,
      terminated_by_user_id: null
    },
    actingUserId || null
  );
  await ClientStatusHistory.create({
    client_id: clientId,
    changed_by_user_id: actingUserId || null,
    field_changed: 'client_status_id',
    from_value: row.client_status_id ? String(row.client_status_id) : null,
    to_value: String(currentId),
    note: 'Reactivated by billing report session import'
  }).catch(() => {});

  if (providerUserId) {
    await ensureProviderAssignment({
      clientId,
      agencyId,
      providerUserId,
      actingUserId,
      clientType: 'clinical',
      organizationId
    });
  }
  return true;
}

async function createClinicalClientFromBilling({
  agencyId,
  organizationId,
  patientName,
  dobYmd,
  providerUserId,
  actingUserId
}) {
  const resolvedOrgId = Number(organizationId || agencyId);
  if (!resolvedOrgId) {
    const err = new Error('Unable to resolve organization for billing import client');
    err.status = 500;
    throw err;
  }

  const currentId = await getClientStatusIdByKey({ agencyId, statusKey: 'current' });
  const initials = initialsFromName(patientName);
  const today = formatYmd(new Date());
  const client = await Client.create({
    organization_id: resolvedOrgId,
    agency_id: agencyId,
    provider_id: providerUserId || null,
    initials,
    full_name: patientName || initials,
    status: 'ACTIVE',
    submission_date: today,
    document_status: 'NONE',
    source: 'BILLING_IMPORT',
    created_by_user_id: actingUserId || null,
    referral_date: today,
    client_status_id: currentId || null,
    client_type: 'clinical',
    date_of_birth: dobYmd || null
  });
  if (client?.id) {
    await seedClientAffiliations({
      clientId: client.id,
      agencyId,
      organizationId: resolvedOrgId
    }).catch(() => {});
  }
  if (dobYmd && client?.id) {
    await pool.execute(`UPDATE clients SET date_of_birth = ? WHERE id = ?`, [dobYmd, client.id]).catch(() => {});
  }
  if (providerUserId && client?.id) {
    await ensureProviderAssignment({
      clientId: client.id,
      agencyId,
      providerUserId,
      actingUserId,
      clientType: 'clinical',
      organizationId: resolvedOrgId
    });
  }
  return client;
}

async function upsertBillingLine(row, uploadId, agencyId) {
  const patientEnc = row.patientName ? encToCols(encryptBillingSecret(row.patientName)) : encToCols(null);
  const dobEnc = row.dobYmd ? encToCols(encryptBillingSecret(row.dobYmd)) : encToCols(null);
  const memberEnc = row.memberId ? encToCols(encryptBillingSecret(row.memberId)) : encToCols(null);

  const [result] = await pool.execute(
    `INSERT INTO billing_report_lines
      (agency_id, upload_id, line_fingerprint, service_date, service_code, place_of_service, row_type,
       diagnosis_text, primary_payer_name, secondary_payer_name, insurance_status,
       clinician_name_normalized, provider_user_id,
       patient_name_ciphertext_b64, patient_name_iv_b64, patient_name_auth_tag_b64, patient_name_key_id,
       patient_dob_ciphertext_b64, patient_dob_iv_b64, patient_dob_auth_tag_b64, patient_dob_key_id,
       member_id_ciphertext_b64, member_id_iv_b64, member_id_auth_tag_b64, member_id_key_id,
       patient_name_hash, patient_dob_hash, member_id_hash,
       charge_rate, patient_amount, patient_balance, insurance_amount, insurance_amount_paid, insurance_outstanding,
       client_id, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       upload_id = VALUES(upload_id),
       service_date = VALUES(service_date),
       service_code = VALUES(service_code),
       place_of_service = VALUES(place_of_service),
       row_type = VALUES(row_type),
       diagnosis_text = VALUES(diagnosis_text),
       primary_payer_name = VALUES(primary_payer_name),
       secondary_payer_name = VALUES(secondary_payer_name),
       insurance_status = VALUES(insurance_status),
       clinician_name_normalized = VALUES(clinician_name_normalized),
       provider_user_id = COALESCE(VALUES(provider_user_id), provider_user_id),
       patient_name_ciphertext_b64 = VALUES(patient_name_ciphertext_b64),
       patient_name_iv_b64 = VALUES(patient_name_iv_b64),
       patient_name_auth_tag_b64 = VALUES(patient_name_auth_tag_b64),
       patient_name_key_id = VALUES(patient_name_key_id),
       patient_dob_ciphertext_b64 = VALUES(patient_dob_ciphertext_b64),
       patient_dob_iv_b64 = VALUES(patient_dob_iv_b64),
       patient_dob_auth_tag_b64 = VALUES(patient_dob_auth_tag_b64),
       patient_dob_key_id = VALUES(patient_dob_key_id),
       member_id_ciphertext_b64 = VALUES(member_id_ciphertext_b64),
       member_id_iv_b64 = VALUES(member_id_iv_b64),
       member_id_auth_tag_b64 = VALUES(member_id_auth_tag_b64),
       member_id_key_id = VALUES(member_id_key_id),
       patient_name_hash = VALUES(patient_name_hash),
       patient_dob_hash = VALUES(patient_dob_hash),
       member_id_hash = VALUES(member_id_hash),
       charge_rate = VALUES(charge_rate),
       patient_amount = VALUES(patient_amount),
       patient_balance = VALUES(patient_balance),
       insurance_amount = VALUES(insurance_amount),
       insurance_amount_paid = VALUES(insurance_amount_paid),
       insurance_outstanding = VALUES(insurance_outstanding),
       updated_at = CURRENT_TIMESTAMP`,
    [
      agencyId,
      uploadId,
      row.fingerprint,
      row.serviceDate,
      row.serviceCode,
      row.placeOfService,
      row.rowType,
      row.diagnosis,
      row.primaryPayer,
      row.secondaryPayer,
      row.insuranceStatus,
      row.clinicianNorm || null,
      row.providerUserId || null,
      patientEnc.ciphertextB64,
      patientEnc.ivB64,
      patientEnc.authTagB64,
      patientEnc.keyId,
      dobEnc.ciphertextB64,
      dobEnc.ivB64,
      dobEnc.authTagB64,
      dobEnc.keyId,
      memberEnc.ciphertextB64,
      memberEnc.ivB64,
      memberEnc.authTagB64,
      memberEnc.keyId,
      row.patientNameHash,
      row.patientDobHash,
      row.memberIdHash,
      row.chargeRate,
      row.patientAmount,
      row.patientBalance,
      row.insuranceAmount,
      row.insuranceAmountPaid,
      row.insuranceOutstanding,
      row.clientId || null,
      row.clientId ? new Date() : null
    ]
  );

  const inserted = Number(result.affectedRows || 0) === 1;
  const updated = Number(result.affectedRows || 0) === 2;
  let lineId = Number(result.insertId || 0);
  if (!lineId) {
    const [found] = await pool.execute(
      `SELECT id FROM billing_report_lines WHERE agency_id = ? AND line_fingerprint = ? LIMIT 1`,
      [agencyId, row.fingerprint]
    );
    lineId = Number(found?.[0]?.id || 0);
  }
  return { lineId, inserted, updated };
}

async function upsertEncounter({ agencyId, clientId, providerUserId, lineId, row }) {
  if (!clientId || !lineId || !row.serviceDate) return null;
  const [result] = await pool.execute(
    `INSERT INTO billing_encounters
      (agency_id, client_id, provider_user_id, billing_line_id, service_date, service_code, place_of_service,
       diagnosis_text, row_type, charge_rate, patient_amount, patient_balance,
       insurance_amount, insurance_amount_paid, insurance_outstanding, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'billing_import')
     ON DUPLICATE KEY UPDATE
       client_id = VALUES(client_id),
       provider_user_id = COALESCE(VALUES(provider_user_id), provider_user_id),
       service_date = VALUES(service_date),
       service_code = VALUES(service_code),
       place_of_service = VALUES(place_of_service),
       diagnosis_text = VALUES(diagnosis_text),
       row_type = VALUES(row_type),
       charge_rate = VALUES(charge_rate),
       patient_amount = VALUES(patient_amount),
       patient_balance = VALUES(patient_balance),
       insurance_amount = VALUES(insurance_amount),
       insurance_amount_paid = VALUES(insurance_amount_paid),
       insurance_outstanding = VALUES(insurance_outstanding),
       updated_at = CURRENT_TIMESTAMP`,
    [
      agencyId,
      clientId,
      providerUserId || null,
      lineId,
      row.serviceDate,
      row.serviceCode,
      row.placeOfService,
      row.diagnosis,
      row.rowType,
      row.chargeRate,
      row.patientAmount,
      row.patientBalance,
      row.insuranceAmount,
      row.insuranceAmountPaid,
      row.insuranceOutstanding
    ]
  );
  let encounterId = Number(result.insertId || 0);
  if (!encounterId) {
    const [found] = await pool.execute(
      `SELECT id FROM billing_encounters WHERE billing_line_id = ? LIMIT 1`,
      [lineId]
    );
    encounterId = Number(found?.[0]?.id || 0);
  }
  if (encounterId) {
    await pool.execute(
      `UPDATE billing_report_lines
       SET client_id = ?, billing_encounter_id = ?, provider_user_id = COALESCE(?, provider_user_id), resolved_at = NOW()
       WHERE id = ?`,
      [clientId, encounterId, providerUserId || null, lineId]
    );
  }
  return encounterId;
}

async function projectReceivablesFromLines({ agencyId, uploadId, actingUserId }) {
  const [lines] = await pool.execute(
    `SELECT *
     FROM billing_report_lines
     WHERE agency_id = ? AND upload_id = ?
       AND (patient_balance > 0.009 OR insurance_outstanding > 0.009)`,
    [agencyId, uploadId]
  );
  if (!lines?.length) return 0;

  const recvUploadId = await ReceivablesReportUpload.create({
    agencyId,
    uploadedByUserId: actingUserId || null,
    originalFilename: `billing-report-upload-${uploadId}`,
    minServiceDate: null,
    maxServiceDate: null
  });

  let count = 0;
  for (const r of lines) {
    const patientOutstanding = Number(r.patient_balance || 0);
    const insuranceOutstanding = Number(r.insurance_outstanding || 0);
    const payerEnc = r.primary_payer_name ? encToCols(encryptBillingSecret(r.primary_payer_name)) : encToCols(null);
    await pool.execute(
      `INSERT INTO agency_receivables_report_rows
        (upload_id, agency_id, service_date, row_fingerprint,
         patient_name_ciphertext_b64, patient_name_iv_b64, patient_name_auth_tag_b64, patient_name_key_id,
         payer_name_ciphertext_b64, payer_name_iv_b64, payer_name_auth_tag_b64, payer_name_key_id,
         claim_id_ciphertext_b64, claim_id_iv_b64, claim_id_auth_tag_b64, claim_id_key_id,
         patient_balance_status, row_type, payment_type,
         patient_responsibility_amount, patient_amount_paid, patient_outstanding_amount,
         insurance_amount, insurance_amount_paid, insurance_outstanding_amount, billing_line_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         upload_id = VALUES(upload_id),
         service_date = VALUES(service_date),
         patient_balance_status = VALUES(patient_balance_status),
         row_type = VALUES(row_type),
         patient_responsibility_amount = VALUES(patient_responsibility_amount),
         patient_amount_paid = VALUES(patient_amount_paid),
         patient_outstanding_amount = VALUES(patient_outstanding_amount),
         insurance_amount = VALUES(insurance_amount),
         insurance_amount_paid = VALUES(insurance_amount_paid),
         insurance_outstanding_amount = VALUES(insurance_outstanding_amount),
         billing_line_id = VALUES(billing_line_id),
         patient_name_ciphertext_b64 = VALUES(patient_name_ciphertext_b64),
         patient_name_iv_b64 = VALUES(patient_name_iv_b64),
         patient_name_auth_tag_b64 = VALUES(patient_name_auth_tag_b64),
         patient_name_key_id = VALUES(patient_name_key_id),
         payer_name_ciphertext_b64 = VALUES(payer_name_ciphertext_b64),
         payer_name_iv_b64 = VALUES(payer_name_iv_b64),
         payer_name_auth_tag_b64 = VALUES(payer_name_auth_tag_b64),
         payer_name_key_id = VALUES(payer_name_key_id)`,
      [
        recvUploadId,
        agencyId,
        r.service_date,
        r.line_fingerprint,
        r.patient_name_ciphertext_b64,
        r.patient_name_iv_b64,
        r.patient_name_auth_tag_b64,
        r.patient_name_key_id,
        payerEnc.ciphertextB64,
        payerEnc.ivB64,
        payerEnc.authTagB64,
        payerEnc.keyId,
        null,
        null,
        null,
        null,
        r.insurance_status,
        r.row_type,
        null,
        patientOutstanding + Number(r.patient_amount || 0),
        Number(r.patient_amount || 0),
        patientOutstanding,
        Number(r.insurance_amount || 0),
        Number(r.insurance_amount_paid || 0),
        insuranceOutstanding,
        r.id
      ]
    );
    count += 1;
  }
  return count;
}

/**
 * Auto-terminate clients with no billing encounter in 60 days.
 * Keeps provider assignment inactive but stores last provider via encounters for Show terminated.
 */
export async function autoTerminateInactiveBillingClients({ agencyId, actingUserId = null, days = 60 } = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return { terminated: 0 };

  const terminatedStatusId = await getClientStatusIdByKey({ agencyId: aid, statusKey: 'terminated' });
  if (!terminatedStatusId) return { terminated: 0, error: 'terminated status missing' };

  const [rows] = await pool.execute(
    `SELECT c.id, c.client_status_id, c.provider_id,
            MAX(be.service_date) AS last_session
     FROM clients c
     INNER JOIN billing_encounters be ON be.client_id = c.id AND be.agency_id = c.agency_id
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.agency_id = ?
       AND c.status <> 'ARCHIVED'
       AND LOWER(COALESCE(cs.status_key, '')) <> 'terminated'
     GROUP BY c.id, c.client_status_id, c.provider_id
     HAVING last_session IS NOT NULL AND last_session < DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [aid, Number(days) || 60]
  );

  let terminated = 0;
  for (const r of rows || []) {
    const clientId = Number(r.id);
    await Client.update(
      clientId,
      {
        client_status_id: terminatedStatusId,
        termination_reason: 'No sessions in 60 days (billing import)',
        terminated_at: new Date(),
        terminated_by_user_id: actingUserId || null
      },
      actingUserId || null
    );
    await ClientStatusHistory.create({
      client_id: clientId,
      changed_by_user_id: actingUserId || null,
      field_changed: 'client_status_id',
      from_value: r.client_status_id ? String(r.client_status_id) : null,
      to_value: String(terminatedStatusId),
      note: 'No sessions in 60 days (billing import)'
    }).catch(() => {});

    // Soft-deactivate assignments but do not refund school slots for office clinical imports
    await pool.execute(
      `UPDATE client_provider_assignments
       SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE client_id = ? AND is_active = TRUE`,
      [clientId]
    ).catch(() => {});
    terminated += 1;
  }
  return { terminated };
}

export async function getSessionTotalsByClient({ agencyId, fiscalYearStart, providerUserId = null }) {
  const fyStart = String(fiscalYearStart || '').slice(0, 10);
  if (!fyStart) return {};
  const startYear = Number(fyStart.slice(0, 4));
  const fyEnd = `${startYear + 1}-07-31`;

  const where = ['be.agency_id = ?', 'be.service_date >= ?', 'be.service_date <= ?'];
  const params = [Number(agencyId), fyStart, fyEnd];
  if (providerUserId) {
    where.push('be.provider_user_id = ?');
    params.push(Number(providerUserId));
  }

  const [rows] = await pool.execute(
    `SELECT be.client_id, be.service_code, COUNT(*) AS code_count
     FROM billing_encounters be
     WHERE ${where.join(' AND ')}
     GROUP BY be.client_id, be.service_code`,
    params
  );

  const map = {};
  for (const r of rows || []) {
    const cid = String(r.client_id);
    if (!map[cid]) map[cid] = { total: 0, per_code: {} };
    const code = String(r.service_code || 'UNKNOWN').toUpperCase();
    const n = Number(r.code_count || 0);
    map[cid].per_code[code] = (map[cid].per_code[code] || 0) + n;
    map[cid].total += n;
  }
  return map;
}

function isSchoolPosCode(raw) {
  const digits = String(raw || '').trim().replace(/\D/g, '');
  if (!digits) return false;
  return digits.padStart(2, '0').slice(-2) === '03';
}

function isNonEmptyNonSchoolPosCode(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return false;
  return !isSchoolPosCode(trimmed);
}

/**
 * Lifetime POS flags for a provider's caseload (no date window).
 * School = POS 03 (also accepts "3"); office = any other non-empty POS.
 */
export async function getProviderClientPosFlags({ agencyId, providerUserId }) {
  const aid = Number(agencyId);
  const pid = Number(providerUserId);
  if (!aid || !pid) return {};

  const byClientId = {};
  const mergeFlags = (clientId, seenAtSchool, seenAtOffice) => {
    const id = Number(clientId);
    if (!id) return;
    const key = String(id);
    const prev = byClientId[key] || { seenAtSchool: false, seenAtOffice: false };
    byClientId[key] = {
      seenAtSchool: prev.seenAtSchool || !!seenAtSchool,
      seenAtOffice: prev.seenAtOffice || !!seenAtOffice
    };
  };

  try {
    const [rows] = await pool.execute(
      `SELECT be.client_id,
              MAX(
                CASE
                  WHEN LPAD(TRIM(LEADING '0' FROM TRIM(COALESCE(be.place_of_service, ''))), 2, '0') = '03'
                    OR TRIM(COALESCE(be.place_of_service, '')) IN ('03', '3')
                  THEN 1 ELSE 0
                END
              ) AS seen_at_school,
              MAX(
                CASE
                  WHEN TRIM(COALESCE(be.place_of_service, '')) <> ''
                    AND TRIM(COALESCE(be.place_of_service, '')) NOT IN ('03', '3')
                    AND LPAD(TRIM(LEADING '0' FROM TRIM(COALESCE(be.place_of_service, ''))), 2, '0') <> '03'
                  THEN 1
                  ELSE 0
                END
              ) AS seen_at_office
       FROM billing_encounters be
       WHERE be.agency_id = ? AND be.provider_user_id = ?
       GROUP BY be.client_id`,
      [aid, pid]
    );
    for (const r of rows || []) {
      mergeFlags(r.client_id, Number(r.seen_at_school) === 1, Number(r.seen_at_office) === 1);
    }
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }

  // Clinical sessions may hold older POS 03 encounters that never landed in billing_encounters.
  try {
    const [rows] = await pool.execute(
      `SELECT cs.client_id, cs.place_of_service
       FROM clinical_sessions cs
       INNER JOIN clients c ON c.id = cs.client_id
       WHERE c.agency_id = ?
         AND (cs.rendering_provider_user_id = ? OR cs.provider_user_id = ?)
         AND TRIM(COALESCE(cs.place_of_service, '')) <> ''`,
      [aid, pid, pid]
    );
    for (const r of rows || []) {
      mergeFlags(r.client_id, isSchoolPosCode(r.place_of_service), isNonEmptyNonSchoolPosCode(r.place_of_service));
    }
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }

  return byClientId;
}

/**
 * Client IDs on this provider's caseload that are (or have been) school-affiliated.
 * Includes inactive COA rows so historical school portal clients stay "In School".
 */
export async function getProviderSchoolAffiliatedClientIds({ agencyId, providerUserId }) {
  const aid = Number(agencyId);
  const pid = Number(providerUserId);
  if (!aid || !pid) return [];

  const ids = new Set();
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT c.id
       FROM clients c
       LEFT JOIN agencies org ON org.id = c.organization_id
       WHERE c.agency_id = ?
         AND (
           c.provider_id = ?
           OR EXISTS (
             SELECT 1
             FROM client_provider_assignments cpa
             WHERE cpa.client_id = c.id
               AND cpa.provider_user_id = ?
           )
         )
         AND (
           LOWER(COALESCE(c.client_type, '')) IN ('school', 'learning')
           OR LOWER(COALESCE(org.organization_type, '')) IN ('school', 'program', 'learning')
           OR EXISTS (
             SELECT 1
             FROM client_organization_assignments coa
             INNER JOIN agencies o ON o.id = coa.organization_id
             WHERE coa.client_id = c.id
               AND LOWER(COALESCE(o.organization_type, '')) IN ('school', 'program', 'learning')
           )
           OR EXISTS (
             SELECT 1
             FROM client_provider_assignments cpa
             INNER JOIN agencies o ON o.id = cpa.organization_id
             WHERE cpa.client_id = c.id
               AND cpa.provider_user_id = ?
               AND LOWER(COALESCE(o.organization_type, '')) IN ('school', 'program', 'learning')
           )
         )`,
      [aid, pid, pid, pid]
    );
    for (const r of rows || []) {
      const id = Number(r.id);
      if (id) ids.add(id);
    }
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }
  return [...ids];
}

export async function getRevenueAggregates({ agencyId = null, startYmd = null, endYmd = null } = {}) {
  const where = ['1=1'];
  const params = [];
  if (agencyId) {
    where.push('agency_id = ?');
    params.push(Number(agencyId));
  }
  if (startYmd) {
    where.push('service_date >= ?');
    params.push(String(startYmd).slice(0, 10));
  }
  if (endYmd) {
    where.push('service_date <= ?');
    params.push(String(endYmd).slice(0, 10));
  }

  const [rows] = await pool.execute(
    `SELECT
       agency_id,
       SUM(charge_rate) AS gross_charges_total,
       SUM(patient_amount) AS patient_collected_total,
       SUM(insurance_amount_paid) AS insurance_collected_total,
       SUM(patient_balance) AS patient_outstanding_total,
       SUM(insurance_outstanding) AS insurance_outstanding_total,
       COUNT(*) AS line_count,
       MIN(service_date) AS period_start,
       MAX(service_date) AS period_end
     FROM billing_report_lines
     WHERE ${where.join(' AND ')}
     GROUP BY agency_id`,
    params
  );

  const agencies = [];
  let totals = {
    managed_total: 0,
    collected_total: 0,
    patient_outstanding_total: 0,
    insurance_outstanding_total: 0,
    outstanding_total: 0,
    gross_charges_total: 0,
    line_count: 0
  };

  for (const r of rows || []) {
    const gross = Number(r.gross_charges_total || 0);
    const patientCollected = Number(r.patient_collected_total || 0);
    const insuranceCollected = Number(r.insurance_collected_total || 0);
    const patientOut = Number(r.patient_outstanding_total || 0);
    const insuranceOut = Number(r.insurance_outstanding_total || 0);
    const collected = patientCollected + insuranceCollected;
    agencies.push({
      agency_id: r.agency_id,
      managed_total: gross,
      collected_total: collected,
      patient_collected_total: patientCollected,
      insurance_collected_total: insuranceCollected,
      patient_outstanding_total: patientOut,
      insurance_outstanding_total: insuranceOut,
      outstanding_total: patientOut + insuranceOut,
      gross_charges_total: gross,
      period_start_min: r.period_start,
      period_end_max: r.period_end,
      line_count: Number(r.line_count || 0)
    });
    totals.managed_total += gross;
    totals.collected_total += collected;
    totals.patient_outstanding_total += patientOut;
    totals.insurance_outstanding_total += insuranceOut;
    totals.outstanding_total += patientOut + insuranceOut;
    totals.gross_charges_total += gross;
    totals.line_count += Number(r.line_count || 0);
  }

  // Attach agency names
  if (agencies.length) {
    const ids = agencies.map((a) => a.agency_id).filter(Boolean);
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      const [names] = await pool.execute(`SELECT id, name FROM agencies WHERE id IN (${ph})`, ids);
      const byId = new Map((names || []).map((n) => [Number(n.id), n.name]));
      for (const a of agencies) a.agency_name = byId.get(Number(a.agency_id)) || null;
    }
  }

  return { totals, agencies };
}

export async function listBillingEncountersForClient({ agencyId, clientId, limit = 200 }) {
  const lim = Math.max(1, Math.min(500, Number(limit) || 200));
  const [rows] = await pool.execute(
    `SELECT be.*, u.first_name AS provider_first_name, u.last_name AS provider_last_name
     FROM billing_encounters be
     LEFT JOIN users u ON u.id = be.provider_user_id
     WHERE be.agency_id = ? AND be.client_id = ?
     ORDER BY be.service_date DESC, be.id DESC
     LIMIT ${lim}`,
    [Number(agencyId), Number(clientId)]
  );
  return rows || [];
}

function parseBillingDiagnosisTokens(text) {
  return String(text || '')
    .split(/[,;\n|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export async function listBillingDiagnosesForClient({ agencyId, clientId }) {
  const [rows] = await pool.execute(
    `SELECT be.diagnosis_text, be.service_date
     FROM billing_encounters be
     WHERE be.agency_id = ? AND be.client_id = ?
       AND TRIM(COALESCE(be.diagnosis_text, '')) <> ''
     ORDER BY be.service_date DESC, be.id DESC`,
    [Number(agencyId), Number(clientId)]
  );

  const byCode = new Map();
  for (const row of rows || []) {
    const serviceDate = row.service_date ? String(row.service_date).slice(0, 10) : null;
    for (const raw of parseBillingDiagnosisTokens(row.diagnosis_text)) {
      const code = raw.trim();
      if (!code) continue;
      const key = code.toUpperCase();
      const existing = byCode.get(key) || {
        code,
        sessionCount: 0,
        firstSeen: null,
        lastSeen: null
      };
      existing.sessionCount += 1;
      if (serviceDate) {
        if (!existing.firstSeen || serviceDate < existing.firstSeen) existing.firstSeen = serviceDate;
        if (!existing.lastSeen || serviceDate > existing.lastSeen) existing.lastSeen = serviceDate;
      }
      byCode.set(key, existing);
    }
  }

  return Array.from(byCode.values()).sort((a, b) => {
    const dateCmp = String(b.lastSeen || '').localeCompare(String(a.lastSeen || ''));
    if (dateCmp !== 0) return dateCmp;
    return String(a.code || '').localeCompare(String(b.code || ''));
  });
}

export async function ingestBillingReport({
  agencyId,
  fileBuffer,
  originalFilename,
  uploadedByUserId = null,
  reportLabel = null
}) {
  if (!isBillingEncryptionConfigured()) {
    const err = new Error('Billing encryption not configured on server');
    err.status = 500;
    throw err;
  }
  const keyMaterial = getKeyMaterial();
  if (!keyMaterial) {
    const err = new Error('Billing encryption key not configured');
    err.status = 500;
    throw err;
  }

  const aid = Number(agencyId);
  if (!aid) {
    const err = new Error('agencyId is required');
    err.status = 400;
    throw err;
  }

  const [uploadResult] = await pool.execute(
    `INSERT INTO billing_report_uploads
      (agency_id, uploaded_by_user_id, original_filename, status, report_label)
     VALUES (?, ?, ?, 'processing', ?)`,
    [aid, uploadedByUserId || null, originalFilename || null, reportLabel || null]
  );
  const uploadId = Number(uploadResult.insertId);

  try {
    const normalizedRows = parseBillingReportFile(fileBuffer, originalFilename);
    const nameToIds = await loadProviderNameMap(aid);
    const orgContext = await loadBillingOrgContext(aid);

    const unmatchedProviders = new Set();
    let linesInserted = 0;
    let linesUpdated = 0;
    let clientsCreated = 0;
    let clientsMatched = 0;
    let encountersCreated = 0;
    let minService = null;
    let maxService = null;
    const createdClientIds = new Set();
    const matchedClientIds = new Set();

    for (let i = 0; i < normalizedRows.length; i += CHUNK) {
      const chunk = normalizedRows.slice(i, i + CHUNK);
      for (const n of chunk) {
        const mapped = mapNormalizedRow(n, aid, keyMaterial);
        if (!mapped.serviceDate || !mapped.patientName) continue;

        if (mapped.serviceDate) {
          if (!minService || mapped.serviceDate < minService) minService = mapped.serviceDate;
          if (!maxService || mapped.serviceDate > maxService) maxService = mapped.serviceDate;
        }

        const providerUserId = resolveProviderUserId(nameToIds, mapped.clinician);
        if (mapped.clinician && !providerUserId) unmatchedProviders.add(mapped.clinician);
        mapped.providerUserId = providerUserId;

        const preferSchool = String(mapped.placeOfService || '') === '03';
        const assignmentOrgId = resolveBillingImportOrganizationId({ preferSchool, orgContext });
        let clientId = await findClientByIdentity({
          agencyId: aid,
          patientNameHash: mapped.patientNameHash,
          patientDobHash: mapped.patientDobHash,
          memberIdHash: mapped.memberIdHash,
          preferSchool
        });

        if (clientId) {
          matchedClientIds.add(clientId);
          await reactivateClientIfTerminated({
            clientId,
            agencyId: aid,
            actingUserId: uploadedByUserId,
            providerUserId,
            organizationId: assignmentOrgId
          });
          if (providerUserId) {
            await ensureProviderAssignment({
              clientId,
              agencyId: aid,
              providerUserId,
              actingUserId: uploadedByUserId,
              clientType: 'clinical',
              organizationId: assignmentOrgId
            });
          }
        } else {
          const organizationId = assignmentOrgId;
          const created = await createClinicalClientFromBilling({
            agencyId: aid,
            organizationId,
            patientName: mapped.patientName,
            dobYmd: mapped.dobYmd,
            providerUserId,
            actingUserId: uploadedByUserId
          });
          clientId = Number(created?.id || 0);
          if (clientId) createdClientIds.add(clientId);
        }

        if (clientId) {
          await upsertClientIdentity({
            agencyId: aid,
            clientId,
            patientNameHash: mapped.patientNameHash,
            patientDobHash: mapped.patientDobHash,
            memberIdHash: mapped.memberIdHash
          });
        }
        mapped.clientId = clientId || null;

        const { lineId, inserted, updated } = await upsertBillingLine(mapped, uploadId, aid);
        if (inserted) linesInserted += 1;
        if (updated) linesUpdated += 1;

        if (clientId && lineId) {
          const encId = await upsertEncounter({
            agencyId: aid,
            clientId,
            providerUserId,
            lineId,
            row: mapped
          });
          if (encId) encountersCreated += 1;
        }
      }
    }

    clientsCreated = createdClientIds.size;
    clientsMatched = matchedClientIds.size;

    const receivablesProjected = await projectReceivablesFromLines({
      agencyId: aid,
      uploadId,
      actingUserId: uploadedByUserId
    }).catch(() => 0);

    const termResult = await autoTerminateInactiveBillingClients({
      agencyId: aid,
      actingUserId: uploadedByUserId,
      days: 60
    }).catch(() => ({ terminated: 0 }));

    const summary = {
      rowsParsed: normalizedRows.length,
      linesInserted,
      linesUpdated,
      clientsCreated,
      clientsMatched,
      createdClientIds: Array.from(createdClientIds),
      encountersCreated,
      unmatchedProviders: Array.from(unmatchedProviders).slice(0, 100),
      receivablesProjected,
      autoTerminated: Number(termResult?.terminated || 0),
      minServiceDate: minService,
      maxServiceDate: maxService
    };

    await pool.execute(
      `UPDATE billing_report_uploads
       SET status = 'completed',
           rows_parsed = ?,
           lines_inserted = ?,
           lines_updated = ?,
           clients_created = ?,
           clients_matched = ?,
           encounters_created = ?,
           unmatched_providers_json = ?,
           result_summary_json = ?,
           min_service_date = ?,
           max_service_date = ?,
           completed_at = NOW()
       WHERE id = ?`,
      [
        summary.rowsParsed,
        linesInserted,
        linesUpdated,
        clientsCreated,
        clientsMatched,
        encountersCreated,
        JSON.stringify(summary.unmatchedProviders),
        JSON.stringify(summary),
        minService,
        maxService,
        uploadId
      ]
    );

    return { uploadId, ...summary };
  } catch (e) {
    await pool.execute(
      `UPDATE billing_report_uploads
       SET status = 'failed', error_message = ?, completed_at = NOW()
       WHERE id = ?`,
      [String(e?.message || e).slice(0, 2000), uploadId]
    );
    throw e;
  }
}

export async function revertBillingReportUpload({
  agencyId,
  uploadId,
  actingUserId = null,
  deleteOrphanClients = true
}) {
  const aid = Number(agencyId);
  const uid = Number(uploadId);
  if (!aid || !uid) {
    const err = new Error('agencyId and uploadId are required');
    err.status = 400;
    throw err;
  }

  const [uploadRows] = await pool.execute(
    `SELECT * FROM billing_report_uploads WHERE id = ? AND agency_id = ? LIMIT 1`,
    [uid, aid]
  );
  const upload = uploadRows?.[0];
  if (!upload) {
    const err = new Error('Upload not found');
    err.status = 404;
    throw err;
  }
  if (upload.status === 'processing' || upload.status === 'queued') {
    const err = new Error('Upload is still processing');
    err.status = 400;
    throw err;
  }

  let summary = {};
  try {
    summary = upload.result_summary_json
      ? (typeof upload.result_summary_json === 'object'
        ? upload.result_summary_json
        : JSON.parse(upload.result_summary_json))
      : {};
  } catch {
    summary = {};
  }
  if (summary.reverted) {
    const err = new Error('Upload was already reverted');
    err.status = 400;
    throw err;
  }

  const [lines] = await pool.execute(
    `SELECT id, line_fingerprint, client_id
     FROM billing_report_lines
     WHERE agency_id = ? AND upload_id = ?`,
    [aid, uid]
  );
  const lineIds = (lines || []).map((l) => Number(l.id)).filter(Boolean);
  const fingerprints = (lines || []).map((l) => l.line_fingerprint).filter(Boolean);
  const createdClientIds = Array.isArray(summary.createdClientIds)
    ? summary.createdClientIds.map((id) => Number(id)).filter(Boolean)
    : [];

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let receivablesRemoved = 0;
    if (lineIds.length) {
      const ph = lineIds.map(() => '?').join(',');
      const [recvByLine] = await connection.execute(
        `DELETE FROM agency_receivables_report_rows
         WHERE agency_id = ? AND billing_line_id IN (${ph})`,
        [aid, ...lineIds]
      );
      receivablesRemoved += Number(recvByLine?.affectedRows || 0);
    }
    if (fingerprints.length) {
      const ph = fingerprints.map(() => '?').join(',');
      const [recvByFp] = await connection.execute(
        `DELETE FROM agency_receivables_report_rows
         WHERE agency_id = ? AND row_fingerprint IN (${ph})`,
        [aid, ...fingerprints]
      );
      receivablesRemoved += Number(recvByFp?.affectedRows || 0);
    }

    if (lineIds.length) {
      const ph = lineIds.map(() => '?').join(',');
      await connection.execute(
        `DELETE FROM billing_report_lines
         WHERE agency_id = ? AND upload_id = ? AND id IN (${ph})`,
        [aid, uid, ...lineIds]
      );
    }

    let clientsDeleted = 0;
    if (deleteOrphanClients && createdClientIds.length) {
      for (const clientId of createdClientIds) {
        const [enc] = await connection.execute(
          `SELECT 1 FROM billing_encounters WHERE client_id = ? LIMIT 1`,
          [clientId]
        );
        if (enc?.length) continue;

        const [otherLines] = await connection.execute(
          `SELECT 1 FROM billing_report_lines WHERE client_id = ? LIMIT 1`,
          [clientId]
        );
        if (otherLines?.length) continue;

        const [clientRows] = await connection.execute(
          `SELECT id, source FROM clients WHERE id = ? AND agency_id = ? LIMIT 1`,
          [clientId, aid]
        );
        const client = clientRows?.[0];
        if (!client || String(client.source || '') !== 'BILLING_IMPORT') continue;

        await connection.execute(`DELETE FROM client_provider_assignments WHERE client_id = ?`, [clientId]);
        await connection.execute(`DELETE FROM clients WHERE id = ? AND agency_id = ?`, [clientId, aid]);
        clientsDeleted += 1;
      }
    }

    const revertedSummary = {
      ...summary,
      reverted: true,
      revertedAt: new Date().toISOString(),
      revertedByUserId: actingUserId || null,
      revertedLines: lineIds.length,
      revertedReceivables: receivablesRemoved,
      revertedClientsDeleted: clientsDeleted
    };

    await connection.execute(
      `UPDATE billing_report_uploads
       SET lines_inserted = 0,
           lines_updated = 0,
           encounters_created = 0,
           clients_created = 0,
           result_summary_json = ?
       WHERE id = ? AND agency_id = ?`,
      [JSON.stringify(revertedSummary), uid, aid]
    );

    await connection.commit();
    return {
      uploadId: uid,
      linesRemoved: lineIds.length,
      receivablesRemoved,
      clientsDeleted,
      note: 'Matched clients and auto-termination status changes are not reverted.'
    };
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}

export function decryptBillingLinePatientName(row) {
  if (!row?.patient_name_ciphertext_b64) return '';
  try {
    return decryptBillingSecret({
      ciphertextB64: row.patient_name_ciphertext_b64,
      ivB64: row.patient_name_iv_b64,
      authTagB64: row.patient_name_auth_tag_b64
    });
  } catch {
    return '';
  }
}

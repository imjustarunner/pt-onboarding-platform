import multer from 'multer';
import XLSX from 'xlsx';
import { parse as parseCsv } from 'csv-parse/sync';
import { validationResult } from 'express-validator';
import pool from '../config/database.js';
import UserInfoValue from '../models/UserInfoValue.model.js';
import ProviderSearchIndex from '../models/ProviderSearchIndex.model.js';
import User from '../models/User.model.js';
import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file?.originalname || '').toLowerCase();
    if (file.mimetype === 'text/csv' || name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type. Only CSV/XLSX files are allowed.'), false);
  }
});

function parseSheet(buffer, filename) {
  const name = String(filename || '').toLowerCase();
  if (name.endsWith('.csv')) {
    // XLSX can parse CSV too.
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    return rows;
  }
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

function normalizeHeader(h) {
  return String(h || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSheetFlexible(buffer, filename) {
  const name = String(filename || '').toLowerCase();
  if (!name.endsWith('.csv')) return parseSheet(buffer, filename);

  // CSV: detect delimiter (comma vs semicolon) from first non-empty line
  const text = buffer.toString('utf8');
  const firstLine = (text.split(/\r?\n/).find((l) => String(l || '').trim()) || '').trim();
  const delim = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';

  const records = parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    delimiter: delim,
    trim: true
  });
  return Array.isArray(records) ? records : [];
}

function toBool(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  return ['true', 'yes', 'y', '1', 't'].includes(s);
}

function toDateString(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString().split('T')[0];
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return s;
  return null;
}

function isRestrictedFieldKey(fieldKey) {
  const s = String(fieldKey || '').toLowerCase();
  return (
    s.includes('password') ||
    s.includes('ssn') ||
    s === 'tax_id' ||
    s.includes('medicaid_password') ||
    s.includes('itsco_password')
  );
}

function normalizeBooleanString(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y';
}

function normalizeMultiSelectStored(raw) {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) return raw.length ? JSON.stringify(raw) : null;
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.length ? JSON.stringify(parsed) : null;
  } catch {
    // fall through
  }
  const arr = s.split(',').map((x) => x.trim()).filter(Boolean);
  return arr.length ? JSON.stringify(arr) : null;
}

async function suggestProviderBulkCreateHeaderMapping({ normalizedHeaders }) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) return null;

  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const headers = (normalizedHeaders || []).map((h) => String(h || '').trim()).filter(Boolean);
  if (!headers.length) return null;

  const prompt = `
You are helping map CSV/XLSX provider import headers to our internal fields.

Given this list of normalized headers (lowercase, spaces, no punctuation):
${JSON.stringify(headers)}

Return ONLY valid JSON with these keys:
{
  "providerNameHeader": string|null,
  "statusHeader": string|null,
  "credentialHeader": string|null,
  "displayNameHeader": string|null,
  "acceptsMedicaidHeader": string|null,
  "acceptsCommercialHeader": string|null,
  "acceptsTricareHeader": string|null,
  "backgroundCheckDateHeader": string|null,
  "backgroundCheckStatusHeader": string|null,
  "clearedToStartHeader": string|null,
  "backgroundCheckNotesHeader": string|null,
  "highBehavioralNeedsHeader": string|null,
  "suicidalHeader": string|null,
  "substanceUseHeader": string|null,
  "traumaHeader": string|null,
  "skillsHeader": string|null,
  "clinicianNotesHeader": string|null
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

async function suggestEmployeeInfoHeaderMapping({ normalizedHeaders }) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) return null;

  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const headers = (normalizedHeaders || []).map((h) => String(h || '').trim()).filter(Boolean);
  if (!headers.length) return null;

  const prompt = `
You are helping map CSV/XLSX Employee Info (Google Form export) headers to our internal fields.

Given this list of normalized headers (lowercase, spaces, no punctuation):
${JSON.stringify(headers)}

Return ONLY valid JSON with these keys:
{
  "firstNameHeader": string|null,
  "lastNameHeader": string|null,
  "nameHeader": string|null,
  "startDateHeader": string|null,
  "birthdateHeader": string|null,
  "stateOfBirthHeader": string|null,
  "personalEmailHeader": string|null,
  "mailingAddressHeader": string|null,
  "cellPhoneHeader": string|null,
  "educationHeader": string|null,
  "licenseNumberHeader": string|null,
  "licenseIssuedDateHeader": string|null,
  "licenseExpiresDateHeader": string|null,
  "licenseUploadHeader": string|null,
  "hasNpiHeader": string|null,
  "npiNumberHeader": string|null,
  "taxonomyHeader": string|null,
  "caqhHeader": string|null,
  "medicareNumberHeader": string|null,
  "taxIdHeader": string|null,
  "medicaidProviderTypeHeader": string|null,
  "medicaidLocationHeader": string|null,
  "medicaidEffectiveDateHeader": string|null,
  "revalidationDateHeader": string|null,
  "outsideSchoolInterestHeader": string|null,
  "outsideSchoolHoursHeader": string|null,
  "schoolDaysHeader": string|null,
  "positionHeader": string|null,
  "locationWorkingAtHeader": string|null,
  "previousAddressHeader": string|null,
  "resumeUploadHeader": string|null,
  "headshotUploadHeader": string|null,
  "idealClientHeader": string|null,
  "helpOfferHeader": string|null,
  "empathyHeader": string|null,
  "specialtiesHeader": string|null,
  "topThreeSpecialtiesHeader": string|null,
  "workExperienceHeader": string|null,
  "certificationsHeader": string|null,
  "avoidClientsHeader": string|null,
  "whyCounselorHeader": string|null
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

  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

async function ensureProviderFieldDefinitions({ agencyId, createdByUserId }) {
  const defs = [
    { key: 'provider_status', label: 'Provider Status', type: 'text' },
    { key: 'provider_credential', label: 'Credential', type: 'text' },
    { key: 'provider_display_name', label: 'Display Name', type: 'text' },
    { key: 'provider_accepts_medicaid', label: 'Accepts Medicaid', type: 'boolean' },
    { key: 'provider_accepts_commercial', label: 'Accepts Commercial', type: 'boolean' },
    { key: 'provider_accepts_tricare', label: 'Accepts Tricare', type: 'boolean' },
    { key: 'provider_background_check_date', label: 'Background Check Date', type: 'date' },
    { key: 'provider_background_check_status', label: 'Background Check Status', type: 'text' },
    { key: 'provider_cleared_to_start', label: 'Cleared to Start', type: 'boolean' },
    { key: 'provider_background_check_notes', label: 'Background Check Notes', type: 'textarea' },
    { key: 'provider_risk_high_behavioral_needs', label: 'High Behavioral Needs', type: 'boolean' },
    { key: 'provider_risk_suicidal', label: 'Suicidal', type: 'boolean' },
    { key: 'provider_risk_substance_use', label: 'Substance Use', type: 'boolean' },
    { key: 'provider_risk_trauma', label: 'Trauma', type: 'boolean' },
    { key: 'provider_risk_skills', label: 'Skills', type: 'boolean' },
    { key: 'provider_clinician_notes', label: 'Clinician Notes', type: 'textarea' }
  ];

  // Insert missing definitions (do not overwrite existing)
  for (const d of defs) {
    await pool.execute(
      `INSERT INTO user_info_field_definitions
        (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
       VALUES (?, ?, ?, NULL, FALSE, FALSE, ?, NULL, 0, ?)
       ON DUPLICATE KEY UPDATE field_key = field_key`,
      [d.key, d.label, d.type, agencyId, createdByUserId || null]
    );
  }

  const keys = defs.map((d) => d.key);
  const placeholders = keys.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, field_key FROM user_info_field_definitions WHERE agency_id = ? AND field_key IN (${placeholders})`,
    [agencyId, ...keys]
  );
  const map = new Map((rows || []).map((r) => [r.field_key, r.id]));
  return map;
}

function parseClinicianName(raw) {
  const name = String(raw || '').trim();
  if (!name) return { firstName: '', lastName: '', canonical: '' };

  let first = '';
  let last = '';
  if (name.includes(',')) {
    const [l, f] = name.split(',').map((s) => String(s || '').trim());
    const fTok = String(f || '').split(/\s+/).filter(Boolean)[0] || '';
    first = fTok;
    last = l || '';
  } else {
    const parts = name.split(/\s+/).filter(Boolean);
    first = parts[0] || '';
    last = parts.length > 1 ? parts[parts.length - 1] : '';
  }

  const canonical = (first && last) ? `${first} ${last}`.trim() : name;
  return { firstName: first, lastName: last, canonical };
}

function inferUserLifecycleBucketFromImportStatus(rawStatus) {
  const s = String(rawStatus ?? '').trim().toLowerCase();
  if (!s) return null;
  // If the source says inactive/terminated/etc, treat as archived.
  const archivedSignals = [
    'inactive',
    'archived',
    'archive',
    'terminated',
    'term',
    'deactivated',
    'disabled',
    'former',
    'left',
    'offboard',
    'off-board',
    'separated',
    'separation'
  ];
  if (archivedSignals.some((k) => s.includes(k))) return 'archived';

  const activeSignals = ['active', 'current', 'employed', 'employee'];
  if (activeSignals.some((k) => s.includes(k))) return 'active';

  return null;
}

async function applyUserStatusBestEffort({ userId, desiredBucket }) {
  const uid = Number(userId);
  if (!uid) return null;
  if (!desiredBucket) return null;

  const candidates =
    desiredBucket === 'archived'
      ? ['ARCHIVED', 'archived', 'terminated']
      : ['ACTIVE_EMPLOYEE', 'active', 'completed', 'pending'];

  for (const status of candidates) {
    try {
      await pool.execute('UPDATE users SET status = ? WHERE id = ?', [status, uid]);
      return status;
    } catch (e) {
      // Different DBs/environments have different ENUMs; try next candidate.
      const msg = String(e?.message || '');
      if (e?.code === 'ER_WRONG_VALUE_FOR_FIELD' || msg.includes('Incorrect') || msg.includes('Data truncated')) {
        continue;
      }
      throw e;
    }
  }
  return null;
}

async function findOrCreateClinicianUser({ agencyId, clinicianName, desiredStatusBucket = null }) {
  const { firstName, lastName, canonical } = parseClinicianName(clinicianName);
  if (!canonical) return { userId: null, created: false };

  // First, try to match existing agency user by first+last.
  if (firstName && lastName) {
    const [rows] = await pool.execute(
      `SELECT u.id
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND u.first_name = ?
         AND u.last_name = ?
         AND u.role IN ('provider','clinician')
       LIMIT 1`,
      [agencyId, firstName, lastName]
    );
    if (rows?.[0]?.id) {
      await applyUserStatusBestEffort({ userId: rows[0].id, desiredBucket: desiredStatusBucket });
      return { userId: rows[0].id, created: false };
    }
  }

  // Deterministic placeholder email to avoid dupes across imports.
  const hash = crypto.createHash('sha256').update(`${agencyId}:${canonical.toLowerCase()}`).digest('hex').slice(0, 10);
  const email = `provider+${hash}@example.invalid`;
  const [existing] = await pool.execute(`SELECT id FROM users WHERE email = ? AND role IN ('provider','clinician') LIMIT 1`, [email]);
  if (existing?.[0]?.id) {
    await pool.execute(
      `INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id`,
      [existing[0].id, agencyId]
    );
    await applyUserStatusBestEffort({ userId: existing[0].id, desiredBucket: desiredStatusBucket });
    return { userId: existing[0].id, created: false };
  }

  const safeStatusCandidates =
    desiredStatusBucket === 'archived'
      ? ['ARCHIVED', 'archived', 'terminated']
      : ['ACTIVE_EMPLOYEE', 'active', 'completed', 'pending'];
  let inserted = false;
  let userId = null;
  let lastErr = null;
  for (const status of safeStatusCandidates) {
    try {
      const [result] = await pool.execute(
        `INSERT INTO users (role, status, first_name, last_name, email)
         VALUES ('provider', ?, ?, ?, ?)`,
        [status, firstName || 'Provider', lastName || 'User', email]
      );
      userId = result.insertId;
      inserted = true;
      break;
    } catch (e) {
      lastErr = e;
      if (e?.code === 'ER_WRONG_VALUE_FOR_FIELD' || String(e?.message || '').includes('Incorrect')) continue;
      throw e;
    }
  }
  if (!inserted || !userId) throw lastErr || new Error('Failed to create provider user');

  await pool.execute(
    `INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE user_id = user_id`,
    [userId, agencyId]
  );
  return { userId, created: true };
}

async function hasUsersPersonalEmailColumn() {
  try {
    const dbName = process.env.DB_NAME || 'onboarding_stage';
    const [cols] = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'personal_email' LIMIT 1",
      [dbName]
    );
    return (cols || []).length > 0;
  } catch {
    return false;
  }
}

async function findUserIdByAnyEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !e.includes('@')) return null;

  const hasPersonal = await hasUsersPersonalEmailColumn();
  const hasAliases = await hasUserLoginEmailsTable();

  // Build a safe query depending on which tables/columns exist.
  // Priority is "any match" across personal email, login email, or alias emails.
  const where = [];
  const params = [];

  if (hasPersonal) {
    where.push('LOWER(TRIM(u.personal_email)) = ?');
    params.push(e);
  }
  // users.email is the canonical login email in this app.
  where.push('LOWER(TRIM(u.email)) = ?');
  params.push(e);

  let joinAliases = '';
  if (hasAliases) {
    joinAliases = 'LEFT JOIN user_login_emails ule ON ule.user_id = u.id';
    where.push('LOWER(TRIM(ule.email)) = ?');
    params.push(e);
  }

  const [rows] = await pool.execute(
    `SELECT u.id
     FROM users u
     ${joinAliases}
     WHERE (${where.join(' OR ')})
     LIMIT 1`,
    params
  );
  return rows?.[0]?.id || null;
}

function parseTabularToRowsArray(buffer, filename) {
  const name = String(filename || '').toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    return Array.isArray(rows) ? rows : [];
  }

  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');
  const firstLine = (text.split(/\r?\n/).find((l) => String(l || '').trim()) || '').trim();
  const delim = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
  const records = parseCsv(text, {
    columns: false,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    delimiter: delim,
    trim: true
  });
  return Array.isArray(records) ? records : [];
}

function isHeaderRowForEmailUpdate(row) {
  const cells = (Array.isArray(row) ? row : []).map((c) => String(c || '').trim().toLowerCase());
  if (!cells.length) return false;
  if (cells.some((c) => c.includes('email'))) return true;
  if (cells.some((c) => c.includes('first') && c.includes('name'))) return true;
  if (cells.some((c) => c.includes('last') && c.includes('name'))) return true;
  return false;
}

function normalizeNameKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstLastFromCells(firstCell, lastCell) {
  const firstRaw = String(firstCell || '').trim();
  const lastRaw = String(lastCell || '').trim();

  // Primary expected format: A=First, B=Last
  if (firstRaw && lastRaw) {
    const fTok = firstRaw.split(/\s+/).filter(Boolean)[0] || '';
    const lTok = lastRaw.split(/\s+/).filter(Boolean).slice(-1)[0] || '';
    return { first: fTok, last: lTok };
  }

  // Fallbacks (support older full-name-in-one-cell variants)
  const combined = String(firstRaw || lastRaw || '').trim();
  if (!combined) return { first: '', last: '' };

  // "Last, First"
  if (combined.includes(',')) {
    const [l, f] = combined.split(',').map((s) => String(s || '').trim());
    const first = (f || '').split(/\s+/).filter(Boolean)[0] || '';
    const last = (l || '').split(/\s+/).filter(Boolean).slice(-1)[0] || '';
    return { first, last };
  }

  const parts = combined.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return { first: parts[0], last: parts[parts.length - 1] };

  return { first: '', last: '' };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  const e = normalizeEmail(email);
  if (!e || !e.includes('@')) return false;
  // Basic sanity regex; we don't need full RFC.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

async function hasUsersColumn(columnName) {
  try {
    const dbName = process.env.DB_NAME || 'onboarding_stage';
    const [cols] = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ? LIMIT 1",
      [dbName, columnName]
    );
    return (cols || []).length > 0;
  } catch {
    return false;
  }
}

async function hasUserLoginEmailsTable() {
  try {
    const dbName = process.env.DB_NAME || 'onboarding_stage';
    const [tables] = await pool.execute(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_login_emails' LIMIT 1",
      [dbName]
    );
    return (tables || []).length > 0;
  } catch {
    return false;
  }
}

export const previewProviderImport = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: { message: 'No CSV/XLSX file uploaded' } });
      const rows = parseSheet(req.file.buffer, req.file.originalname);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: { message: 'File is empty or contains no rows' } });
      }
      const headers = Object.keys(rows[0] || {});
      res.json({
        headers,
        sampleRows: rows.slice(0, 10),
        rowCount: rows.length
      });
    } catch (e) {
      next(e);
    }
  }
];

export const applyProviderImport = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
      }
      if (!req.file) return res.status(400).json({ error: { message: 'No CSV/XLSX file uploaded' } });

      const agencyId = req.body.agencyId ? parseInt(req.body.agencyId, 10) : null;
      const matchEmailColumn = String(req.body.matchEmailColumn || '').trim();
      const mappingRaw = req.body.mapping ? (typeof req.body.mapping === 'string' ? JSON.parse(req.body.mapping) : req.body.mapping) : {};
      const dryRun = req.body.dryRun === 'true' || req.body.dryRun === true;

      if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
      if (!matchEmailColumn) return res.status(400).json({ error: { message: 'matchEmailColumn is required' } });
      if (!mappingRaw || typeof mappingRaw !== 'object') return res.status(400).json({ error: { message: 'mapping must be an object' } });

      const rows = parseSheet(req.file.buffer, req.file.originalname);
      const results = {
        rowCount: rows.length,
        matched: 0,
        unmatched: 0,
        updatesPlanned: 0,
        updatesApplied: 0,
        unmatchedRows: [],
        errors: []
      };

      // mappingRaw: { fieldKey: columnName }
      const mappings = Object.entries(mappingRaw)
        .map(([fieldKey, col]) => ({ fieldKey: String(fieldKey || '').trim(), col: String(col || '').trim() }))
        .filter((m) => m.fieldKey && m.col);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || {};
        const email = row[matchEmailColumn];
        const userId = await findUserIdByAnyEmail(email);
        if (!userId) {
          results.unmatched += 1;
          if (results.unmatchedRows.length < 50) {
            results.unmatchedRows.push({ rowIndex: i + 1, personalEmail: String(email || '').trim(), row });
          }
          continue;
        }

        results.matched += 1;
        const values = [];
        for (const m of mappings) {
          const v = row[m.col];
          if (v === undefined) continue;
          values.push({ fieldKey: m.fieldKey, value: v });
        }

        // Convert fieldKey → fieldDefinitionId (canonical field_keys)
        // Security: do not import restricted/sensitive keys from spreadsheets.
        const filtered = values.filter((v) => v?.fieldKey && !isRestrictedFieldKey(v.fieldKey));
        if (!filtered.length) continue;

        // Look up definitions in one shot per row.
        const fieldKeys = filtered.map((v) => v.fieldKey);
        const placeholders = fieldKeys.map(() => '?').join(',');
        const [defs] = await pool.execute(
          `SELECT id, field_key, field_type FROM user_info_field_definitions WHERE field_key IN (${placeholders})`,
          fieldKeys
        );
        const byKey = new Map((defs || []).map((d) => [d.field_key, d]));

        const upserts = [];
        for (const fv of filtered) {
          const def = byKey.get(fv.fieldKey);
          if (!def?.id) continue;
          const fieldType = String(def.field_type || '');
          let stored;
          if (fieldType === 'multi_select') {
            // Accept comma-separated or JSON arrays; store as JSON string.
            stored = normalizeMultiSelectStored(fv.value);
          } else if (fieldType === 'boolean') {
            stored = normalizeBooleanString(fv.value) ? 'true' : 'false';
          } else {
            const s = String(fv.value ?? '').trim();
            stored = s ? s : null;
          }
          upserts.push({ fieldDefinitionId: def.id, value: stored });
        }

        if (!upserts.length) continue;
        results.updatesPlanned += upserts.length;

        if (!dryRun) {
          await UserInfoValue.bulkUpdate(userId, upserts);
          // Refresh provider search index for this user in this agency.
          await ProviderSearchIndex.upsertForUserInAgency({ userId, agencyId });
          results.updatesApplied += upserts.length;
        }
      }

      res.json(results);
    } catch (e) {
      next(e);
    }
  }
];

// Admin quick-import: paste `field_key: value` lines (or TSV `field_key<TAB>value`).
// Writes directly into canonical profile fields (user_info_values) and reindexes provider_search_index.
export const importKvPaste = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = parseInt(req.body.agencyId, 10);
    const userIdRaw = req.body.userId ? parseInt(req.body.userId, 10) : null;
    const personalEmail = String(req.body.personalEmail || '').trim();
    const kvText = String(req.body.kvText || '');

    let userId = Number.isInteger(userIdRaw) && userIdRaw > 0 ? userIdRaw : null;
    if (!userId) userId = await findUserIdByAnyEmail(personalEmail);
    if (!userId) {
      return res.status(404).json({
        error: { message: 'User not found (provide userId or a personalEmail that matches users.personal_email).' }
      });
    }

    const lines = kvText
      .split(/\r?\n/)
      .map((l) => String(l || '').trim())
      .filter((l) => l && !l.startsWith('#'));

    const pairs = [];
    for (const line of lines) {
      const tabIdx = line.indexOf('\t');
      if (tabIdx > 0) {
        const k = line.slice(0, tabIdx).trim();
        const v = line.slice(tabIdx + 1).trim();
        if (k) pairs.push({ fieldKey: k, value: v });
        continue;
      }
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const k = line.slice(0, colonIdx).trim();
        const v = line.slice(colonIdx + 1).trim();
        if (k) pairs.push({ fieldKey: k, value: v });
      }
    }

    const filtered = pairs.filter((p) => p?.fieldKey && !isRestrictedFieldKey(p.fieldKey));
    if (!filtered.length) {
      return res.json({ ok: true, userId, agencyId, updatesPlanned: 0, updatesApplied: 0, unknownKeys: [] });
    }

    const fieldKeys = Array.from(new Set(filtered.map((p) => String(p.fieldKey).trim()))).filter(Boolean);
    const placeholders = fieldKeys.map(() => '?').join(',');
    const [defs] = await pool.execute(
      `SELECT id, field_key, field_type
       FROM user_info_field_definitions
       WHERE field_key IN (${placeholders})`,
      fieldKeys
    );
    const byKey = new Map((defs || []).map((d) => [String(d.field_key), d]));
    const unknownKeys = fieldKeys.filter((k) => !byKey.has(k));

    const upserts = [];
    for (const p of filtered) {
      const def = byKey.get(String(p.fieldKey).trim());
      if (!def?.id) continue;
      const fieldType = String(def.field_type || '');
      let stored;
      if (fieldType === 'multi_select') stored = normalizeMultiSelectStored(p.value);
      else if (fieldType === 'boolean') stored = normalizeBooleanString(p.value) ? 'true' : 'false';
      else {
        const s = String(p.value ?? '').trim();
        stored = s ? s : null;
      }
      upserts.push({ fieldDefinitionId: def.id, value: stored });
    }

    if (!upserts.length) {
      return res.json({ ok: true, userId, agencyId, updatesPlanned: 0, updatesApplied: 0, unknownKeys });
    }

    await UserInfoValue.bulkUpdate(userId, upserts);
    await ProviderSearchIndex.upsertForUserInAgency({ userId, agencyId });

    res.json({
      ok: true,
      userId,
      agencyId,
      updatesPlanned: upserts.length,
      updatesApplied: upserts.length,
      unknownKeys
    });
  } catch (e) {
    next(e);
  }
};

// Admin safety tool: purge profile values for an agency and a list of field_keys.
// This is a best-effort rollback mechanism for bulk imports when we don't have import-run provenance.
export const purgeProviderProfileValues = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = parseInt(req.body.agencyId, 10);
    const fieldKeys = Array.isArray(req.body.fieldKeys) ? req.body.fieldKeys : [];
    const updatedAfterRaw = req.body.updatedAfter ? String(req.body.updatedAfter) : '';
    const dryRun = req.body.dryRun === true || req.body.dryRun === 'true';
    const confirmText = String(req.body.confirmText || '').trim();

    if (confirmText !== 'PURGE') {
      return res.status(400).json({ error: { message: "confirmText must be exactly 'PURGE'." } });
    }

    const keys = Array.from(new Set(fieldKeys.map((k) => String(k || '').trim()).filter(Boolean)));
    if (!keys.length) {
      return res.status(400).json({ error: { message: 'fieldKeys is required (non-empty).' } });
    }
    if (keys.length > 250) {
      return res.status(400).json({ error: { message: 'Too many fieldKeys (max 250).' } });
    }

    let updatedAfter = null;
    if (updatedAfterRaw) {
      const d = new Date(updatedAfterRaw);
      if (!Number.isFinite(d.getTime())) {
        return res.status(400).json({ error: { message: 'updatedAfter must be a valid ISO datetime or date string.' } });
      }
      updatedAfter = d;
    }

    const placeholders = keys.map(() => '?').join(',');
    const params = [agencyId, ...keys];
    let timeClause = '';
    if (updatedAfter) {
      timeClause = ' AND uiv.updated_at >= ?';
      params.push(updatedAfter);
    }

    // Count + collect affected users (limited) for reporting/reindexing.
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) as cnt
       FROM user_info_values uiv
       JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
       JOIN user_agencies ua ON ua.user_id = uiv.user_id
       WHERE ua.agency_id = ?
         AND uifd.field_key IN (${placeholders})
         ${timeClause}`,
      params
    );
    const matched = Number(countRows?.[0]?.cnt || 0);

    const [userRows] = await pool.execute(
      `SELECT DISTINCT uiv.user_id
       FROM user_info_values uiv
       JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
       JOIN user_agencies ua ON ua.user_id = uiv.user_id
       WHERE ua.agency_id = ?
         AND uifd.field_key IN (${placeholders})
         ${timeClause}
       LIMIT 2000`,
      params
    );
    const affectedUserIds = (userRows || []).map((r) => Number(r.user_id)).filter((n) => Number.isInteger(n) && n > 0);

    if (dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        agencyId,
        fieldKeyCount: keys.length,
        updatedAfter: updatedAfter ? updatedAfter.toISOString() : null,
        matchedValues: matched,
        affectedUsers: affectedUserIds.length
      });
    }

    const [delResult] = await pool.execute(
      `DELETE uiv
       FROM user_info_values uiv
       JOIN user_info_field_definitions uifd ON uiv.field_definition_id = uifd.id
       JOIN user_agencies ua ON ua.user_id = uiv.user_id
       WHERE ua.agency_id = ?
         AND uifd.field_key IN (${placeholders})
         ${timeClause}`,
      params
    );

    // Best-effort: refresh provider search index for affected users.
    try {
      for (const userId of affectedUserIds) {
        await ProviderSearchIndex.upsertForUserInAgency({ userId, agencyId });
      }
    } catch {
      // ignore
    }

    res.json({
      ok: true,
      agencyId,
      fieldKeyCount: keys.length,
      updatedAfter: updatedAfter ? updatedAfter.toISOString() : null,
      deletedValues: Number(delResult?.affectedRows || 0),
      matchedValues: matched,
      affectedUsers: affectedUserIds.length
    });
  } catch (e) {
    next(e);
  }
};

export const bulkCreateProvidersFromSchoolList = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
      }
      if (!req.file) return res.status(400).json({ error: { message: 'No CSV/XLSX file uploaded' } });

      const agencyId = req.body.agencyId ? parseInt(req.body.agencyId, 10) : null;
      if (!Number.isInteger(agencyId) || agencyId < 1) {
        return res.status(400).json({ error: { message: 'agencyId is required' } });
      }

      const rows = parseSheetFlexible(req.file.buffer, req.file.originalname);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: { message: 'File is empty or contains no rows' } });
      }

      const fieldIdsByKey = await ensureProviderFieldDefinitions({ agencyId, createdByUserId: req.user?.id });

      const results = {
        rowCount: rows.length,
        createdProviders: 0,
        updatedProviders: 0,
        errors: [],
        aiMappingUsed: null
      };

      const useAi = req.body?.useAi === 'true' || req.body?.useAi === true;
      let aiMapping = null;
      if (useAi) {
        try {
          const headers = Object.keys(rows[0] || {}).map((h) => normalizeHeader(h));
          aiMapping = await suggestProviderBulkCreateHeaderMapping({ normalizedHeaders: headers });
          results.aiMappingUsed = aiMapping;
        } catch {
          aiMapping = null;
          results.aiMappingUsed = null;
        }
      }

      for (let i = 0; i < rows.length; i++) {
        const raw = rows[i] || {};
        const normalized = {};
        for (const [k, v] of Object.entries(raw)) normalized[normalizeHeader(k)] = v;

        const aiNameHeader = aiMapping?.providerNameHeader ? String(aiMapping.providerNameHeader).trim().toLowerCase() : '';
        const clinicianName =
          (aiNameHeader ? normalized[aiNameHeader] : null) ||
          normalized['clinician name'] ||
          normalized['display name'] ||
          normalized['clinician'] ||
          normalized['name'] ||
          '';
        if (!String(clinicianName || '').trim()) continue;

        try {
          const pick = (key) => {
            const h = String(key || '').trim().toLowerCase();
            if (!h) return undefined;
            return normalized[h];
          };

          const rawImportStatus = pick(aiMapping?.statusHeader) ?? normalized['status'] ?? '';
          const desiredStatusBucket = inferUserLifecycleBucketFromImportStatus(rawImportStatus);

          const { userId, created } = await findOrCreateClinicianUser({
            agencyId,
            clinicianName,
            desiredStatusBucket: desiredStatusBucket || null
          });
          if (!userId) continue;

          // Bulk-write user_info_values for these provider_* fields.
          const upserts = [];
          const setVal = (fieldKey, value) => {
            const id = fieldIdsByKey.get(fieldKey);
            if (!id) return;
            upserts.push({ fieldDefinitionId: id, value });
          };

          setVal('provider_status', String((pick(aiMapping?.statusHeader) ?? normalized['status'] ?? '') || '').trim() || null);
          setVal('provider_credential', String((pick(aiMapping?.credentialHeader) ?? normalized['credential'] ?? '') || '').trim() || null);
          setVal('provider_display_name', String((pick(aiMapping?.displayNameHeader) ?? normalized['display name'] ?? '') || '').trim() || null);
          setVal('provider_accepts_medicaid', toBool(pick(aiMapping?.acceptsMedicaidHeader) ?? normalized['accepts medicaid']) ? 'true' : 'false');
          setVal('provider_accepts_commercial', toBool(pick(aiMapping?.acceptsCommercialHeader) ?? normalized['accepts commercial']) ? 'true' : 'false');
          setVal('provider_accepts_tricare', toBool(pick(aiMapping?.acceptsTricareHeader) ?? normalized['accepts tricare']) ? 'true' : 'false');
          setVal('provider_background_check_date', toDateString(pick(aiMapping?.backgroundCheckDateHeader) ?? normalized['background check date']));
          setVal(
            'provider_background_check_status',
            String((pick(aiMapping?.backgroundCheckStatusHeader) ?? normalized['bckgrnd status'] ?? normalized['background status'] ?? '') || '').trim() || null
          );
          setVal('provider_cleared_to_start', toBool(pick(aiMapping?.clearedToStartHeader) ?? normalized['cleared to start']) ? 'true' : 'false');
          setVal(
            'provider_background_check_notes',
            String((pick(aiMapping?.backgroundCheckNotesHeader) ?? normalized['bckgrnd notes'] ?? normalized['background notes'] ?? '') || '').trim() || null
          );
          setVal('provider_risk_high_behavioral_needs', toBool(pick(aiMapping?.highBehavioralNeedsHeader) ?? normalized['high behavioral needs']) ? 'true' : 'false');
          setVal('provider_risk_suicidal', toBool(pick(aiMapping?.suicidalHeader) ?? normalized['suicidal']) ? 'true' : 'false');
          setVal('provider_risk_substance_use', toBool(pick(aiMapping?.substanceUseHeader) ?? normalized['substance use']) ? 'true' : 'false');
          setVal('provider_risk_trauma', toBool(pick(aiMapping?.traumaHeader) ?? normalized['trauma']) ? 'true' : 'false');
          setVal('provider_risk_skills', toBool(pick(aiMapping?.skillsHeader) ?? normalized['skills']) ? 'true' : 'false');
          setVal('provider_clinician_notes', String((pick(aiMapping?.clinicianNotesHeader) ?? normalized['clinician notes'] ?? '') || '').trim() || null);

          if (upserts.length) await UserInfoValue.bulkUpdate(userId, upserts);
          await ProviderSearchIndex.upsertForUserInAgency({ userId, agencyId });

          if (created) results.createdProviders += 1;
          else results.updatedProviders += 1;
        } catch (e) {
          if (results.errors.length < 50) {
            results.errors.push({ rowIndex: i + 2, clinicianName: String(clinicianName || '').trim(), error: e.message });
          }
        }
      }

      res.json(results);
    } catch (e) {
      next(e);
    }
  }
];

// Bulk update user emails from a simple CSV/XLSX:
// - Column B: "First Last" (or "Last, First"; or first name if column A has last name)
// - Column C: email
export const bulkUpdateProviderEmails = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: { message: 'No CSV/XLSX file uploaded' } });
      const agencyId = req.body.agencyId ? parseInt(req.body.agencyId, 10) : null;
      const dryRun = req.body.dryRun === 'true' || req.body.dryRun === true;
      const createIfMissing = req.body.createIfMissing === undefined
        ? true
        : (req.body.createIfMissing === 'true' || req.body.createIfMissing === true);
      if (!Number.isInteger(agencyId) || agencyId < 1) {
        return res.status(400).json({ error: { message: 'agencyId is required' } });
      }

      const rows = parseTabularToRowsArray(req.file.buffer, req.file.originalname);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: { message: 'File is empty or contains no rows' } });
      }

      const startIndex = isHeaderRowForEmailUpdate(rows[0]) ? 1 : 0;
      const hasWorkEmail = await hasUsersColumn('work_email');
      const hasUsername = await hasUsersColumn('username');
      const hasAliases = await hasUserLoginEmailsTable();
      const hasStatus = await hasUsersColumn('status');
      const hasIsActive = await hasUsersColumn('is_active');

      // Preload agency users and build a robust name lookup map:
      // key: normalized "first last" => user record
      const [agencyUsers] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email${hasWorkEmail ? ', u.work_email' : ''}${hasUsername ? ', u.username' : ''}
         FROM users u
         INNER JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id = ?`,
        [agencyId]
      );
      const nameToUsers = new Map();
      const addToMap = (key, userRow) => {
        if (!key) return;
        const arr = nameToUsers.get(key) || [];
        arr.push(userRow);
        nameToUsers.set(key, arr);
      };
      for (const u of agencyUsers || []) {
        const first = String(u.first_name || '').trim();
        const last = String(u.last_name || '').trim();
        const key = normalizeNameKey(`${first} ${last}`);
        addToMap(key, u);
        // Also store "last first" in case the CSV is swapped
        addToMap(normalizeNameKey(`${last} ${first}`), u);
      }

      const results = {
        agencyId,
        dryRun,
        createIfMissing,
        processed: 0,
        matchedUsers: 0,
        updatedUsers: 0,
        createdUsers: 0,
        assignedToAgency: 0,
        createdAliases: 0,
        skippedInvalidEmail: 0,
        skippedNoName: 0,
        skippedNoMatch: 0,
        skippedEmailInUse: 0,
        errors: [],
        sampleUnmatched: []
      };

      for (let i = startIndex; i < rows.length; i++) {
        const r = rows[i] || [];
        const firstCell = r[0]; // A
        const lastCell = r[1]; // B
        const emailCell = r[2]; // C
        const email = normalizeEmail(emailCell);
        const { first, last } = firstLastFromCells(firstCell, lastCell);
        if (!first || !last) {
          results.skippedNoName += 1;
          continue;
        }

        if (!isValidEmail(email)) {
          results.skippedInvalidEmail += 1;
          continue;
        }

        results.processed += 1;

        const nameKey = normalizeNameKey(`${first} ${last}`);
        const candidates = nameToUsers.get(nameKey) || [];

        if (!candidates || candidates.length === 0) {
          if (!createIfMissing) {
            results.skippedNoMatch += 1;
            if (results.sampleUnmatched.length < 25) {
              results.sampleUnmatched.push({ row: i + 1, first, last, email });
            }
            continue;
          }

          // Create provider user + assign to agency
          // Ensure email not used by another user (including work_email/aliases)
          const existing = await User.findByEmail(email);
          if (existing) {
            // Email already exists globally, but user isn't found by name in this agency.
            // Best-effort: assign existing user to this agency.
            results.matchedUsers += 1;
            if (dryRun) {
              results.assignedToAgency += 1;
              continue;
            }
            try {
              await pool.execute(
                `INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?)`,
                [existing.id, agencyId]
              );
              results.assignedToAgency += 1;
            } catch {
              // ignore if duplicate key / existing membership
            }
            if (hasAliases) {
              try {
                await pool.execute(
                  `INSERT INTO user_login_emails (user_id, agency_id, email)
                   VALUES (?, ?, ?)
                   ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), agency_id = VALUES(agency_id)`,
                  [existing.id, agencyId, email]
                );
                results.createdAliases += 1;
              } catch {
                // ignore
              }
            }
            continue;
          }

          results.matchedUsers += 1;
          if (dryRun) {
            results.createdUsers += 1;
            results.assignedToAgency += 1;
            if (hasAliases) results.createdAliases += 1;
            continue;
          }

          const insertCols = ['email', 'first_name', 'last_name', 'role'];
          const insertVals = [email, first, last, 'provider'];
          if (hasWorkEmail) {
            insertCols.push('work_email');
            insertVals.push(email);
          }
          // Let DB defaults handle status/is_active unless column exists and needs explicit
          if (hasStatus) {
            // Best-effort: use ACTIVE_EMPLOYEE if accepted by schema; fallback silently if not.
            insertCols.push('status');
            insertVals.push('ACTIVE_EMPLOYEE');
          }
          if (hasIsActive) {
            insertCols.push('is_active');
            insertVals.push(1);
          }

          let newUserId = null;
          try {
            const [ins] = await pool.execute(
              `INSERT INTO users (${insertCols.join(', ')}) VALUES (${insertCols.map(() => '?').join(', ')})`,
              insertVals
            );
            newUserId = ins.insertId;
          } catch (e) {
            // If status column exists but enum rejects ACTIVE_EMPLOYEE, retry without status.
            const msg = String(e?.message || '');
            if (hasStatus && (msg.includes('Incorrect') || msg.includes('Data truncated') || e?.code === 'ER_WRONG_VALUE_FOR_FIELD')) {
              const cols2 = insertCols.filter((c) => c !== 'status');
              const vals2 = insertVals.filter((_, idx) => insertCols[idx] !== 'status');
              const [ins2] = await pool.execute(
                `INSERT INTO users (${cols2.join(', ')}) VALUES (${cols2.map(() => '?').join(', ')})`,
                vals2
              );
              newUserId = ins2.insertId;
            } else {
              throw e;
            }
          }

          // Assign to agency
          try {
            await pool.execute(
              `INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?)`,
              [newUserId, agencyId]
            );
          } catch {
            // ignore
          }

          // Add to local name map so later duplicate rows resolve to this new user
          const urow = { id: newUserId, first_name: first, last_name: last, email };
          addToMap(nameKey, urow);
          addToMap(normalizeNameKey(`${last} ${first}`), urow);

          if (hasAliases) {
            try {
              await pool.execute(
                `INSERT INTO user_login_emails (user_id, agency_id, email)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), agency_id = VALUES(agency_id)`,
                [newUserId, agencyId, email]
              );
            } catch {
              // ignore
            }
          }

          results.createdUsers += 1;
          results.assignedToAgency += 1;
          if (hasAliases) results.createdAliases += 1;
          continue;
        }

        // Prefer a user with null/placeholder email if duplicates
        const pick = (candidates || []).find((u) => !u.email || String(u.email).includes('@example.invalid')) || candidates[0];

        // Ensure email not used by another user (including work_email/aliases)
        const existing = await User.findByEmail(email);
        if (existing && Number(existing.id) !== Number(pick.id)) {
          results.skippedEmailInUse += 1;
          continue;
        }

        results.matchedUsers += 1;

        if (dryRun) continue;

        // Update primary email and work email (and username best-effort)
        const updates = [];
        const params = [];

        updates.push('email = ?');
        params.push(email);

        if (hasWorkEmail) {
          updates.push('work_email = ?');
          params.push(email);
        }

        if (hasUsername) {
          // Only overwrite username if it's empty or looks like a placeholder.
          const currentUsername = String(pick.username || '').trim().toLowerCase();
          if (!currentUsername || currentUsername.includes('@example.invalid')) {
            updates.push('username = ?');
            params.push(email);
          }
        }

        params.push(pick.id);
        await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

        if (hasAliases) {
          // Best-effort: record this email as a login alias scoped to agency (does not duplicate if already present).
          try {
            await pool.execute(
              `INSERT INTO user_login_emails (user_id, agency_id, email)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), agency_id = VALUES(agency_id)`,
              [pick.id, agencyId, email]
            );
            results.createdAliases += 1;
          } catch {
            // ignore
          }
        }

        results.updatedUsers += 1;
      }

      res.json(results);
    } catch (e) {
      next(e);
    }
  }
];

// Employee Info import (legacy backfill) from a fixed-column CSV/XLSX (multiple variants).
// Uses best-effort Gemini mapping for additional fields when enabled.
export const importEmployeeInfo = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: { message: 'No CSV/XLSX file uploaded' } });
      const agencyId = req.body.agencyId ? parseInt(req.body.agencyId, 10) : null;
      const dryRun = req.body.dryRun === 'true' || req.body.dryRun === true;
      const useAi = req.body.useAi === 'true' || req.body.useAi === true;
      if (!Number.isInteger(agencyId) || agencyId < 1) {
        return res.status(400).json({ error: { message: 'agencyId is required' } });
      }

      const rows = parseTabularToRowsArray(req.file.buffer, req.file.originalname);
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: { message: 'File is empty or contains no rows' } });
      }

      const hasPersonalEmail = await hasUsersColumn('personal_email');
      const hasPersonalPhone = await hasUsersColumn('personal_phone');
      const hasWorkEmail = await hasUsersColumn('work_email');
      const hasAliases = await hasUserLoginEmailsTable();

      // Ensure user_info definitions exist for our backfill fields (platform-wide, not per agency)
      // We use is_platform_template=TRUE and agency_id=NULL when possible; fallback to agency_id=agencyId.
      const ensureDefs = async () => {
        const defs = [
          // Canonical keys (see app_form_header_map.md)
          { key: 'start_date', label: 'Start Date', type: 'date' },
          { key: 'date_of_birth', label: 'Birthdate', type: 'date' },
          { key: 'state_of_birth', label: 'State of Birth', type: 'text' },
          { key: 'mailing_address', label: 'Mailing Address', type: 'textarea' },
          { key: 'education_history', label: 'Education', type: 'textarea' },
          { key: 'license_type_number', label: 'License', type: 'text' },
          { key: 'license_issued', label: 'License Issued', type: 'date' },
          { key: 'license_expires', label: 'License Expires', type: 'date' },
          { key: 'license_upload', label: 'License Upload', type: 'text' },
          { key: 'npi_status', label: 'Do you have an NPI?', type: 'select' },
          { key: 'npi_number', label: 'NPI Number', type: 'text' },
          { key: 'taxonomy_code', label: 'Taxonomy', type: 'text' },
          { key: 'caqh_provider_id', label: 'CAQH Provider ID', type: 'text' },
          { key: 'medicaid_provider_type', label: 'Medicaid Provider Type', type: 'text' },
          { key: 'medicaid_location_id', label: 'Medicaid Location ID', type: 'text' },
          { key: 'medicaid_effective_date', label: 'Medicaid Effective Date', type: 'date' },
          { key: 'medicaid_revalidation', label: 'Medicaid Revalidation Date', type: 'date' },
          { key: 'medicare_number', label: 'Medicare Number', type: 'text' },
          { key: 'previous_address', label: 'Previous Address', type: 'textarea' },
          { key: 'resume_cv_upload', label: 'Resume/CV Upload', type: 'text' },
          { key: 'headshot_upload', label: 'Headshot Upload', type: 'text' },
          { key: 'work_location', label: 'Work Location', type: 'text' },
          { key: 'research_past_topics', label: 'Research topics', type: 'textarea' },
          { key: 'research_interest', label: 'Interested in conducting research?', type: 'boolean' },
          { key: 'psych_today_outside_school_interest', label: 'Interested in outside-school clients?', type: 'boolean' },
          { key: 'outside_school_availability', label: 'Outside-school availability', type: 'textarea' },
          { key: 'school_days_preference', label: 'School days preference', type: 'multi_select' },
          { key: 'itsco_position', label: 'Position with ITSCO', type: 'text' },
          { key: 'grad_program_info', label: 'Intern graduate program info', type: 'textarea' },

          // Counseling profile / marketing / culture
          { key: 'ideal_client_general', label: 'Ideal client', type: 'textarea' },
          { key: 'how_help_general', label: 'How can you help / what you offer?', type: 'textarea' },
          { key: 'build_empathy_general', label: 'Build empathy', type: 'textarea' },
          { key: 'specialties_general', label: 'Specialties', type: 'multi_select' },
          { key: 'top3_specialties_general', label: 'Top 3 specialties', type: 'text' },
          { key: 'group_interest', label: 'Interested in leading groups?', type: 'textarea' },
          { key: 'mental_health', label: 'Mental Health Categories', type: 'multi_select' },
          { key: 'certs_general', label: 'Certifications', type: 'textarea' },
          { key: 'sexuality', label: 'Sexuality', type: 'multi_select' },
          { key: 'other_issues', label: 'Other issues', type: 'multi_select' },
          { key: 'modality', label: 'Modality', type: 'multi_select' },
          { key: 'age_specialty', label: 'Age Specialty', type: 'multi_select' },
          { key: 'groups', label: 'Focus (couples/families/groups/individuals)', type: 'multi_select' },
          { key: 'languages_spoken', label: 'Languages spoken', type: 'multi_select' },
          { key: 'work_exp_general', label: 'Work experience', type: 'textarea' },
          { key: 'treatment_prefs_max15', label: 'Treatment preferences (max 15)', type: 'multi_select' },
          { key: 'avoid_clients_general', label: 'Clients to avoid', type: 'textarea' },
          { key: 'philosophies', label: 'Philosophies', type: 'textarea' },
          { key: 'personal_info', label: 'Personal info to share', type: 'textarea' },
          { key: 'goals_aspirations', label: 'Goals/aspirations (admin)', type: 'textarea' },
          { key: 'passions', label: 'Passions', type: 'textarea' },
          { key: 'favorite_quotes', label: 'Favorite quotes', type: 'textarea' },
          { key: 'team_activities', label: 'Team activities', type: 'multi_select' },
          { key: 'other_info', label: 'Other information', type: 'textarea' },
          { key: 'pt_gender_ethnicity', label: 'Gender/ethnicity (Psychology Today)', type: 'text' },
          { key: 'why_counselor_itsco', label: 'Why counselor / why ITSCO', type: 'textarea' },
          { key: 'clients_expectations', label: 'One thing you wish all clients knew', type: 'textarea' },
          { key: 'inspires_concerns', label: 'What inspires you / concerns you', type: 'textarea' },
          { key: 'challenges_finished', label: 'Challenges you help with / finished definition', type: 'textarea' },
          { key: 'fun_questions', label: 'Fun questions', type: 'textarea' }
        ];

        for (const d of defs) {
          try {
            await pool.execute(
              `INSERT INTO user_info_field_definitions
                (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
               VALUES (?, ?, ?, NULL, FALSE, TRUE, NULL, NULL, 0, ?)
               ON DUPLICATE KEY UPDATE field_key = field_key`,
              [d.key, d.label, d.type, req.user?.id || null]
            );
          } catch {
            await pool.execute(
              `INSERT INTO user_info_field_definitions
                (field_key, field_label, field_type, options, is_required, is_platform_template, agency_id, parent_field_id, order_index, created_by_user_id)
               VALUES (?, ?, ?, NULL, FALSE, FALSE, ?, NULL, 0, ?)
               ON DUPLICATE KEY UPDATE field_key = field_key`,
              [d.key, d.label, d.type, agencyId, req.user?.id || null]
            );
          }
        }

        const keys = defs.map((d) => d.key);
        const placeholders = keys.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT id, field_key, field_type FROM user_info_field_definitions WHERE field_key IN (${placeholders})`,
          keys
        );
        return new Map((rows || []).map((r) => [r.field_key, r]));
      };

      const defByKey = await ensureDefs();

      const results = {
        agencyId,
        dryRun,
        useAi,
        processed: 0,
        matchedUsers: 0,
        createdUsers: 0,
        updatedUsers: 0,
        updatedUserInfoFields: 0,
        skippedNoName: 0,
        errors: [],
        sampleUnmatched: []
      };

      // Heuristic: skip header row if it contains “name” in col B or “start” in col C.
      const looksHeader = (r) => {
        const a0 = (r || [])[0];
        const a1 = (r || [])[1];
        const a2 = (r || [])[2];
        const s0 = String(a0 || '').toLowerCase();
        const s1 = String(a1 || '').toLowerCase();
        const s2 = String(a2 || '').toLowerCase();
        return (
          s0.includes('timestamp') ||
          s0.includes('first') ||
          s1.includes('name') ||
          s1.includes('last') ||
          s2.includes('start')
        );
      };
      const startIndex = looksHeader(rows[0]) ? 1 : 0;

      // Build header index map if first row is header strings.
      const headerIndex = new Map();
      if (looksHeader(rows[0])) {
        for (let i = 0; i < (rows[0] || []).length; i++) {
          const h = normalizeHeader((rows[0] || [])[i]);
          if (h) headerIndex.set(h, i);
        }
      }

      // Optional Gemini-assisted mapping for header variants.
      let aiMapping = null;
      if (useAi && headerIndex.size) {
        try {
          aiMapping = await suggestEmployeeInfoHeaderMapping({ normalizedHeaders: Array.from(headerIndex.keys()) });
        } catch {
          aiMapping = null;
        }
      }

      const getByHeader = (row, header) => {
        const idx = headerIndex.get(normalizeHeader(header));
        if (idx === undefined) return null;
        return (row || [])[idx];
      };
      const getByAnyHeader = (row, headers) => {
        for (const h of headers || []) {
          const v = getByHeader(row, h);
          if (v !== null && v !== undefined && String(v).trim() !== '') return v;
        }
        return null;
      };
      const pick = (row, aiKey, fallbackHeaders) => {
        const aiHeader = aiMapping?.[aiKey] ? String(aiMapping[aiKey] || '').trim() : '';
        const list = [aiHeader, ...(fallbackHeaders || [])].filter(Boolean);
        return getByAnyHeader(row, list);
      };

      const toBoolLoose = (v) => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'boolean') return v;
        const s = String(v).trim().toLowerCase();
        if (!s) return null;
        if (['yes', 'y', 'true', '1'].includes(s)) return true;
        if (['no', 'n', 'false', '0'].includes(s)) return false;
        return null;
      };

      const parseMulti = (v) => {
        if (v === null || v === undefined) return null;
        if (Array.isArray(v)) return v.length ? JSON.stringify(v) : null;
        const s = String(v || '').trim();
        if (!s) return null;
        // Google forms export tends to use comma separation for multi-select.
        const parts = s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
        return parts.length ? JSON.stringify(parts) : null;
      };

      for (let i = startIndex; i < rows.length; i++) {
        const r = rows[i] || [];

        // Prefer header-based mapping when available; fall back to fixed indices.
        const firstNameCell =
          headerIndex.size
            ? pick(r, 'firstNameHeader', ['First Name', 'First name', 'First'])
            : null;
        const lastNameCell =
          headerIndex.size
            ? pick(r, 'lastNameHeader', ['Last Name', 'Last name', 'Last'])
            : null;
        const nameCell =
          headerIndex.size
            ? pick(r, 'nameHeader', ['Name'])
            : r[1]; // Column B
        const startDateCell =
          headerIndex.size
            ? pick(r, 'startDateHeader', ['Start Date'])
            : r[2]; // Column C
        const birthdateCell =
          headerIndex.size
            ? pick(r, 'birthdateHeader', ['Birthdate'])
            : null;
        const stateOfBirthCell =
          headerIndex.size
            ? pick(r, 'stateOfBirthHeader', ['State of Birth'])
            : r[8]; // Column I
        const personalEmailCell =
          headerIndex.size
            ? pick(r, 'personalEmailHeader', ['Personal Email', 'Email Address'])
            : r[9]; // Column J
        const addressCell =
          headerIndex.size
            ? pick(r, 'mailingAddressHeader', ['Mailing Address'])
            : r[10]; // Column K
        const cellPhoneCell =
          headerIndex.size
            ? pick(r, 'cellPhoneHeader', ['Cell Phone Number'])
            : r[11]; // Column L
        const educationCell =
          headerIndex.size
            ? pick(r, 'educationHeader', ['Education information: Please list all degrees, areas of specialization/emphasis (if applicable), years conferred.'])
            : r[12]; // Column M
        const licenseCell =
          headerIndex.size
            ? pick(r, 'licenseNumberHeader', ['What is/are your license/s and provide us the #/s (i.e., LPCC #00154326)'])
            : r[15]; // Column P
        const licenseIssuedCell =
          headerIndex.size ? pick(r, 'licenseIssuedDateHeader', ['Date License Issued']) : null;
        const licenseExpiresCell =
          headerIndex.size ? pick(r, 'licenseExpiresDateHeader', ['Date License Expires']) : null;
        const npiHasCell =
          headerIndex.size ? pick(r, 'hasNpiHeader', ['Do you have an NPI?']) : null;
        const npiCell =
          headerIndex.size
            ? pick(r, 'npiNumberHeader', ['Please list your NPI number. If we are making you one, you may leave blank and we will be in contact.'])
            : r[20]; // Column U
        const taxonomyCell =
          headerIndex.size
            ? pick(r, 'taxonomyHeader', ['Taxonomy'])
            : null;
        const caqhCell =
          headerIndex.size ? pick(r, 'caqhHeader', ['Do you have a CAQH account? If so, what is your provider ID number?']) : null;
        const medicareNumberCell =
          headerIndex.size
            ? pick(r, 'medicareNumberHeader', ['Medicare number', 'Medicare Number', 'Medicare #', 'Medicare'])
            : null;
        const taxIdCell =
          headerIndex.size
            ? pick(r, 'taxIdHeader', ['TAX ID', 'Tax ID', 'TaxId', 'Tax Identification Number'])
            : null;
        const medicaidProviderTypeCell =
          headerIndex.size
            ? pick(r, 'medicaidProviderTypeHeader', ['Medicaid Provider Type', 'Medicaid provider type'])
            : null;
        const medicaidLocCell =
          headerIndex.size
            ? pick(r, 'medicaidLocationHeader', ['What is your medicaid location ID Number? Or write, "I don\'t have a medicaid account."'])
            : r[22]; // Column W
        const medicaidEffectiveDateCell =
          headerIndex.size
            ? pick(r, 'medicaidEffectiveDateHeader', ['Medicaid Effective Date', 'Medicaid effective date', 'Effective Date (Medicaid)'])
            : null;
        const revalidationCell =
          headerIndex.size ? pick(r, 'revalidationDateHeader', ['If you have an account and know your location ID, please list your revalidation date.']) : null;
        const outsideSchoolInterestCell =
          headerIndex.size ? pick(r, 'outsideSchoolInterestHeader', ['Are you interested in seeing clients outside of schools at our offices? If so, we may establish a psychology today profile for you if you don\'t already have one. (Licensed Clinicians Only)']) : null;
        const outsideSchoolHoursCell =
          headerIndex.size ? pick(r, 'outsideSchoolHoursHeader', ['If you answered "YES" to the above question, please list what days and times you\'d like to open your schedule for outside-school hours. (i.e., Saturdays all day, Saturday mornings, or M/W/F 5-8pm).']) : null;
        const schoolDaysCell =
          headerIndex.size ? pick(r, 'schoolDaysHeader', ['Please select the days you are looking to be in schools.']) : null;
        const researchTopicsCell =
          headerIndex.size ? getByAnyHeader(r, ['Have you conducted any research? If so, what were the topics?']) : null;
        const researchInterestedCell =
          headerIndex.size ? getByAnyHeader(r, ['Are you interested in conducting research?']) : null;
        const resumeUrlCell =
          headerIndex.size ? pick(r, 'resumeUploadHeader', ['Please upload Resume, Curriculum Vitae, and/or Work History']) : null;
        const licenseUploadUrlCell =
          headerIndex.size ? pick(r, 'licenseUploadHeader', ['Please upload a copy of your practicing license (LPCC, etc.)']) : null;
        const headshotUrlCell =
          headerIndex.size ? pick(r, 'headshotUploadHeader', ['Please attach a professional headshot. We will use this for our website, social media, etc.']) : null;
        const positionCell =
          headerIndex.size ? pick(r, 'positionHeader', ['Please select your position with ITSCO']) : null;
        const locationCell =
          headerIndex.size ? pick(r, 'locationWorkingAtHeader', ['Which location will you be working at?', 'Location Selection']) : null;
        const previousAddressCell =
          headerIndex.size ? pick(r, 'previousAddressHeader', ['Previous Address']) : null;
        const genderEthnicityCell =
          headerIndex.size ? getByAnyHeader(r, ['Your gender/ethnicity (used for the psych today profile for clients with a preference to choose you)']) : null;
        const internGradProgramCell =
          headerIndex.size ? getByAnyHeader(r, ['Interns only: Provide info about your graduate program']) : null;

        // Essay/module fields
        const idealClientCell =
          headerIndex.size ? pick(r, 'idealClientHeader', ['Imagine your ideal client. What are their issues, their needs, their goals? What do they want and why?']) : null;
        const helpOfferCell =
          headerIndex.size ? pick(r, 'helpOfferHeader', ['How can you help your client/s? Talk about your speciality and what you offer.', 'How can you help your client/s? What can you offer?']) : null;
        const empathyCell =
          headerIndex.size ? pick(r, 'empathyHeader', ['How can you build empathy and invite the potential client to reach out to you?']) : null;
        const specialtiesCell =
          headerIndex.size ? pick(r, 'specialtiesHeader', ['Do you have any Specialties? Max 25', 'Do you have any Specialties?']) : null;
        const topThreeCell =
          headerIndex.size ? pick(r, 'topThreeSpecialtiesHeader', ['What are your top three specialities from the above?']) : null;
        const groupsCell =
          headerIndex.size ? getByAnyHeader(r, ['Are you interested in leading groups? If so, please list what types of groups you\'re interested in. If you don\'t know what type but are interested, please just state "I\'m interested."']) : null;
        const mentalHealthCell =
          headerIndex.size ? getByAnyHeader(r, ['Mental Health']) : null;
        const certificationsCell =
          headerIndex.size ? pick(r, 'certificationsHeader', ['Do you have any certifications?']) : null;
        const sexualityCell =
          headerIndex.size ? getByAnyHeader(r, ['Sexuality']) : null;
        const otherIssuesCell =
          headerIndex.size ? getByAnyHeader(r, ['Other Issues']) : null;
        const modalityCell =
          headerIndex.size ? getByAnyHeader(r, ['Modality']) : null;
        const ageSpecialtyCell =
          headerIndex.size ? getByAnyHeader(r, ['Client Focus - Age Specialty']) : null;
        const groupsFocusCell =
          headerIndex.size ? getByAnyHeader(r, ['Groups']) : null;
        const languagesCell =
          headerIndex.size ? getByAnyHeader(r, ['Languages Spoken']) : null;
        const workExperienceCell =
          headerIndex.size ? pick(r, 'workExperienceHeader', ['Any work experience you would like to share?']) : null;
        const treatmentPrefsCell =
          headerIndex.size ? getByAnyHeader(r, ['Treatment Preferences or Strategies. Max 15']) : null;
        const avoidClientsCell =
          headerIndex.size ? pick(r, 'avoidClientsHeader', ['Are there any clients we should absolutely avoid scheduling with you? If so, what can you tell us about them?']) : null;
        const philosophiesCell =
          headerIndex.size ? getByAnyHeader(r, ['Any philosophies you would like shared?']) : null;
        const personalInfoWorldCell =
          headerIndex.size ? getByAnyHeader(r, ['Any personal info you want shared with the world?']) : null;
        const goalsAdminCell =
          headerIndex.size ? getByAnyHeader(r, ['Do you have any goals or aspirations you\'d like to share with ITSCO admin? We\'d love to hear about them!']) : null;
        const passionsCell =
          headerIndex.size ? getByAnyHeader(r, ['What are your passions?']) : null;
        const quotesCell =
          headerIndex.size ? getByAnyHeader(r, ['Do you have any favorite quotes?']) : null;
        const teamActivitiesCell =
          headerIndex.size ? getByAnyHeader(r, ['Please indicate the team activities you are interested in participating with other ITSCO members!']) : null;
        const otherInfoCell =
          headerIndex.size ? getByAnyHeader(r, ['Any other information you would like to share? Please do so here!']) : null;
        const whyCounselorCell =
          headerIndex.size ? pick(r, 'whyCounselorHeader', ['Why did you choose to become a counselor? Why did you choose ITSCO?']) : null;
        const oneThingCell =
          headerIndex.size ? getByAnyHeader(r, ['What is one thing you wish all clients knew? What can clients expect of you?']) : null;
        const inspiresConcernsCell =
          headerIndex.size ? getByAnyHeader(r, ['What inspires you? What concerns you?']) : null;
        const challengesFinishedCell =
          headerIndex.size ? getByAnyHeader(r, ['What challenges do you help people with or feel confident in helping people with? How do you know when a client is finished with counseling?']) : null;
        const funQuestionsCell =
          headerIndex.size ? getByAnyHeader(r, ['What do you want to be when you grow up? What is one item you can’t live without? What was the last thing you did for the first time? What makes you feel truly alive?']) : null;

        const inferred =
          headerIndex.size && (String(firstNameCell || '').trim() || String(lastNameCell || '').trim())
            ? {
                firstName: String(firstNameCell || '').trim(),
                lastName: String(lastNameCell || '').trim()
              }
            : parseClinicianName(nameCell);

        const first = inferred.firstName;
        const last = inferred.lastName;
        if (!first || !last) {
          results.skippedNoName += 1;
          continue;
        }

        results.processed += 1;
        const loginEmail = normalizeEmail(personalEmailCell) || '';

        // Match user by (a) personal/work/primary email if present, else (b) name within agency.
        let userRow = null;
        if (loginEmail && isValidEmail(loginEmail)) {
          try {
            const existing = await User.findByEmail(loginEmail);
            if (existing?.id) userRow = existing;
          } catch {
            // ignore
          }
        }

        if (!userRow) {
          // Try name lookup within agency
          const [agencyUsers] = await pool.execute(
            `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email
             FROM users u
             INNER JOIN user_agencies ua ON ua.user_id = u.id
             WHERE ua.agency_id = ? AND LOWER(u.first_name) = LOWER(?) AND LOWER(u.last_name) = LOWER(?)
             LIMIT 1`,
            [agencyId, first, last]
          );
          if (agencyUsers?.[0]?.id) userRow = agencyUsers[0];
        }

        if (!userRow) {
          // Create provider user (legacy backfill)
          if (dryRun) {
            results.createdUsers += 1;
            continue;
          }

          const cols = ['email', 'first_name', 'last_name', 'role'];
          const vals = [loginEmail && isValidEmail(loginEmail) ? loginEmail : `${normalizeNameKey(first + last)}@example.invalid`, first, last, 'provider'];
          if (hasPersonalEmail && loginEmail && isValidEmail(loginEmail)) {
            cols.push('personal_email');
            vals.push(loginEmail);
          }
          if (hasWorkEmail && loginEmail && isValidEmail(loginEmail)) {
            cols.push('work_email');
            vals.push(loginEmail);
          }
          if (hasPersonalPhone && cellPhoneCell) {
            cols.push('personal_phone');
            vals.push(String(cellPhoneCell || '').trim());
          }
          const [ins] = await pool.execute(
            `INSERT INTO users (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
            vals
          );
          const newUserId = ins.insertId;
          userRow = { id: newUserId, email: vals[0] };
          results.createdUsers += 1;

          try {
            await pool.execute(`INSERT INTO user_agencies (user_id, agency_id) VALUES (?, ?)`, [newUserId, agencyId]);
          } catch {
            // ignore
          }
        } else {
          results.matchedUsers += 1;
        }

        const userId = Number(userRow.id);
        if (!userId) continue;

        // Update core user fields (best-effort)
        if (!dryRun) {
          try {
            const updates = [];
            const params = [];
            if (hasPersonalEmail && loginEmail && isValidEmail(loginEmail)) {
              updates.push('personal_email = ?');
              params.push(loginEmail);
            }
            if (hasWorkEmail && loginEmail && isValidEmail(loginEmail)) {
              updates.push('work_email = ?');
              params.push(loginEmail);
            }
            if (hasPersonalPhone && cellPhoneCell) {
              updates.push('personal_phone = ?');
              params.push(String(cellPhoneCell || '').trim());
            }
            if (updates.length) {
              params.push(userId);
              await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
              results.updatedUsers += 1;
            }
          } catch {
            // ignore
          }
        }

        // Add per-agency login alias if we have a valid email and alias table exists.
        if (!dryRun && hasAliases && loginEmail && isValidEmail(loginEmail)) {
          try {
            await pool.execute(
              `INSERT INTO user_login_emails (user_id, agency_id, email)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), agency_id = VALUES(agency_id)`,
              [userId, agencyId, loginEmail]
            );
          } catch {
            // ignore
          }
        }

        // User info backfill
        const upserts = [];
        const pushVal = (key, raw) => {
          const def = defByKey.get(key);
          if (!def?.id) return;
          const type = String(def.field_type || '');
          let stored = null;
          if (type === 'date') stored = toDateString(raw);
          else if (type === 'boolean') {
            const b = toBoolLoose(raw);
            stored = b === null ? null : (b ? 'true' : 'false');
          } else if (type === 'multi_select') {
            stored = parseMulti(raw);
          } else {
            const s = String(raw ?? '').trim();
            stored = s ? s : null;
          }
          upserts.push({ fieldDefinitionId: def.id, value: stored });
        };

        // Canonical mapping (app_form_header_map.md)
        pushVal('start_date', startDateCell);
        pushVal('date_of_birth', birthdateCell);
        pushVal('state_of_birth', stateOfBirthCell);
        pushVal('mailing_address', addressCell);
        pushVal('education_history', educationCell);
        pushVal('license_type_number', licenseCell);
        pushVal('license_issued', licenseIssuedCell);
        pushVal('license_expires', licenseExpiresCell);
        pushVal('license_upload', licenseUploadUrlCell);
        pushVal('npi_number', npiCell);
        pushVal('taxonomy_code', taxonomyCell);
        pushVal('medicaid_provider_type', medicaidProviderTypeCell);
        // tax_id intentionally excluded (restricted)
        pushVal('medicaid_location_id', medicaidLocCell);
        pushVal('medicaid_effective_date', medicaidEffectiveDateCell);
        pushVal('medicare_number', medicareNumberCell);

        // Module mappings / additional fields
        pushVal('work_location', locationCell);
        pushVal('previous_address', previousAddressCell);
        pushVal('resume_cv_upload', resumeUrlCell);
        pushVal('research_past_topics', researchTopicsCell);
        pushVal('research_interest', researchInterestedCell);
        pushVal('caqh_provider_id', caqhCell);
        pushVal('medicaid_revalidation', revalidationCell);
        pushVal('psych_today_outside_school_interest', outsideSchoolInterestCell);
        pushVal('outside_school_availability', outsideSchoolHoursCell);
        pushVal('school_days_preference', schoolDaysCell);
        pushVal('headshot_upload', headshotUrlCell);
        pushVal('itsco_position', positionCell);
        pushVal('grad_program_info', internGradProgramCell);

        // Best-effort mapping of legacy yes/no NPI question into canonical npi_status select values.
        const hasNpi = toBoolLoose(npiHasCell);
        if (hasNpi === true) pushVal('npi_status', 'yes');
        else if (hasNpi === false) pushVal('npi_status', 'no_itsco_create');

        // Narrative fields
        pushVal('ideal_client_general', idealClientCell);
        pushVal('how_help_general', helpOfferCell);
        pushVal('build_empathy_general', empathyCell);
        pushVal('specialties_general', specialtiesCell);
        pushVal('top3_specialties_general', topThreeCell);
        pushVal('group_interest', groupsCell);
        pushVal('mental_health', mentalHealthCell);
        pushVal('certs_general', certificationsCell);
        pushVal('sexuality', sexualityCell);
        pushVal('other_issues', otherIssuesCell);
        pushVal('modality', modalityCell);
        pushVal('age_specialty', ageSpecialtyCell);
        pushVal('groups', groupsFocusCell);
        pushVal('languages_spoken', languagesCell);
        pushVal('work_exp_general', workExperienceCell);
        pushVal('treatment_prefs_max15', treatmentPrefsCell);
        pushVal('avoid_clients_general', avoidClientsCell);
        pushVal('philosophies', philosophiesCell);
        pushVal('personal_info', personalInfoWorldCell);
        pushVal('goals_aspirations', goalsAdminCell);
        pushVal('passions', passionsCell);
        pushVal('favorite_quotes', quotesCell);
        pushVal('team_activities', teamActivitiesCell);
        pushVal('other_info', otherInfoCell);
        pushVal('pt_gender_ethnicity', genderEthnicityCell);
        pushVal('why_counselor_itsco', whyCounselorCell);
        pushVal('clients_expectations', oneThingCell);
        pushVal('inspires_concerns', inspiresConcernsCell);
        pushVal('challenges_finished', challengesFinishedCell);
        pushVal('fun_questions', funQuestionsCell);

        if (upserts.length) {
          results.updatedUserInfoFields += upserts.length;
          if (!dryRun) {
            await UserInfoValue.bulkUpdate(userId, upserts);
          }
        }
      }

      res.json(results);
    } catch (e) {
      next(e);
    }
  }
];


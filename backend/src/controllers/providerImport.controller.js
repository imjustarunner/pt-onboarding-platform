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

async function findUserIdByPersonalEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !e.includes('@')) return null;
  const hasCol = await hasUsersPersonalEmailColumn();
  if (!hasCol) return null;
  const [rows] = await pool.execute(
    'SELECT id FROM users WHERE LOWER(TRIM(personal_email)) = ? LIMIT 1',
    [e]
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
        const userId = await findUserIdByPersonalEmail(email);
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

        // Convert fieldKey → fieldDefinitionId
        // (Only provider_ fields are allowed here.)
        const filtered = values.filter((v) => String(v.fieldKey).startsWith('provider_'));
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
            const raw = fv.value;
            let arr = [];
            if (Array.isArray(raw)) arr = raw;
            else {
              const s = String(raw || '').trim();
              if (s) {
                try {
                  const parsed = JSON.parse(s);
                  if (Array.isArray(parsed)) arr = parsed;
                  else arr = s.split(',').map((x) => x.trim()).filter(Boolean);
                } catch {
                  arr = s.split(',').map((x) => x.trim()).filter(Boolean);
                }
              }
            }
            stored = arr.length ? JSON.stringify(arr) : null;
          } else if (fieldType === 'boolean') {
            const s = String(fv.value || '').trim().toLowerCase();
            const b = s === 'true' || s === 'yes' || s === '1' || s === 'y';
            stored = b ? 'true' : 'false';
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
        processed: 0,
        matchedUsers: 0,
        updatedUsers: 0,
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
          results.skippedNoMatch += 1;
          if (results.sampleUnmatched.length < 25) {
            results.sampleUnmatched.push({ row: i + 1, first, last, email });
          }
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


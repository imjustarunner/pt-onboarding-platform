import multer from 'multer';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import crypto from 'crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import NotificationEvent from '../models/NotificationEvent.model.js';
import { createNotificationAndDispatch } from '../services/notificationDispatcher.service.js';
import { requirePayrollAccess } from './payroll.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

const PSYCHOTHERAPY_CODES = new Set([
  '90832',
  '90833',
  '90834',
  '90836',
  '90837',
  '90838',
  '90839',
  '90840',
  '90846',
  '90847',
  '90849',
  '90853'
]);

const PSYCHOTHERAPY_MIN_SERVICE_YMD = '2025-07-01';

function getKeyMaterial() {
  const b64 =
    process.env.BILLING_ENCRYPTION_KEY_BASE64 ||
    process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64; // dev fallback
  if (!b64) return null;
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== 32) return null;
  return buf;
}

function normalizeHeaderKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseServiceDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const s = String(raw).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // MM/DD/YYYY or MM/DD/YY
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

function formatYmd(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeFiscalYearStartYmd(serviceDate) {
  const dt = serviceDate instanceof Date ? serviceDate : new Date(serviceDate);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getUTCFullYear();
  const month = dt.getUTCMonth() + 1; // 1-12
  const startYear = month >= 7 ? y : (y - 1);
  return `${startYear}-07-01`;
}

function normalizeNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeInitialsKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  // Keep alphanumerics only, uppercase, no spaces.
  return s.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 32);
}

function parseHumanNameToFirstLast(raw) {
  const s = String(raw || '').trim();
  if (!s) return { first: '', last: '' };

  // "Last, First"
  if (s.includes(',')) {
    const [lastPart, firstPart] = s.split(',').map((x) => String(x || '').trim());
    const firstTokens = normalizeNameKey(firstPart).split(' ').filter(Boolean);
    const lastTokens = normalizeNameKey(lastPart).split(' ').filter(Boolean);
    const first = firstTokens[0] || '';
    const last = lastTokens[lastTokens.length - 1] || '';
    return { first, last };
  }

  // "First Middle Last"
  const parts = normalizeNameKey(s).split(' ').filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts[parts.length - 1] };
}

function title3(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  const three = t.slice(0, 3);
  return three.slice(0, 1).toUpperCase() + three.slice(1).toLowerCase();
}

function clientAbbrevFromName(rawPatientName) {
  const { first, last } = parseHumanNameToFirstLast(rawPatientName);
  const a = title3(first);
  const b = title3(last);
  const out = `${a}${b}`;
  if (out) return out;
  // Fallback: first 6 alphanumerics (TitleCase-ish)
  const compact = String(rawPatientName || '').replace(/[^a-z0-9]/gi, '').slice(0, 6);
  if (!compact) return 'Client';
  return compact.slice(0, 1).toUpperCase() + compact.slice(1).toLowerCase();
}

function clientAbbrevFromInitials(initialsNorm) {
  const s = normalizeInitialsKey(initialsNorm);
  if (!s) return 'Client';
  if (s.length >= 6) {
    const a = s.slice(0, 3);
    const b = s.slice(-3);
    return `${title3(a)}${title3(b)}`;
  }
  // Short fallback (TitleCase whole token)
  return s.slice(0, 1).toUpperCase() + s.slice(1).toLowerCase();
}

function stableStringify(obj) {
  const keys = Object.keys(obj || {}).sort();
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

function hmacClientKeyHex({ keyMaterial, agencyId, normalizedPatientKey }) {
  return crypto
    .createHmac('sha256', keyMaterial)
    .update(`agency:${String(agencyId)}|patient:${String(normalizedPatientKey || '')}`, 'utf8')
    .digest('hex');
}

function hmacDobHashHex({ keyMaterial, agencyId, dobYmd }) {
  if (!dobYmd) return null;
  return crypto
    .createHmac('sha256', keyMaterial)
    .update(`agency:${String(agencyId)}|dob:${String(dobYmd)}`, 'utf8')
    .digest('hex');
}

function hmacInitialsDobClientKeyHex({ keyMaterial, agencyId, initialsNorm, dobYmd }) {
  return crypto
    .createHmac('sha256', keyMaterial)
    .update(`agency:${String(agencyId)}|initials:${String(initialsNorm || '')}|dob:${String(dobYmd || '')}`, 'utf8')
    .digest('hex');
}

function parseWorkbookOrCsv(buffer, originalName) {
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
    records = parse(txt, { columns: true, skip_empty_lines: true, delimiter: best.delim, relax_quotes: true });
  }

  // Normalize keys per row
  const normalizedRows = [];
  for (const raw of records || []) {
    const n = {};
    for (const [k, v] of Object.entries(raw || {})) {
      n[normalizeHeaderKey(k)] = v;
    }
    normalizedRows.push(n);
  }
  return normalizedRows;
}

function getFirst(n, keys) {
  for (const k of keys) {
    const v = n?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}

async function requireAgencyMember(req, res, agencyId) {
  const uId = Number(req.user?.id || 0);
  if (!uId) {
    res.status(401).json({ error: { message: 'Authentication required' } });
    return false;
  }
  const [rows] = await pool.execute(
    'SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1',
    [uId, Number(agencyId)]
  );
  if (!rows || rows.length === 0) {
    res.status(403).json({ error: { message: 'Access denied' } });
    return false;
  }
  return true;
}

async function createUploadRecord({ agencyId, uploadedByUserId, originalFilename, minServiceDate, maxServiceDate }) {
  const [result] = await pool.execute(
    `INSERT INTO agency_psychotherapy_report_uploads
      (agency_id, uploaded_by_user_id, original_filename, min_service_date, max_service_date)
     VALUES (?, ?, ?, ?, ?)`,
    [
      Number(agencyId),
      uploadedByUserId ? Number(uploadedByUserId) : null,
      originalFilename ? String(originalFilename).slice(0, 255) : null,
      minServiceDate || null,
      maxServiceDate || null
    ]
  );
  return Number(result.insertId);
}

async function bulkUpsertRows(rows) {
  if (!rows || rows.length === 0) return 0;
  const CHUNK = 500;
  let affected = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = [];
    for (const r of chunk) {
      values.push([
        r.uploadId,
        r.agencyId,
        r.serviceDate,
        r.fiscalYearStart,
        r.serviceCode,
        r.providerUserId || null,
        r.providerNameNormalized || null,
        r.patientInitialsNormalized || null,
        r.dobHash || null,
        r.clientId || null,
        r.clientKeyHash,
        r.clientAbbrev,
        r.rowFingerprint
      ]);
    }
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const flat = values.flat();

    const [result] = await pool.execute(
      `INSERT INTO agency_psychotherapy_report_rows
        (upload_id, agency_id, service_date, fiscal_year_start, service_code,
         provider_user_id, provider_name_normalized,
         patient_initials_normalized, dob_hash,
         client_id, client_key_hash, client_abbrev,
         row_fingerprint)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         upload_id = VALUES(upload_id),
         service_date = VALUES(service_date),
         fiscal_year_start = VALUES(fiscal_year_start),
         service_code = VALUES(service_code),
         provider_user_id = VALUES(provider_user_id),
         provider_name_normalized = VALUES(provider_name_normalized),
         patient_initials_normalized = VALUES(patient_initials_normalized),
         dob_hash = VALUES(dob_hash),
         client_id = VALUES(client_id),
         client_key_hash = VALUES(client_key_hash),
         client_abbrev = VALUES(client_abbrev)`,
      flat
    );
    affected += Number(result.affectedRows || 0);
  }

  return affected;
}

async function notifyThresholdsForAgencyFiscalYears({ agencyId, fiscalYearStarts }) {
  const fyList = Array.from(new Set((fiscalYearStarts || []).map((x) => String(x || '').slice(0, 10)).filter(Boolean)));
  if (fyList.length === 0) return { attempted: 0, created: 0 };

  // Aggregate counts per provider/client/fy and per code.
  const placeholdersFy = fyList.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT
       provider_user_id,
       client_key_hash,
       client_abbrev,
       fiscal_year_start,
       service_code,
       COUNT(*) AS code_count
     FROM agency_psychotherapy_report_rows
     WHERE agency_id = ?
       AND provider_user_id IS NOT NULL
       AND fiscal_year_start IN (${placeholdersFy})
     GROUP BY provider_user_id, client_key_hash, client_abbrev, fiscal_year_start, service_code`,
    [Number(agencyId), ...fyList]
  );

  const byKey = new Map(); // key -> { providerUserId, clientKeyHash, clientAbbrev, fiscalYearStart, perCode: Map, total }
  for (const r of rows || []) {
    const providerUserId = Number(r.provider_user_id || 0);
    const clientKeyHash = String(r.client_key_hash || '').trim();
    const clientAbbrev = String(r.client_abbrev || '').trim() || 'Client';
    const fiscalYearStart = String(r.fiscal_year_start || '').slice(0, 10);
    const code = String(r.service_code || '').trim().toUpperCase();
    const count = Number(r.code_count || 0);
    if (!providerUserId || !clientKeyHash || !fiscalYearStart || !code) continue;

    const k = `${providerUserId}|${fiscalYearStart}|${clientKeyHash}`;
    if (!byKey.has(k)) {
      byKey.set(k, {
        providerUserId,
        clientKeyHash,
        clientAbbrev,
        fiscalYearStart,
        perCode: new Map(),
        total: 0
      });
    }
    const rec = byKey.get(k);
    rec.perCode.set(code, (rec.perCode.get(code) || 0) + count);
    rec.total += count;
  }

  let attempted = 0;
  let created = 0;

  const sortedCodes = (m) =>
    Array.from(m.entries())
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([code, count]) => ({ code, count }));

  for (const rec of byKey.values()) {
    if (rec.total < 25) continue; // surpassed 24
    attempted += 1;

    // Dedupe per provider + client + fiscal year.
    const triggerKey = `psychotherapy_threshold_exceeded|fy:${rec.fiscalYearStart}|client:${rec.clientKeyHash}`;
    const ok = await NotificationEvent.tryCreate({
      agencyId: Number(agencyId),
      triggerKey,
      providerUserId: rec.providerUserId,
      recipientUserId: rec.providerUserId
    });
    if (!ok) continue;

    const parts = [];
    for (const { code, count } of sortedCodes(rec.perCode)) {
      if (!PSYCHOTHERAPY_CODES.has(String(code))) continue;
      parts.push(`${code} (${count})`);
    }
    const breakdown = parts.join(' ');
    const msg =
      `${rec.clientAbbrev} ${breakdown} total (${rec.total})\n\n` +
      'This client has surpassed 24 psychotherapy services which must identify medical necessity via as defined in Colorado Code of Regulations (CCR) ' +
      '10 CCR 2505-10 8.076.1.8 and 10 CCR 2505-10 8.280.4.E. (for children) due to senate bill 22-156.';

    await createNotificationAndDispatch(
      {
        type: 'psychotherapy_threshold_exceeded',
        severity: 'warning',
        title: 'Psychotherapy threshold exceeded',
        message: msg,
        userId: rec.providerUserId,
        agencyId: Number(agencyId),
        relatedEntityType: 'client',
        relatedEntityId: null
      },
      { context: { isUrgent: false } }
    );

    created += 1;
  }

  return { attempted, created };
}

export const uploadPsychotherapyComplianceReport = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const agencyIdRaw = req.body?.agencyId ?? req.query?.agencyId;
      const agencyId = agencyIdRaw ? parseInt(String(agencyIdRaw), 10) : null;
      if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
      if (!(await requirePayrollAccess(req, res, agencyId))) return;
      if (!req.file) return res.status(400).json({ error: { message: 'file is required' } });

      const keyMaterial = getKeyMaterial();
      if (!keyMaterial) {
        return res.status(500).json({
          error: { message: 'Hash key not configured (BILLING_ENCRYPTION_KEY_BASE64)' }
        });
      }

      const normalizedRows = parseWorkbookOrCsv(req.file.buffer, req.file.originalname);

      // Build lookup tables for matching.
      const [clientNameRows] = await pool.execute(
        `SELECT id, full_name
         FROM clients
         WHERE agency_id = ? AND full_name IS NOT NULL`,
        [Number(agencyId)]
      );
      const clientIdsByNameKey = new Map(); // nameKey -> [ids]
      for (const r of clientNameRows || []) {
        const key = normalizeNameKey(r.full_name);
        if (!key) continue;
        const list = clientIdsByNameKey.get(key) || [];
        list.push(Number(r.id));
        clientIdsByNameKey.set(key, list);
      }

      const [clientInitialsRows] = await pool.execute(
        `SELECT id, initials
         FROM clients
         WHERE agency_id = ? AND initials IS NOT NULL`,
        [Number(agencyId)]
      );
      const clientIdsByInitialsKey = new Map(); // initialsKey -> [ids]
      for (const r of clientInitialsRows || []) {
        const key = normalizeInitialsKey(r.initials);
        if (!key) continue;
        const list = clientIdsByInitialsKey.get(key) || [];
        list.push(Number(r.id));
        clientIdsByInitialsKey.set(key, list);
      }

      const [prevMatchRows] = await pool.execute(
        `SELECT client_key_hash, client_id
         FROM agency_psychotherapy_report_rows
         WHERE agency_id = ? AND client_id IS NOT NULL`,
        [Number(agencyId)]
      );
      const matchedClientIdByHash = new Map(); // hash -> unique clientId
      const multiHash = new Set();
      for (const r of prevMatchRows || []) {
        const h = String(r.client_key_hash || '').trim();
        const cid = Number(r.client_id || 0);
        if (!h || !cid) continue;
        if (multiHash.has(h)) continue;
        if (matchedClientIdByHash.has(h) && matchedClientIdByHash.get(h) !== cid) {
          matchedClientIdByHash.delete(h);
          multiHash.add(h);
          continue;
        }
        matchedClientIdByHash.set(h, cid);
      }

      const [prevDobInitialsMatchRows] = await pool.execute(
        `SELECT patient_initials_normalized, dob_hash, client_id
         FROM agency_psychotherapy_report_rows
         WHERE agency_id = ?
           AND client_id IS NOT NULL
           AND patient_initials_normalized IS NOT NULL
           AND dob_hash IS NOT NULL`,
        [Number(agencyId)]
      );
      const matchedClientIdByInitialsDob = new Map(); // key -> unique clientId
      const multiInitialsDob = new Set();
      for (const r of prevDobInitialsMatchRows || []) {
        const ini = String(r.patient_initials_normalized || '').trim();
        const dh = String(r.dob_hash || '').trim();
        const cid = Number(r.client_id || 0);
        if (!ini || !dh || !cid) continue;
        const k = `${ini}|${dh}`;
        if (multiInitialsDob.has(k)) continue;
        if (matchedClientIdByInitialsDob.has(k) && matchedClientIdByInitialsDob.get(k) !== cid) {
          matchedClientIdByInitialsDob.delete(k);
          multiInitialsDob.add(k);
          continue;
        }
        matchedClientIdByInitialsDob.set(k, cid);
      }

      const [userRows] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name
         FROM users u
         JOIN user_agencies ua ON ua.user_id = u.id
         WHERE ua.agency_id = ?`,
        [Number(agencyId)]
      );
      const userIdsByNameKey = new Map(); // "first last" key -> [ids]
      for (const u of userRows || []) {
        const key = normalizeNameKey(`${u.first_name || ''} ${u.last_name || ''}`);
        if (!key) continue;
        const list = userIdsByNameKey.get(key) || [];
        list.push(Number(u.id));
        userIdsByNameKey.set(key, list);
      }

      // Parse and stage rows.
      const toInsert = [];
      let parsed = 0;
      let kept = 0;
      let skipped = 0;
      let minService = null;
      let maxService = null;
      const fiscalYearsTouched = new Set();

      for (const n of normalizedRows || []) {
        parsed += 1;

        const serviceDateRaw = getFirst(n, ['date of service', 'dos', 'service date']);
        const serviceDate = parseServiceDate(serviceDateRaw);
        const serviceYmd = formatYmd(serviceDate);
        if (!serviceYmd) {
          skipped += 1;
          continue;
        }
        if (serviceYmd < PSYCHOTHERAPY_MIN_SERVICE_YMD) {
          skipped += 1;
          continue;
        }

        const rawCode = getFirst(n, ['service code', 'cpt code', 'procedure code', 'code', 'cpt', 'hcpcs']);
        const serviceCode = String(rawCode || '').trim().toUpperCase().replace(/\s+/g, '');
        if (!PSYCHOTHERAPY_CODES.has(serviceCode)) {
          skipped += 1;
          continue;
        }

        const patientInitialsRaw = getFirst(n, [
          'patient initials',
          'client initials',
          'student initials',
          'initials',
          'client code',
          'client identifier',
          'client id'
        ]);
        const patientInitialsNormalized = normalizeInitialsKey(patientInitialsRaw);

        const dobRaw = getFirst(n, ['dob', 'date of birth', 'birth date', 'patient dob', 'patient date of birth']);
        const dobDate = parseServiceDate(dobRaw);
        const dobYmd = formatYmd(dobDate);
        const dobHash = dobYmd ? hmacDobHashHex({ keyMaterial, agencyId, dobYmd }) : null;

        const patientName =
          String(getFirst(n, ['patient', 'patient name', 'client', 'client name']) || '').trim() ||
          `${String(getFirst(n, ['patient first name', 'first name', 'first']) || '').trim()} ${String(getFirst(n, ['patient last name', 'last name', 'last']) || '').trim()}`.trim();

        // Require at least initials or a name (DOB alone is not enough).
        if (!patientInitialsNormalized && !String(patientName || '').trim()) {
          skipped += 1;
          continue;
        }

        const providerName = String(
          getFirst(n, [
            'provider',
            'provider name',
            'clinician',
            'clinician name',
            'therapist',
            'therapist name',
            'rendering provider',
            'rendering provider name',
            'treating provider',
            'treating provider name'
          ]) || ''
        ).trim();

        const patientKey = patientName ? normalizeNameKey(patientName) : '';
        const clientKeyHash =
          (patientInitialsNormalized && dobYmd)
            ? hmacInitialsDobClientKeyHex({ keyMaterial, agencyId, initialsNorm: patientInitialsNormalized, dobYmd })
            : hmacClientKeyHex({ keyMaterial, agencyId, normalizedPatientKey: patientKey || patientInitialsNormalized || 'unknown' });
        const clientAbbrev = patientInitialsNormalized ? clientAbbrevFromInitials(patientInitialsNormalized) : clientAbbrevFromName(patientName);

        const fyStart = computeFiscalYearStartYmd(serviceDate);
        if (!fyStart) {
          skipped += 1;
          continue;
        }
        fiscalYearsTouched.add(fyStart);

        // Best-effort: match provider user id by name if unique.
        const providerKey = normalizeNameKey(providerName);
        let providerUserId = null;
        if (providerKey && userIdsByNameKey.has(providerKey)) {
          const ids = userIdsByNameKey.get(providerKey) || [];
          if (ids.length === 1) providerUserId = ids[0];
        }

        // Best-effort: match client id by full name if unique.
        let clientId = null;
        if (patientKey && clientIdsByNameKey.has(patientKey)) {
          const ids = clientIdsByNameKey.get(patientKey) || [];
          if (ids.length === 1) clientId = ids[0];
        }
        // Next: match by initials if unique within agency.
        if (!clientId && patientInitialsNormalized && clientIdsByInitialsKey.has(patientInitialsNormalized)) {
          const ids = clientIdsByInitialsKey.get(patientInitialsNormalized) || [];
          if (ids.length === 1) clientId = ids[0];
        }
        // Next: match by prior mapping using initials+dob_hash (learned from past matches).
        if (!clientId && patientInitialsNormalized && dobHash) {
          const k = `${patientInitialsNormalized}|${dobHash}`;
          if (matchedClientIdByInitialsDob.has(k)) clientId = matchedClientIdByInitialsDob.get(k);
        }
        // Finally: use prior manual matches by client_key_hash.
        if (!clientId && matchedClientIdByHash.has(clientKeyHash)) {
          clientId = matchedClientIdByHash.get(clientKeyHash);
        }

        const providerNameNormalized = providerKey || null;
        const rowFingerprint = sha256Hex(
          stableStringify({
            agencyId: Number(agencyId),
            serviceDate: serviceYmd,
            fiscalYearStart: fyStart,
            serviceCode,
            providerName: providerNameNormalized || '',
            clientKeyHash
          })
        );

        if (!minService || serviceYmd < minService) minService = serviceYmd;
        if (!maxService || serviceYmd > maxService) maxService = serviceYmd;

        toInsert.push({
          uploadId: null, // filled after upload record created
          agencyId: Number(agencyId),
          serviceDate: serviceYmd,
          fiscalYearStart: fyStart,
          serviceCode,
          providerUserId,
          providerNameNormalized,
          patientInitialsNormalized: patientInitialsNormalized || null,
          dobHash,
          clientId,
          clientKeyHash,
          clientAbbrev,
          rowFingerprint
        });
        kept += 1;
      }

      const uploadId = await createUploadRecord({
        agencyId,
        uploadedByUserId: req.user?.id || null,
        originalFilename: req.file.originalname,
        minServiceDate: minService,
        maxServiceDate: maxService
      });

      for (const r of toInsert) r.uploadId = uploadId;

      const affectedRows = await bulkUpsertRows(toInsert);

      const notify = await notifyThresholdsForAgencyFiscalYears({
        agencyId,
        fiscalYearStarts: Array.from(fiscalYearsTouched)
      });

      res.json({
        ok: true,
        uploadId,
        parsed_rows: parsed,
        kept_rows: kept,
        skipped_rows: skipped,
        affected_rows: affectedRows,
        fiscal_years_touched: Array.from(fiscalYearsTouched).sort(),
        notifications_attempted: notify.attempted,
        notifications_created: notify.created
      });
    } catch (e) {
      next(e);
    }
  }
];

export const getPsychotherapyComplianceSummary = async (req, res, next) => {
  try {
    const agencyIdRaw = req.query?.agencyId ?? req.body?.agencyId;
    const agencyId = agencyIdRaw ? parseInt(String(agencyIdRaw), 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireAgencyMember(req, res, agencyId))) return;

    const fyRaw = String(req.query?.fiscalYearStart || '').trim();
    const now = new Date();
    const defaultFy = computeFiscalYearStartYmd(now);
    const fiscalYearStart = (fyRaw && /^\d{4}-\d{2}-\d{2}$/.test(fyRaw)) ? fyRaw : defaultFy;

    const role = String(req.user?.role || '').toLowerCase();
    const isProvider = role === 'provider';
    const providerUserIdParam = req.query?.providerUserId ? parseInt(String(req.query.providerUserId), 10) : null;
    const providerUserId = isProvider ? Number(req.user?.id) : (providerUserIdParam || null);

    const params = [Number(agencyId), String(fiscalYearStart).slice(0, 10)];
    let providerWhere = '';
    if (providerUserId) {
      providerWhere = ' AND r.provider_user_id = ?';
      params.push(Number(providerUserId));
    }

    const [rows] = await pool.execute(
      `SELECT
         r.client_id,
         r.client_key_hash,
         r.client_abbrev,
         MAX(r.patient_initials_normalized) AS patient_initials_normalized,
         r.provider_user_id,
         r.fiscal_year_start,
         r.service_code,
         COUNT(*) AS code_count
       FROM agency_psychotherapy_report_rows r
       WHERE r.agency_id = ?
         AND r.fiscal_year_start = ?
         ${providerWhere}
       GROUP BY
         r.client_id,
         r.client_key_hash,
         r.client_abbrev,
         r.provider_user_id,
         r.fiscal_year_start,
         r.service_code
       ORDER BY r.client_id ASC, r.client_key_hash ASC, r.service_code ASC`,
      params
    );

    const makeKey = (r) => {
      const clientId = r.client_id === null || r.client_id === undefined ? null : Number(r.client_id);
      const clientKeyHash = String(r.client_key_hash || '');
      const providerId = r.provider_user_id === null || r.provider_user_id === undefined ? null : Number(r.provider_user_id);
      const fy = String(r.fiscal_year_start || '').slice(0, 10);
      const scope = clientId ? `client:${clientId}` : `hash:${clientKeyHash}`;
      return `${scope}|provider:${providerId || 'none'}|fy:${fy}`;
    };

    const grouped = new Map();
    for (const r of rows || []) {
      const k = makeKey(r);
      if (!grouped.has(k)) {
        grouped.set(k, {
          client_id: r.client_id === null ? null : Number(r.client_id),
          client_key_hash: String(r.client_key_hash || '').trim(),
          client_abbrev: String(r.client_abbrev || '').trim() || 'Client',
          patient_initials_normalized: String(r.patient_initials_normalized || '').trim() || null,
          provider_user_id: r.provider_user_id === null ? null : Number(r.provider_user_id),
          fiscal_year_start: String(r.fiscal_year_start || '').slice(0, 10),
          per_code: {},
          total: 0,
          surpassed_24: false
        });
      }
      const rec = grouped.get(k);
      const code = String(r.service_code || '').trim().toUpperCase();
      const count = Number(r.code_count || 0);
      if (!code || !Number.isFinite(count)) continue;
      rec.per_code[code] = (rec.per_code[code] || 0) + count;
      rec.total += count;
    }

    const matched = [];
    const unmatched = [];
    for (const rec of grouped.values()) {
      rec.surpassed_24 = rec.total >= 25;
      if (rec.client_id) matched.push(rec);
      else unmatched.push(rec);
    }

    // Best-effort: attach provider display names (for admin/staff compliance views).
    try {
      const providerIds = Array.from(
        new Set(
          [...matched, ...unmatched]
            .map((r) => Number(r?.provider_user_id || 0))
            .filter((x) => Number.isFinite(x) && x > 0)
        )
      );
      if (providerIds.length > 0) {
        const placeholders = providerIds.map(() => '?').join(',');
        const [urows] = await pool.execute(
          `SELECT id, first_name, last_name
           FROM users
           WHERE id IN (${placeholders})`,
          providerIds
        );
        const byId = new Map(
          (urows || []).map((u) => [
            Number(u.id),
            String(`${u.first_name || ''} ${u.last_name || ''}`.trim() || '') || null
          ])
        );
        for (const r of matched) r.provider_name = byId.get(Number(r.provider_user_id)) || null;
        for (const r of unmatched) r.provider_name = byId.get(Number(r.provider_user_id)) || null;
      }
    } catch {
      // ignore
    }

    matched.sort((a, b) => (b.total - a.total) || String(a.client_abbrev).localeCompare(String(b.client_abbrev)));
    unmatched.sort((a, b) => (b.total - a.total) || String(a.client_abbrev).localeCompare(String(b.client_abbrev)));

    res.json({
      agency_id: Number(agencyId),
      provider_user_id: providerUserId ? Number(providerUserId) : null,
      fiscal_year_start: fiscalYearStart,
      matched,
      unmatched
    });
  } catch (e) {
    next(e);
  }
};

export const matchPsychotherapyComplianceClient = async (req, res, next) => {
  try {
    const agencyIdRaw = req.body?.agencyId ?? req.query?.agencyId;
    const agencyId = agencyIdRaw ? parseInt(String(agencyIdRaw), 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const clientKeyHash = String(req.body?.clientKeyHash || '').trim();
    const clientId = req.body?.clientId ? parseInt(String(req.body.clientId), 10) : null;
    if (!clientKeyHash) return res.status(400).json({ error: { message: 'clientKeyHash is required' } });
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const [result] = await pool.execute(
      `UPDATE agency_psychotherapy_report_rows
       SET client_id = ?
       WHERE agency_id = ? AND client_key_hash = ?`,
      [Number(clientId), Number(agencyId), clientKeyHash]
    );

    res.json({ ok: true, affected_rows: Number(result.affectedRows || 0) });
  } catch (e) {
    next(e);
  }
};

/**
 * Get client identifiers (abbrevs/initials) with 24+ sessions for a supervisee. Supervisor or admin/support only.
 * GET /psychotherapy-compliance/supervisee/:superviseeId/clients-24-plus?agencyId=...&fiscalYearStart=...
 */
export const getSuperviseeClients24Plus = async (req, res, next) => {
  try {
    const requesterId = Number(req.user?.id || 0);
    const superviseeId = req.params.superviseeId ? parseInt(String(req.params.superviseeId), 10) : null;
    const agencyIdRaw = req.query?.agencyId ?? req.body?.agencyId;
    const agencyId = agencyIdRaw ? parseInt(String(agencyIdRaw), 10) : null;
    if (!requesterId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    if (!superviseeId) return res.status(400).json({ error: { message: 'superviseeId is required' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    if (requesterId !== superviseeId) {
      const isAdminOrSupport = req.user.role === 'admin' || req.user.role === 'super_admin' || req.user.role === 'support';
      if (!isAdminOrSupport) {
        const hasAccess = await User.supervisorHasAccess(requesterId, superviseeId, agencyId);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'Access denied. You can only view compliance for your assigned supervisees.' } });
        }
      }
    }

    if (!(await requireAgencyMember(req, res, agencyId))) return;

    const fyRaw = String(req.query?.fiscalYearStart || '').trim();
    const now = new Date();
    const defaultFy = computeFiscalYearStartYmd(now);
    const fiscalYearStart = (fyRaw && /^\d{4}-\d{2}-\d{2}$/.test(fyRaw)) ? fyRaw : defaultFy;

    const params = [Number(agencyId), String(fiscalYearStart).slice(0, 10), Number(superviseeId)];
    const [rows] = await pool.execute(
      `SELECT
         r.client_id,
         r.client_key_hash,
         r.client_abbrev,
         r.provider_user_id,
         r.fiscal_year_start,
         r.service_code,
         COUNT(*) AS code_count
       FROM agency_psychotherapy_report_rows r
       WHERE r.agency_id = ?
         AND r.fiscal_year_start = ?
         AND r.provider_user_id = ?
       GROUP BY
         r.client_id,
         r.client_key_hash,
         r.client_abbrev,
         r.provider_user_id,
         r.fiscal_year_start,
         r.service_code
       ORDER BY r.client_id ASC, r.client_key_hash ASC, r.service_code ASC`,
      params
    );

    const makeKey = (r) => {
      const clientId = r.client_id === null ? null : Number(r.client_id);
      const clientKeyHash = String(r.client_key_hash || '');
      const providerId = r.provider_user_id === null ? null : Number(r.provider_user_id);
      const fy = String(r.fiscal_year_start || '').slice(0, 10);
      const scope = clientId ? `client:${clientId}` : `hash:${clientKeyHash}`;
      return `${scope}|provider:${providerId || 'none'}|fy:${fy}`;
    };
    const grouped = new Map();
    for (const r of rows || []) {
      const k = makeKey(r);
      if (!grouped.has(k)) {
        grouped.set(k, { client_abbrev: String(r.client_abbrev || '').trim() || 'Client', total: 0 });
      }
      const rec = grouped.get(k);
      rec.total += Number(r.code_count || 0);
    }
    const clientAbbrevs = [];
    for (const rec of grouped.values()) {
      if (rec.total >= 25) clientAbbrevs.push(rec.client_abbrev);
    }
    clientAbbrevs.sort((a, b) => String(a).localeCompare(String(b)));

    res.json({
      agency_id: Number(agencyId),
      supervisee_id: superviseeId,
      fiscal_year_start: fiscalYearStart,
      clientAbbrevs
    });
  } catch (e) {
    next(e);
  }
};
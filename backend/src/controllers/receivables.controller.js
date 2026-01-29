import multer from 'multer';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import crypto from 'crypto';
import pool from '../config/database.js';
import { encryptBillingSecret, decryptBillingSecret, isBillingEncryptionConfigured } from '../services/billingEncryption.service.js';
import ReceivablesReportUpload from '../models/ReceivablesReportUpload.model.js';
import ReceivablesReportRow from '../models/ReceivablesReportRow.model.js';
import ReceivablesInvoice from '../models/ReceivablesInvoice.model.js';
import ReceivablesInvoiceItem from '../models/ReceivablesInvoiceItem.model.js';
import { requirePayrollAccess } from './payroll.controller.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

function normalizeHeaderKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeMoney(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
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

function computeAgingBucket(daysOverdue) {
  const d = Number(daysOverdue);
  if (!Number.isFinite(d) || d < 0) return 'unknown';
  if (d < 14) return 'current';
  if (d < 28) return 'late_2w';
  if (d < 60) return 'late_4w';
  return 'collections_60';
}

function computeCollectionsStage(daysOverdue) {
  const b = computeAgingBucket(daysOverdue);
  if (b === 'late_2w' || b === 'late_4w') return 'X';
  if (b === 'collections_60') return 'Y';
  return '';
}

function stableStringify(obj) {
  const keys = Object.keys(obj || {}).sort();
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return JSON.stringify(out);
}

function computeFingerprint(fields) {
  const s = stableStringify(fields || {});
  return crypto.createHash('sha256').update(s).digest('hex');
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

function decryptField(row, prefix) {
  const ciphertextB64 = row?.[`${prefix}_ciphertext_b64`];
  const ivB64 = row?.[`${prefix}_iv_b64`];
  const authTagB64 = row?.[`${prefix}_auth_tag_b64`];
  if (!ciphertextB64 || !ivB64 || !authTagB64) return '';
  try {
    return decryptBillingSecret({ ciphertextB64, ivB64, authTagB64 });
  } catch {
    return '';
  }
}

function parseReceivablesFile(buffer, originalName) {
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

export const uploadReceivablesReport = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : (req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null);
      if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
      if (!(await requirePayrollAccess(req, res, agencyId))) return;
      if (!req.file) return res.status(400).json({ error: { message: 'file is required' } });
      if (!isBillingEncryptionConfigured()) {
        return res.status(500).json({ error: { message: 'Billing encryption not configured on server' } });
      }

      const normalizedRows = parseReceivablesFile(req.file.buffer, req.file.originalname);

      let minService = null;
      let maxService = null;

      // Stage insert rows
      const toInsert = [];
      for (const n of normalizedRows) {
        const serviceDateRaw = getFirst(n, ['date of service', 'dos', 'service date']);
        const serviceDate = parseServiceDate(serviceDateRaw);
        const serviceYmd = formatYmd(serviceDate);
        if (serviceYmd) {
          if (!minService || serviceYmd < minService) minService = serviceYmd;
          if (!maxService || serviceYmd > maxService) maxService = serviceYmd;
        }

        const patientName =
          String(getFirst(n, ['patient', 'patient name', 'client', 'client name']) || '').trim() ||
          `${String(getFirst(n, ['patient last name', 'last name', 'last']) || '').trim()}, ${String(getFirst(n, ['patient first name', 'first name', 'first']) || '').trim()}`.replace(/^,\s*/, '').trim();
        const payerName = String(getFirst(n, ['payer', 'payer name', 'insurance', 'insurance company', 'insurance name']) || '').trim();
        const claimId = String(getFirst(n, ['claim id', 'claim', 'invoice id', 'encounter id']) || '').trim();

        const balanceStatus = String(getFirst(n, ['patient balance status', 'paid status', 'paid']) || '').trim();
        const responsibility = safeMoney(getFirst(n, ['patient responsibility', 'patient responsibility amount', 'patient responsible', 'patient owes', 'patient balance due', 'patient balance']));
        const paid = safeMoney(getFirst(n, ['patient amount paid', 'amount paid', 'patient paid']));
        const outstanding = Math.max(0, Math.round((responsibility - paid) * 100) / 100);

        const rowType = String(getFirst(n, ['type', 'row type']) || '').trim();
        const paymentType = String(getFirst(n, ['payment type', 'payment']) || '').trim();

        const fingerprint = computeFingerprint({
          agencyId,
          serviceDate: serviceYmd,
          patientName,
          payerName,
          claimId,
          balanceStatus,
          responsibility,
          paid,
          rowType,
          paymentType
        });

        const patientEnc = patientName ? encToCols(encryptBillingSecret(patientName)) : encToCols(null);
        const payerEnc = payerName ? encToCols(encryptBillingSecret(payerName)) : encToCols(null);
        const claimEnc = claimId ? encToCols(encryptBillingSecret(claimId)) : encToCols(null);

        toInsert.push({
          serviceDate: serviceYmd || null,
          rowFingerprint: fingerprint,
          patientBalanceStatus: balanceStatus || null,
          rowType: rowType || null,
          paymentType: paymentType || null,
          patientResponsibilityAmount: responsibility,
          patientAmountPaid: paid,
          patientOutstandingAmount: outstanding,
          patientNameCiphertextB64: patientEnc.ciphertextB64,
          patientNameIvB64: patientEnc.ivB64,
          patientNameAuthTagB64: patientEnc.authTagB64,
          patientNameKeyId: patientEnc.keyId,
          payerNameCiphertextB64: payerEnc.ciphertextB64,
          payerNameIvB64: payerEnc.ivB64,
          payerNameAuthTagB64: payerEnc.authTagB64,
          payerNameKeyId: payerEnc.keyId,
          claimIdCiphertextB64: claimEnc.ciphertextB64,
          claimIdIvB64: claimEnc.ivB64,
          claimIdAuthTagB64: claimEnc.authTagB64,
          claimIdKeyId: claimEnc.keyId
        });
      }

      const uploadId = await ReceivablesReportUpload.create({
        agencyId,
        uploadedByUserId: req.user?.id || null,
        originalFilename: req.file.originalname || null,
        minServiceDate: minService,
        maxServiceDate: maxService
      });

      const rowsPayload = toInsert.map((r) => ({ ...r, uploadId, agencyId }));
      const inserted = await ReceivablesReportRow.bulkUpsert(rowsPayload);

      res.json({
        ok: true,
        agencyId,
        uploadId,
        file: { name: req.file.originalname || 'file', rows: normalizedRows.length },
        inserted,
        minServiceDate: minService,
        maxServiceDate: maxService
      });
    } catch (e) {
      next(e);
    }
  }
];

export const listReceivablesUploads = async (req, res, next) => {
  try {
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    const rows = await ReceivablesReportUpload.listByAgency({ agencyId, limit: req.query?.limit, offset: req.query?.offset });
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const listOutstandingReceivables = async (req, res, next) => {
  try {
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const start = req.query?.start ? String(req.query.start).slice(0, 10) : null;
    const end = req.query?.end ? String(req.query.end).slice(0, 10) : null;

    const rows = await ReceivablesReportRow.listOutstanding({
      agencyId,
      startYmd: start,
      endYmd: end,
      limit: req.query?.limit,
      offset: req.query?.offset
    });

    const today = new Date();
    const todayYmd = formatYmd(today);
    const daysBetween = (a, b) => {
      const da = parseServiceDate(a);
      const db = parseServiceDate(b);
      if (!da || !db) return null;
      const ms = db.getTime() - da.getTime();
      return Math.floor(ms / 86400000);
    };

    // Decrypt patient/payer names for authorized users (this endpoint is agency-backoffice only).
    const out = (rows || []).map((r) => {
      const patientName = decryptField(r, 'patient_name');
      const payerName = decryptField(r, 'payer_name');
      const claimId = decryptField(r, 'claim_id');
      const dos = r.service_date ? String(r.service_date).slice(0, 10) : '';
      const daysOverdue = dos ? daysBetween(dos, todayYmd) : null;
      const agingBucket = daysOverdue === null ? 'unknown' : computeAgingBucket(daysOverdue);
      const stage = daysOverdue === null ? '' : computeCollectionsStage(daysOverdue);
      return {
        id: Number(r.id),
        service_date: dos,
        days_overdue: daysOverdue,
        aging_bucket: agingBucket,
        suggested_collections_stage: stage,
        patient_name: patientName,
        payer_name: payerName,
        claim_id: claimId,
        patient_balance_status: r.patient_balance_status || '',
        patient_responsibility_amount: Number(r.patient_responsibility_amount || 0),
        patient_amount_paid: Number(r.patient_amount_paid || 0),
        patient_outstanding_amount: Number(r.patient_outstanding_amount || 0),
        row_type: r.row_type || '',
        payment_type: r.payment_type || ''
      };
    });

    res.json({ agencyId, rows: out });
  } catch (e) {
    next(e);
  }
};

export const createReceivablesDraftInvoice = async (req, res, next) => {
  try {
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const rowIds = Array.isArray(req.body?.rowIds) ? req.body.rowIds.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0) : [];
    if (!rowIds.length) return res.status(400).json({ error: { message: 'rowIds is required' } });

    // Verify rows exist and belong to agency
    const placeholders = rowIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT id, service_date, patient_outstanding_amount
       FROM agency_receivables_report_rows
       WHERE agency_id = ?
         AND id IN (${placeholders})`,
      [agencyId, ...rowIds]
    );
    const found = rows || [];
    if (!found.length) return res.status(404).json({ error: { message: 'No receivable rows found' } });

    // Determine invoice collections stage from the oldest DOS (max days overdue).
    const todayYmd = formatYmd(new Date());
    const daysBetween = (a, b) => {
      const da = parseServiceDate(a);
      const db = parseServiceDate(b);
      if (!da || !db) return null;
      const ms = db.getTime() - da.getTime();
      return Math.floor(ms / 86400000);
    };
    let maxDaysOverdue = 0;
    for (const r of found) {
      const dos = r.service_date ? String(r.service_date).slice(0, 10) : '';
      const d = dos ? daysBetween(dos, todayYmd) : null;
      if (Number.isFinite(d) && d > maxDaysOverdue) maxDaysOverdue = d;
    }
    const collectionsStage = computeCollectionsStage(maxDaysOverdue);

    // Default due date: 14 days from today if not provided.
    const dueDate =
      req.body?.dueDate
        ? String(req.body.dueDate).slice(0, 10)
        : formatYmd(new Date(Date.now() + 14 * 86400000));

    const invoiceId = await ReceivablesInvoice.create({
      agencyId,
      createdByUserId: req.user?.id || null,
      dueDate,
      status: 'draft',
      collectionsStage,
      externalFlag: 0,
      externalNotes: null
    });

    const items = found.map((r) => ({
      invoiceId,
      reportRowId: Number(r.id),
      description: 'Receivable balance',
      serviceDateStart: r.service_date ? String(r.service_date).slice(0, 10) : null,
      serviceDateEnd: r.service_date ? String(r.service_date).slice(0, 10) : null,
      amount: Number(r.patient_outstanding_amount || 0)
    }));
    await ReceivablesInvoiceItem.bulkInsert(items);

    res.status(201).json({ ok: true, invoiceId, items: items.length });
  } catch (e) {
    next(e);
  }
};

export const listReceivablesInvoices = async (req, res, next) => {
  try {
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    const rows = await ReceivablesInvoice.listByAgency({ agencyId, limit: req.query?.limit, offset: req.query?.offset });
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const patchReceivablesInvoice = async (req, res, next) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    if (!invoiceId) return res.status(400).json({ error: { message: 'invoice id is required' } });
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : (req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const updated = await ReceivablesInvoice.patch({
      invoiceId,
      agencyId,
      status: req.body?.status,
      collectionsStage: req.body?.collectionsStage,
      externalFlag: req.body?.externalFlag,
      externalNotes: req.body?.externalNotes,
      dueDate: req.body?.dueDate
    });
    res.json({ ok: true, updated });
  } catch (e) {
    next(e);
  }
};


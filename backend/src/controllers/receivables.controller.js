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
  if (d < 30) return 'days_0_29';
  if (d < 60) return 'days_30_59';
  if (d < 90) return 'days_60_89';
  return 'days_90_plus';
}

function computeCollectionsStage(daysOverdue) {
  const b = computeAgingBucket(daysOverdue);
  if (b === 'days_30_59' || b === 'days_60_89') return 'X';
  if (b === 'days_90_plus') return 'Y';
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

function baseTemplateForReceivablesEmail({
  agencyName,
  patientName,
  claimId,
  serviceDate,
  outstandingAmount,
  portalLink
}) {
  const patient = patientName || 'patient';
  const claim = claimId ? `Claim: ${claimId}\n` : '';
  const dos = serviceDate ? `Date of service: ${serviceDate}\n` : '';
  const amt = Number(outstandingAmount || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
  const portal = portalLink || '[INSERT EHR PORTAL LINK]';
  const subject = `${agencyName}: outstanding balance follow-up`;
  const body = `Hello ${patient},

Our billing team is following up on an outstanding balance on your account.

${claim}${dos}Outstanding balance: ${amt}

To resolve this balance, please log in to your EHR portal:
${portal}

If you have already made a payment, please reply with your payment date and confirmation details so we can update our records.

Thank you,
${agencyName}
Collections Management Team`;
  return { subject, body };
}

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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
    const collectionsStatus = req.query?.collectionsStatus ? String(req.query.collectionsStatus).trim().toLowerCase() : null;
    const managedOnly = String(req.query?.managedOnly || '').toLowerCase() === 'true' || String(req.query?.managedOnly || '') === '1';

    const rows = await ReceivablesReportRow.listOutstanding({
      agencyId,
      startYmd: start,
      endYmd: end,
      collectionsStatus,
      managedOnly,
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
        upload_id: Number(r.upload_id || 0) || null,
        upload_run_number: Number(r.upload_run_number || 0) || null,
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
        collections_status: String(r.collections_status || 'open'),
        managed_at: r.managed_at || null,
        managed_by_user_id: Number(r.managed_by_user_id || 0) || null,
        managed_by_name: [r.managed_by_first_name, r.managed_by_last_name].filter(Boolean).join(' ').trim() || null,
        managed_note: r.managed_note || '',
        last_email_draft_at: r.last_email_draft_at || null,
        paid_at: r.paid_at || null,
        paid_by_user_id: Number(r.paid_by_user_id || 0) || null,
        paid_by_name: [r.paid_by_first_name, r.paid_by_last_name].filter(Boolean).join(' ').trim() || null,
        paid_note: r.paid_note || '',
        reimbursed_percent: Number(r.reimbursed_percent || 0),
        reimbursed_updated_at: r.reimbursed_updated_at || null,
        row_type: r.row_type || '',
        payment_type: r.payment_type || ''
      };
    });

    res.json({ agencyId, rows: out });
  } catch (e) {
    next(e);
  }
};

async function getReceivableRowForAgency({ rowId, agencyId }) {
  const [rows] = await pool.execute(
    `SELECT
       r.*,
       u.run_number AS upload_run_number,
       mb.first_name AS managed_by_first_name,
       mb.last_name AS managed_by_last_name,
       pb.first_name AS paid_by_first_name,
       pb.last_name AS paid_by_last_name
     FROM agency_receivables_report_rows r
     JOIN agency_receivables_report_uploads u ON u.id = r.upload_id
     LEFT JOIN users mb ON mb.id = r.managed_by_user_id
     LEFT JOIN users pb ON pb.id = r.paid_by_user_id
     WHERE r.id = ? AND r.agency_id = ?
     LIMIT 1`,
    [rowId, agencyId]
  );
  return rows?.[0] || null;
}

async function insertReceivableAudit({
  reportRowId,
  agencyId,
  actionType,
  fromStatus = null,
  toStatus = null,
  note = null,
  metadata = null,
  createdByUserId = null
}) {
  await pool.execute(
    `INSERT INTO agency_receivables_row_audit
     (report_row_id, agency_id, action_type, from_status, to_status, note, metadata_json, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [reportRowId, agencyId, actionType, fromStatus, toStatus, note, metadata ? JSON.stringify(metadata) : null, createdByUserId]
  );
}

export const patchReceivableRowManagement = async (req, res, next) => {
  try {
    const rowId = parseInt(req.params.id, 10);
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : (req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null);
    if (!rowId) return res.status(400).json({ error: { message: 'row id is required' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const row = await getReceivableRowForAgency({ rowId, agencyId });
    if (!row) return res.status(404).json({ error: { message: 'Receivable row not found' } });

    const action = String(req.body?.action || '').trim().toLowerCase();
    const managedNote = String(req.body?.managedNote || '').trim();
    const fromStatus = String(row.collections_status || 'open').toLowerCase();
    let toStatus = fromStatus;
    if (action === 'mark_managed') toStatus = 'managed';
    else if (action === 'mark_open') toStatus = 'open';
    else if (action === 'mark_closed') toStatus = 'closed';
    else if (action === 'mark_paid') toStatus = 'closed';
    else if (action === 'mark_unpaid') toStatus = fromStatus === 'closed' ? 'open' : fromStatus;
    else if (action === 'update_note') toStatus = fromStatus;
    else return res.status(400).json({ error: { message: 'action must be one of: mark_managed, mark_open, mark_closed, mark_paid, mark_unpaid, update_note' } });

    const paidNote = String(req.body?.paidNote || '').trim();
    if (action !== 'update_note') {
      await pool.execute(
        `UPDATE agency_receivables_report_rows
         SET collections_status = ?,
             managed_at = CASE WHEN ? = 'managed' THEN CURRENT_TIMESTAMP ELSE managed_at END,
             managed_by_user_id = CASE WHEN ? = 'managed' THEN ? ELSE managed_by_user_id END,
             managed_note = CASE WHEN ? <> '' THEN ? ELSE managed_note END,
             paid_at = CASE
               WHEN ? = 'mark_paid' THEN CURRENT_TIMESTAMP
               WHEN ? = 'mark_unpaid' THEN NULL
               ELSE paid_at
             END,
             paid_by_user_id = CASE
               WHEN ? = 'mark_paid' THEN ?
               WHEN ? = 'mark_unpaid' THEN NULL
               ELSE paid_by_user_id
             END,
             paid_note = CASE
               WHEN ? = 'mark_paid' AND ? <> '' THEN ?
               WHEN ? = 'mark_unpaid' THEN NULL
               ELSE paid_note
             END
         WHERE id = ? AND agency_id = ?`,
        [
          toStatus,
          toStatus,
          toStatus,
          req.user?.id || null,
          managedNote,
          managedNote,
          action,
          action,
          action,
          req.user?.id || null,
          action,
          action,
          paidNote,
          paidNote,
          action,
          rowId,
          agencyId
        ]
      );
    } else {
      await pool.execute(
        `UPDATE agency_receivables_report_rows
         SET managed_note = ?
         WHERE id = ? AND agency_id = ?`,
        [managedNote, rowId, agencyId]
      );
    }

    try {
      await insertReceivableAudit({
        reportRowId: rowId,
        agencyId,
        actionType: action === 'update_note' ? 'managed_note_updated' : 'status_changed',
        fromStatus,
        toStatus,
        note: managedNote || null,
        metadata: { action },
        createdByUserId: req.user?.id || null
      });
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    const updated = await getReceivableRowForAgency({ rowId, agencyId });
    res.json({ ok: true, row: updated });
  } catch (e) {
    next(e);
  }
};

export const bulkManageReceivableRows = async (req, res, next) => {
  try {
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : (req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const rowIds = Array.isArray(req.body?.rowIds)
      ? req.body.rowIds.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    if (!rowIds.length) return res.status(400).json({ error: { message: 'rowIds is required' } });

    const action = String(req.body?.action || '').trim().toLowerCase();
    const managedNote = String(req.body?.managedNote || req.body?.note || '').trim();
    const paidNote = String(req.body?.paidNote || req.body?.note || '').trim();
    const validActions = ['mark_managed', 'mark_open', 'mark_closed', 'mark_paid', 'mark_unpaid', 'set_reimbursed_percent'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: { message: `action must be one of: ${validActions.join(', ')}` } });
    }

    let reimbursedPercent = null;
    if (action === 'set_reimbursed_percent') {
      const p = Number(req.body?.reimbursedPercent);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        return res.status(400).json({ error: { message: 'reimbursedPercent must be between 0 and 100' } });
      }
      reimbursedPercent = Math.round(p * 100) / 100;
    }

    const placeholders = rowIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT id, collections_status, reimbursed_percent
       FROM agency_receivables_report_rows
       WHERE agency_id = ?
         AND id IN (${placeholders})`,
      [agencyId, ...rowIds]
    );
    if (!rows?.length) return res.status(404).json({ error: { message: 'No receivable rows found' } });

    let updatedCount = 0;
    for (const row of rows) {
      const rowId = Number(row.id);
      const fromStatus = String(row.collections_status || 'open').toLowerCase();
      let toStatus = fromStatus;
      if (action === 'mark_managed') toStatus = 'managed';
      else if (action === 'mark_open') toStatus = 'open';
      else if (action === 'mark_closed') toStatus = 'closed';
      else if (action === 'mark_paid') toStatus = 'closed';
      else if (action === 'mark_unpaid') toStatus = fromStatus === 'closed' ? 'open' : fromStatus;

      if (action === 'mark_managed') {
        await pool.execute(
          `UPDATE agency_receivables_report_rows
           SET collections_status = 'managed',
               managed_at = CURRENT_TIMESTAMP,
               managed_by_user_id = ?,
               managed_note = CASE WHEN ? <> '' THEN ? ELSE managed_note END
           WHERE id = ? AND agency_id = ?`,
          [req.user?.id || null, managedNote, managedNote, rowId, agencyId]
        );
      } else if (action === 'mark_open' || action === 'mark_closed') {
        await pool.execute(
          `UPDATE agency_receivables_report_rows
           SET collections_status = ?,
               managed_note = CASE WHEN ? <> '' THEN ? ELSE managed_note END
           WHERE id = ? AND agency_id = ?`,
          [toStatus, managedNote, managedNote, rowId, agencyId]
        );
      } else if (action === 'mark_paid') {
        await pool.execute(
          `UPDATE agency_receivables_report_rows
           SET collections_status = 'closed',
               paid_at = CURRENT_TIMESTAMP,
               paid_by_user_id = ?,
               paid_note = CASE WHEN ? <> '' THEN ? ELSE paid_note END
           WHERE id = ? AND agency_id = ?`,
          [req.user?.id || null, paidNote, paidNote, rowId, agencyId]
        );
      } else if (action === 'mark_unpaid') {
        await pool.execute(
          `UPDATE agency_receivables_report_rows
           SET paid_at = NULL,
               paid_by_user_id = NULL,
               paid_note = NULL,
               collections_status = CASE WHEN collections_status = 'closed' THEN 'open' ELSE collections_status END
           WHERE id = ? AND agency_id = ?`,
          [rowId, agencyId]
        );
      } else if (action === 'set_reimbursed_percent') {
        await pool.execute(
          `UPDATE agency_receivables_report_rows
           SET reimbursed_percent = ?,
               reimbursed_updated_at = CURRENT_TIMESTAMP,
               reimbursed_updated_by_user_id = ?
           WHERE id = ? AND agency_id = ?`,
          [reimbursedPercent, req.user?.id || null, rowId, agencyId]
        );
      }

      try {
        if (action === 'set_reimbursed_percent') {
          await insertReceivableAudit({
            reportRowId: rowId,
            agencyId,
            actionType: 'managed_note_updated',
            fromStatus,
            toStatus: fromStatus,
            note: null,
            metadata: { action, field: 'reimbursed_percent', from: Number(row.reimbursed_percent || 0), to: reimbursedPercent },
            createdByUserId: req.user?.id || null
          });
        } else {
          await insertReceivableAudit({
            reportRowId: rowId,
            agencyId,
            actionType: 'status_changed',
            fromStatus,
            toStatus,
            note: managedNote || paidNote || null,
            metadata: { action },
            createdByUserId: req.user?.id || null
          });
        }
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
      updatedCount += 1;
    }

    res.json({ ok: true, found: rows.length, updated: updatedCount });
  } catch (e) {
    next(e);
  }
};

export const patchReceivableRowReimbursement = async (req, res, next) => {
  try {
    const rowId = parseInt(req.params.id, 10);
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : (req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null);
    if (!rowId) return res.status(400).json({ error: { message: 'row id is required' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const row = await getReceivableRowForAgency({ rowId, agencyId });
    if (!row) return res.status(404).json({ error: { message: 'Receivable row not found' } });

    const percent = Number(req.body?.reimbursedPercent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      return res.status(400).json({ error: { message: 'reimbursedPercent must be between 0 and 100' } });
    }
    const rounded = Math.round(percent * 100) / 100;

    await pool.execute(
      `UPDATE agency_receivables_report_rows
       SET reimbursed_percent = ?,
           reimbursed_updated_at = CURRENT_TIMESTAMP,
           reimbursed_updated_by_user_id = ?
       WHERE id = ? AND agency_id = ?`,
      [rounded, req.user?.id || null, rowId, agencyId]
    );

    try {
      await insertReceivableAudit({
        reportRowId: rowId,
        agencyId,
        actionType: 'managed_note_updated',
        fromStatus: row.collections_status || 'open',
        toStatus: row.collections_status || 'open',
        note: null,
        metadata: { field: 'reimbursed_percent', from: Number(row.reimbursed_percent || 0), to: rounded },
        createdByUserId: req.user?.id || null
      });
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    const updated = await getReceivableRowForAgency({ rowId, agencyId });
    res.json({ ok: true, row: updated });
  } catch (e) {
    next(e);
  }
};

export const listReceivableRowComments = async (req, res, next) => {
  try {
    const rowId = parseInt(req.params.id, 10);
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!rowId) return res.status(400).json({ error: { message: 'row id is required' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    const [rows] = await pool.execute(
      `SELECT c.*, u.first_name AS created_by_first_name, u.last_name AS created_by_last_name
       FROM agency_receivables_row_comments c
       LEFT JOIN users u ON u.id = c.created_by_user_id
       WHERE c.report_row_id = ? AND c.agency_id = ?
       ORDER BY c.created_at DESC, c.id DESC`,
      [rowId, agencyId]
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const createReceivableRowComment = async (req, res, next) => {
  try {
    const rowId = parseInt(req.params.id, 10);
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : (req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null);
    const commentText = String(req.body?.commentText || '').trim();
    if (!rowId) return res.status(400).json({ error: { message: 'row id is required' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!commentText) return res.status(400).json({ error: { message: 'commentText is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const row = await getReceivableRowForAgency({ rowId, agencyId });
    if (!row) return res.status(404).json({ error: { message: 'Receivable row not found' } });

    const [result] = await pool.execute(
      `INSERT INTO agency_receivables_row_comments
       (report_row_id, agency_id, comment_text, created_by_user_id)
       VALUES (?, ?, ?, ?)`,
      [rowId, agencyId, commentText, req.user?.id || null]
    );

    try {
      await insertReceivableAudit({
        reportRowId: rowId,
        agencyId,
        actionType: 'managed_note_updated',
        fromStatus: row.collections_status || 'open',
        toStatus: row.collections_status || 'open',
        note: commentText,
        metadata: { field: 'comment', commentId: result.insertId },
        createdByUserId: req.user?.id || null
      });
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    res.status(201).json({ ok: true, commentId: Number(result.insertId) });
  } catch (e) {
    next(e);
  }
};

export const exportReceivableEvidenceCsv = async (req, res, next) => {
  try {
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : (req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const rowIds = Array.isArray(req.body?.rowIds)
      ? req.body.rowIds.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    if (!rowIds.length) return res.status(400).json({ error: { message: 'rowIds is required' } });

    const placeholders = rowIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT
         r.id,
         r.upload_id,
         u.run_number AS upload_run_number,
         r.service_date,
         r.patient_balance_status,
         r.patient_responsibility_amount,
         r.patient_amount_paid,
         r.patient_outstanding_amount,
         r.collections_status,
         r.managed_at,
         r.managed_by_user_id,
         r.managed_note,
         r.paid_at,
         r.paid_by_user_id,
         r.paid_note,
         r.reimbursed_percent,
         r.patient_name_ciphertext_b64,
         r.patient_name_iv_b64,
         r.patient_name_auth_tag_b64,
         r.payer_name_ciphertext_b64,
         r.payer_name_iv_b64,
         r.payer_name_auth_tag_b64,
         r.claim_id_ciphertext_b64,
         r.claim_id_iv_b64,
         r.claim_id_auth_tag_b64,
         mb.first_name AS managed_by_first_name,
         mb.last_name AS managed_by_last_name,
         pb.first_name AS paid_by_first_name,
         pb.last_name AS paid_by_last_name
       FROM agency_receivables_report_rows r
       JOIN agency_receivables_report_uploads u ON u.id = r.upload_id
       LEFT JOIN users mb ON mb.id = r.managed_by_user_id
       LEFT JOIN users pb ON pb.id = r.paid_by_user_id
       WHERE r.agency_id = ?
         AND r.id IN (${placeholders})
       ORDER BY r.service_date ASC, r.id ASC`,
      [agencyId, ...rowIds]
    );
    if (!rows?.length) return res.status(404).json({ error: { message: 'No receivable rows found' } });

    const [commentRows] = await pool.execute(
      `SELECT
         c.id,
         c.report_row_id,
         c.comment_text,
         c.created_at,
         u.first_name AS created_by_first_name,
         u.last_name AS created_by_last_name
       FROM agency_receivables_row_comments c
       LEFT JOIN users u ON u.id = c.created_by_user_id
       WHERE c.agency_id = ?
         AND c.report_row_id IN (${placeholders})
       ORDER BY c.report_row_id ASC, c.created_at ASC, c.id ASC`,
      [agencyId, ...rowIds]
    );

    const [auditRows] = await pool.execute(
      `SELECT
         a.id,
         a.report_row_id,
         a.action_type,
         a.from_status,
         a.to_status,
         a.note,
         a.metadata_json,
         a.created_at,
         u.first_name AS created_by_first_name,
         u.last_name AS created_by_last_name
       FROM agency_receivables_row_audit a
       LEFT JOIN users u ON u.id = a.created_by_user_id
       WHERE a.agency_id = ?
         AND a.report_row_id IN (${placeholders})
       ORDER BY a.report_row_id ASC, a.created_at ASC, a.id ASC`,
      [agencyId, ...rowIds]
    );

    const commentsByRowId = new Map();
    for (const c of commentRows || []) {
      const key = Number(c.report_row_id || 0);
      if (!commentsByRowId.has(key)) commentsByRowId.set(key, []);
      commentsByRowId.get(key).push(c);
    }
    const auditsByRowId = new Map();
    for (const a of auditRows || []) {
      const key = Number(a.report_row_id || 0);
      if (!auditsByRowId.has(key)) auditsByRowId.set(key, []);
      auditsByRowId.get(key).push(a);
    }

    const header = [
      'row_id',
      'upload_run_number',
      'service_date',
      'patient_name',
      'payer_name',
      'claim_id',
      'patient_balance_status',
      'patient_responsibility_amount',
      'patient_amount_paid',
      'patient_outstanding_amount',
      'collections_status',
      'managed_at',
      'managed_by',
      'managed_note',
      'paid_at',
      'paid_by',
      'paid_note',
      'reimbursed_percent',
      'comments_count',
      'comments_history',
      'audit_count',
      'audit_history'
    ];
    const lines = [header.join(',')];

    for (const r of rows || []) {
      const rowId = Number(r.id || 0);
      const patientName = decryptField(r, 'patient_name');
      const payerName = decryptField(r, 'payer_name');
      const claimId = decryptField(r, 'claim_id');

      const comments = commentsByRowId.get(rowId) || [];
      const commentsHistory = comments
        .map((c) => {
          const by = [c.created_by_first_name, c.created_by_last_name].filter(Boolean).join(' ').trim() || 'Unknown';
          const at = String(c.created_at || '').slice(0, 19) || '';
          return `${at} - ${by}: ${String(c.comment_text || '').trim()}`;
        })
        .join(' || ');

      const audits = auditsByRowId.get(rowId) || [];
      const auditsHistory = audits
        .map((a) => {
          const by = [a.created_by_first_name, a.created_by_last_name].filter(Boolean).join(' ').trim() || 'Unknown';
          const at = String(a.created_at || '').slice(0, 19) || '';
          let metadataStr = '';
          if (a.metadata_json) {
            try {
              const parsed = typeof a.metadata_json === 'string' ? JSON.parse(a.metadata_json) : a.metadata_json;
              metadataStr = parsed ? ` metadata=${JSON.stringify(parsed)}` : '';
            } catch {
              metadataStr = ` metadata=${String(a.metadata_json)}`;
            }
          }
          return `${at} - ${by}: ${a.action_type} (${a.from_status || ''} -> ${a.to_status || ''})${a.note ? ` note=${a.note}` : ''}${metadataStr}`;
        })
        .join(' || ');

      const managedBy = [r.managed_by_first_name, r.managed_by_last_name].filter(Boolean).join(' ').trim();
      const paidBy = [r.paid_by_first_name, r.paid_by_last_name].filter(Boolean).join(' ').trim();
      const rowVals = [
        rowId,
        Number(r.upload_run_number || 0) || '',
        r.service_date ? String(r.service_date).slice(0, 10) : '',
        patientName,
        payerName,
        claimId,
        r.patient_balance_status || '',
        Number(r.patient_responsibility_amount || 0).toFixed(2),
        Number(r.patient_amount_paid || 0).toFixed(2),
        Number(r.patient_outstanding_amount || 0).toFixed(2),
        r.collections_status || '',
        r.managed_at ? String(r.managed_at).slice(0, 19) : '',
        managedBy,
        r.managed_note || '',
        r.paid_at ? String(r.paid_at).slice(0, 19) : '',
        paidBy,
        r.paid_note || '',
        Number(r.reimbursed_percent || 0).toFixed(2),
        comments.length,
        commentsHistory,
        audits.length,
        auditsHistory
      ];
      lines.push(rowVals.map(csvEscape).join(','));
    }

    const csv = `${lines.join('\n')}\n`;
    const stamp = formatYmd(new Date()).replace(/-/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=\"receivables-evidence-${agencyId}-${stamp}.csv\"`);
    res.status(200).send(csv);
  } catch (e) {
    next(e);
  }
};

export const createReceivableEmailDraft = async (req, res, next) => {
  try {
    const rowId = parseInt(req.params.id, 10);
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : (req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null);
    if (!rowId) return res.status(400).json({ error: { message: 'row id is required' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const row = await getReceivableRowForAgency({ rowId, agencyId });
    if (!row) return res.status(404).json({ error: { message: 'Receivable row not found' } });

    const patientName = decryptField(row, 'patient_name');
    const claimId = decryptField(row, 'claim_id');
    const recipientEmail = String(req.body?.recipientEmail || '').trim() || null;
    const ehrPortalLink = String(req.body?.ehrPortalLink || '').trim() || null;

    const [aRows] = await pool.execute('SELECT id, name, portal_url FROM agencies WHERE id = ? LIMIT 1', [agencyId]);
    const agency = aRows?.[0] || {};
    const agencyName = String(agency?.name || 'Billing Team').trim();
    const portalLink = ehrPortalLink || String(agency?.portal_url || '').trim() || null;

    const draft = baseTemplateForReceivablesEmail({
      agencyName,
      patientName,
      claimId,
      serviceDate: row.service_date ? String(row.service_date).slice(0, 10) : '',
      outstandingAmount: row.patient_outstanding_amount,
      portalLink
    });
    const subject = String(req.body?.subject || draft.subject || '').trim() || draft.subject;
    const body = String(req.body?.body || draft.body || '').trim() || draft.body;

    const [result] = await pool.execute(
      `INSERT INTO agency_receivables_email_drafts
       (report_row_id, agency_id, recipient_email, ehr_portal_link, subject, body, status, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [rowId, agencyId, recipientEmail, portalLink, subject, body, req.user?.id || null]
    );

    await pool.execute(
      `UPDATE agency_receivables_report_rows
       SET last_email_draft_at = CURRENT_TIMESTAMP,
           last_email_draft_by_user_id = ?
       WHERE id = ? AND agency_id = ?`,
      [req.user?.id || null, rowId, agencyId]
    );

    try {
      await insertReceivableAudit({
        reportRowId: rowId,
        agencyId,
        actionType: 'email_draft_created',
        fromStatus: row.collections_status || 'open',
        toStatus: row.collections_status || 'open',
        note: null,
        metadata: { draftId: result.insertId, recipientEmail, ehrPortalLink: portalLink },
        createdByUserId: req.user?.id || null
      });
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    res.status(201).json({
      ok: true,
      draft: {
        id: Number(result.insertId),
        report_row_id: rowId,
        recipient_email: recipientEmail,
        ehr_portal_link: portalLink,
        subject,
        body,
        status: 'draft'
      }
    });
  } catch (e) {
    next(e);
  }
};

export const listReceivableEmailDrafts = async (req, res, next) => {
  try {
    const rowId = parseInt(req.params.id, 10);
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!rowId) return res.status(400).json({ error: { message: 'row id is required' } });
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const [rows] = await pool.execute(
      `SELECT d.*, u.first_name AS created_by_first_name, u.last_name AS created_by_last_name
       FROM agency_receivables_email_drafts d
       LEFT JOIN users u ON u.id = d.created_by_user_id
       WHERE d.report_row_id = ? AND d.agency_id = ?
       ORDER BY d.created_at DESC, d.id DESC`,
      [rowId, agencyId]
    );
    res.json(rows || []);
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


import multer from 'multer';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import pool from '../config/database.js';

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

function parseDateAny(raw) {
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

function formatYmd(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getFirst(n, keys) {
  for (const k of keys) {
    const v = n?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}

function parseRevenueFile(buffer, originalName) {
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

  const normalizedRows = [];
  for (const raw of records || []) {
    const n = {};
    for (const [k, v] of Object.entries(raw || {})) n[normalizeHeaderKey(k)] = v;
    normalizedRows.push(n);
  }
  return normalizedRows;
}

export const uploadPlatformRevenueReport = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: { message: 'file is required' } });

      const reportLabel = req.body?.reportLabel ? String(req.body.reportLabel).trim() : null;
      const reportDate = req.body?.reportDate ? formatYmd(parseDateAny(req.body.reportDate)) : '';
      const reportDateYmd = reportDate || formatYmd(new Date());

      const rows = parseRevenueFile(req.file.buffer, req.file.originalname);
      if (!rows.length) return res.status(400).json({ error: { message: 'No rows found in report' } });

      const [uploadResult] = await pool.execute(
        `INSERT INTO platform_revenue_report_uploads
         (uploaded_by_user_id, original_filename, report_label, report_date)
         VALUES (?, ?, ?, ?)`,
        [req.user?.id || null, req.file.originalname || null, reportLabel, reportDateYmd || null]
      );
      const uploadId = uploadResult.insertId;

      // Attempt to map agency by id/slug/name.
      // For now, allow agency_name-only rows if no match is found.
      const inserts = [];
      for (const n of rows) {
        const agencyIdRaw = getFirst(n, ['agency id', 'agency_id']);
        const agencySlug = String(getFirst(n, ['agency slug', 'agency_slug', 'slug']) || '').trim();
        const agencyName = String(getFirst(n, ['agency', 'agency name', 'organization', 'organization name', 'org', 'org name', 'name']) || '').trim();

        const periodStart = formatYmd(parseDateAny(getFirst(n, ['period start', 'start date', 'start', 'from'])));
        const periodEnd = formatYmd(parseDateAny(getFirst(n, ['period end', 'end date', 'end', 'to'])));

        const managedTotal = safeMoney(getFirst(n, ['managed total', 'managed', 'total managed', 'managed revenue', 'revenue managed']));
        const collectedTotal = safeMoney(getFirst(n, ['collected total', 'collected', 'total collected', 'payments', 'payments total']));
        const outstandingTotal = safeMoney(getFirst(n, ['outstanding total', 'outstanding', 'total outstanding', 'ar', 'a r', 'accounts receivable']));
        const grossChargesTotal = safeMoney(getFirst(n, ['gross charges', 'charges', 'gross charges total', 'total charges']));

        let agencyId = null;
        const agencyIdNum = agencyIdRaw ? parseInt(agencyIdRaw, 10) : null;
        if (agencyIdNum && Number.isFinite(agencyIdNum) && agencyIdNum > 0) {
          agencyId = agencyIdNum;
        } else if (agencySlug) {
          const [a] = await pool.execute(`SELECT id FROM agencies WHERE slug = ? LIMIT 1`, [agencySlug]);
          if (a?.[0]?.id) agencyId = Number(a[0].id);
        } else if (agencyName) {
          const [a] = await pool.execute(`SELECT id FROM agencies WHERE name = ? LIMIT 1`, [agencyName]);
          if (a?.[0]?.id) agencyId = Number(a[0].id);
        }

        inserts.push([
          uploadId,
          agencyId,
          agencyName || null,
          periodStart || null,
          periodEnd || null,
          managedTotal,
          collectedTotal,
          outstandingTotal,
          grossChargesTotal
        ]);
      }

      if (inserts.length) {
        const placeholders = inserts.map(() => '(?,?,?,?,?,?,?,?,?)').join(',');
        const flat = inserts.flat();
        await pool.execute(
          `INSERT INTO platform_revenue_report_rows
           (upload_id, agency_id, agency_name, period_start, period_end, managed_total, collected_total, outstanding_total, gross_charges_total)
           VALUES ${placeholders}`,
          flat
        );
      }

      res.status(201).json({
        ok: true,
        uploadId,
        reportDate: reportDateYmd,
        reportLabel,
        file: { name: req.file.originalname || 'file', rows: rows.length }
      });
    } catch (e) {
      next(e);
    }
  }
];

export async function listPlatformRevenueUploads(req, res, next) {
  try {
    const limit = Math.max(0, Math.min(500, parseInt(req.query?.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query?.offset, 10) || 0);
    const [rows] = await pool.execute(
      `SELECT *
       FROM platform_revenue_report_uploads
       ORDER BY created_at DESC, id DESC
       LIMIT ${limit} OFFSET ${offset}`
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
}

export async function getPlatformRevenueSummary(req, res, next) {
  try {
    const uploadId = req.query?.uploadId ? parseInt(req.query.uploadId, 10) : null;
    let effectiveUploadId = uploadId;
    if (!effectiveUploadId) {
      const [u] = await pool.execute(`SELECT id FROM platform_revenue_report_uploads ORDER BY created_at DESC, id DESC LIMIT 1`);
      effectiveUploadId = u?.[0]?.id ? Number(u[0].id) : null;
    }
    if (!effectiveUploadId) return res.json({ uploadId: null, totals: null, agencies: [] });

    const [totalsRows] = await pool.execute(
      `SELECT
        SUM(r.managed_total) AS managed_total,
        SUM(r.collected_total) AS collected_total,
        SUM(r.outstanding_total) AS outstanding_total,
        SUM(r.gross_charges_total) AS gross_charges_total,
        COUNT(*) AS row_count,
        COUNT(DISTINCT COALESCE(r.agency_id, r.agency_name)) AS agency_count
       FROM platform_revenue_report_rows r
       WHERE r.upload_id = ?`,
      [effectiveUploadId]
    );
    const totals = totalsRows?.[0] || null;

    const [agencyRows] = await pool.execute(
      `SELECT
        r.agency_id,
        COALESCE(a.name, r.agency_name) AS agency_name,
        SUM(r.managed_total) AS managed_total,
        SUM(r.collected_total) AS collected_total,
        SUM(r.outstanding_total) AS outstanding_total,
        SUM(r.gross_charges_total) AS gross_charges_total,
        MIN(r.period_start) AS period_start_min,
        MAX(r.period_end) AS period_end_max
       FROM platform_revenue_report_rows r
       LEFT JOIN agencies a ON a.id = r.agency_id
       WHERE r.upload_id = ?
       GROUP BY r.agency_id, COALESCE(a.name, r.agency_name)
       ORDER BY managed_total DESC, agency_name ASC`,
      [effectiveUploadId]
    );

    res.json({ uploadId: effectiveUploadId, totals, agencies: agencyRows || [] });
  } catch (e) {
    next(e);
  }
}


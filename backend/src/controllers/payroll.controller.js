import multer from 'multer';
import { parse } from 'csv-parse/sync';
import User from '../models/User.model.js';
import PayrollPeriod from '../models/PayrollPeriod.model.js';
import PayrollRate from '../models/PayrollRate.model.js';
import PayrollImport from '../models/PayrollImport.model.js';
import PayrollImportRow from '../models/PayrollImportRow.model.js';
import PayrollSummary from '../models/PayrollSummary.model.js';
import PayrollAdpExportJob from '../models/PayrollAdpExportJob.model.js';
import pool from '../config/database.js';
import AdpPayrollService from '../services/adpPayroll.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) cb(null, true);
    else cb(new Error('Invalid file type. Only CSV files are allowed.'), false);
  }
});

const canManagePayroll = (role) => role === 'admin' || role === 'super_admin' || role === 'support';

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z\\s]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function parsePayrollCsv(buffer) {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true
  });

  return records.map((row, idx) => {
    const normalized = {};
    for (const [k, v] of Object.entries(row)) normalized[String(k).toLowerCase().trim()] = v;

    const providerName =
      normalized['provider name'] ||
      normalized['provider'] ||
      normalized['clinician'] ||
      normalized['name'] ||
      '';

    const serviceCode =
      normalized['service code'] ||
      normalized['service_code'] ||
      normalized['code'] ||
      normalized['cpt'] ||
      '';

    const unitsRaw =
      normalized['units'] ||
      normalized['unit_count'] ||
      normalized['count'] ||
      normalized['qty'] ||
      normalized['quantity'] ||
      '0';

    if (!providerName || !serviceCode) {
      throw new Error(`Row ${idx + 2}: provider name and service code are required`);
    }

    const unitCount = Number(String(unitsRaw).replace(/[^0-9.\\-]/g, '')) || 0;
    return {
      providerName: String(providerName).trim(),
      serviceCode: String(serviceCode).trim(),
      unitCount,
      rawRow: row
    };
  });
}

export const createPayrollPeriod = async (req, res, next) => {
  try {
    if (!canManagePayroll(req.user.role)) return res.status(403).json({ error: { message: 'Admin access required' } });

    const { agencyId, label, periodStart, periodEnd } = req.body || {};
    if (!agencyId || !periodStart || !periodEnd) {
      return res.status(400).json({ error: { message: 'agencyId, periodStart, and periodEnd are required' } });
    }
    const p = await PayrollPeriod.create({
      agencyId: parseInt(agencyId),
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

export const listPayrollPeriods = async (req, res, next) => {
  try {
    if (!canManagePayroll(req.user.role)) return res.status(403).json({ error: { message: 'Admin access required' } });
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const rows = await PayrollPeriod.listByAgency(agencyId, { limit: 100, offset: 0 });
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const getPayrollPeriod = async (req, res, next) => {
  try {
    if (!canManagePayroll(req.user.role)) return res.status(403).json({ error: { message: 'Admin access required' } });
    const id = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(id);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
    const rows = await PayrollImportRow.listForPeriod(id);
    const summaries = await PayrollSummary.listForPeriod(id);
    res.json({ period, rows, summaries });
  } catch (e) {
    next(e);
  }
};

export const upsertRate = async (req, res, next) => {
  try {
    if (!canManagePayroll(req.user.role)) return res.status(403).json({ error: { message: 'Admin access required' } });
    const { agencyId, userId, serviceCode, rateAmount, rateUnit, effectiveStart, effectiveEnd } = req.body || {};
    if (!agencyId || !userId || !serviceCode || rateAmount === undefined) {
      return res.status(400).json({ error: { message: 'agencyId, userId, serviceCode, and rateAmount are required' } });
    }
    const r = await PayrollRate.upsert({
      agencyId: parseInt(agencyId),
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
    if (!canManagePayroll(req.user.role)) return res.status(403).json({ error: { message: 'Admin access required' } });
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    const userId = req.query.userId ? parseInt(req.query.userId) : null;
    if (!agencyId || !userId) return res.status(400).json({ error: { message: 'agencyId and userId are required' } });
    const rows = await PayrollRate.listForUser(agencyId, userId);
    res.json(rows);
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

export const importPayrollCsv = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!canManagePayroll(req.user.role)) return res.status(403).json({ error: { message: 'Admin access required' } });
      const payrollPeriodId = parseInt(req.params.id);
      const period = await PayrollPeriod.findById(payrollPeriodId);
      if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });
      if (!req.file) return res.status(400).json({ error: { message: 'No CSV file uploaded' } });

      const agencyId = period.agency_id;
      const parsed = parsePayrollCsv(req.file.buffer);

      // Build name->user map for users in agency
      const [agencyUsers] = await pool.execute(
        `SELECT DISTINCT u.id, u.first_name, u.last_name
         FROM users u
         JOIN user_agencies ua ON u.id = ua.user_id
         WHERE ua.agency_id = ?`,
        [agencyId]
      );

      const nameToId = new Map();
      for (const u of agencyUsers || []) {
        const full = normalizeName(`${u.first_name || ''} ${u.last_name || ''}`);
        if (full) nameToId.set(full, u.id);
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
        return {
          payrollImportId: imp.id,
          payrollPeriodId,
          agencyId,
          userId,
          providerName: r.providerName,
          serviceCode: r.serviceCode,
          unitCount: r.unitCount,
          rawRow: r.rawRow
        };
      });

      await PayrollImportRow.bulkInsert(rowsToInsert);
      await recomputeSummaries({
        payrollPeriodId,
        agencyId,
        periodStart: period.period_start,
        periodEnd: period.period_end
      });

      const unmatched = rowsToInsert.filter((r) => !r.userId).slice(0, 50);
      res.json({
        import: imp,
        inserted: rowsToInsert.length,
        unmatchedProvidersSample: unmatched.map((u) => u.providerName)
      });
    } catch (e) {
      next(e);
    }
  }
];

export const listUserPayroll = async (req, res, next) => {
  try {
    if (!canManagePayroll(req.user.role)) return res.status(403).json({ error: { message: 'Admin access required' } });
    const userId = parseInt(req.params.userId);
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId) : null;
    const rows = await PayrollSummary.listForUser({ userId, agencyId, limit: 100, offset: 0 });
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const requestAdpExport = async (req, res, next) => {
  try {
    if (!canManagePayroll(req.user.role)) return res.status(403).json({ error: { message: 'Admin access required' } });
    const payrollPeriodId = parseInt(req.params.id);
    const period = await PayrollPeriod.findById(payrollPeriodId);
    if (!period) return res.status(404).json({ error: { message: 'Pay period not found' } });

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


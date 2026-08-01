import multer from 'multer';
import pool from '../config/database.js';
import { requirePayrollAccess } from './payroll.controller.js';
import {
  ingestBillingReport,
  revertBillingReportUpload,
  getSessionTotalsByClient,
  getProviderClientPosFlags,
  getProviderSchoolAffiliatedClientIds,
  getRevenueAggregates,
  listBillingEncountersForClient,
  listBillingDiagnosesForClient,
  autoTerminateInactiveBillingClients,
  computeFiscalYearStartAugYmd,
  formatYmd
} from '../services/billingReportIngest.service.js';
import { isBillingEncryptionConfigured } from '../services/billingEncryption.service.js';
import {
  ensureBillingFinancialAccess,
  ensureMedicalRecordAccess
} from '../services/billingReportAccess.service.js';
import {
  ensureClinicalSessionForBillingEncounter,
  enrichEncountersWithNoteSummary,
  stripEncounterFinancials
} from '../services/billingEncounterClinical.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const name = file.originalname?.toLowerCase?.() || '';
    if (file.mimetype === 'text/csv' || name.endsWith('.csv')) return cb(null, true);
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      name.endsWith('.xlsx') ||
      name.endsWith('.xls')
    ) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type. Only CSV/XLSX files are allowed.'), false);
  }
});

export const uploadBillingReport = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      const agencyId = req.body?.agencyId
        ? parseInt(req.body.agencyId, 10)
        : req.query?.agencyId
          ? parseInt(req.query.agencyId, 10)
          : null;
      if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
      if (!(await requirePayrollAccess(req, res, agencyId))) return;
      if (!req.file) return res.status(400).json({ error: { message: 'file is required' } });
      if (!isBillingEncryptionConfigured()) {
        return res.status(500).json({ error: { message: 'Billing encryption not configured on server' } });
      }

      const result = await ingestBillingReport({
        agencyId,
        fileBuffer: req.file.buffer,
        originalFilename: req.file.originalname,
        uploadedByUserId: req.user?.id || null,
        reportLabel: req.body?.reportLabel ? String(req.body.reportLabel).trim() : null
      });

      res.status(201).json({ ok: true, ...result });
    } catch (e) {
      if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
      next(e);
    }
  }
];

export const listBillingReportUploads = async (req, res, next) => {
  try {
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const limit = Math.max(0, Math.min(200, parseInt(req.query?.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query?.offset, 10) || 0);
    const [rows] = await pool.execute(
      `SELECT id, agency_id, original_filename, status, report_label,
              rows_parsed, lines_inserted, lines_updated, clients_created, clients_matched,
              encounters_created, unmatched_providers_json, result_summary_json,
              min_service_date, max_service_date, error_message, created_at, completed_at
       FROM billing_report_uploads
       WHERE agency_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [agencyId]
    );
    res.json({ uploads: rows || [] });
  } catch (e) {
    next(e);
  }
};

export const getBillingReportUpload = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const [rows] = await pool.execute(`SELECT * FROM billing_report_uploads WHERE id = ? LIMIT 1`, [id]);
    const uploadRow = rows?.[0];
    if (!uploadRow) return res.status(404).json({ error: { message: 'Upload not found' } });
    if (!(await requirePayrollAccess(req, res, uploadRow.agency_id))) return;
    res.json({ upload: uploadRow });
  } catch (e) {
    next(e);
  }
};

export const getBillingSessionTotals = async (req, res, next) => {
  try {
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const role = String(req.user?.role || '').toLowerCase();
    const isProvider = ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'].includes(role);
    let providerUserId = req.query?.providerUserId ? parseInt(req.query.providerUserId, 10) : null;
    if (isProvider) {
      providerUserId = Number(req.user.id);
      const [ua] = await pool.execute(
        `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
        [providerUserId, agencyId]
      );
      if (!ua?.length && role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    } else if (!(await requirePayrollAccess(req, res, agencyId))) {
      return;
    }

    let fiscalYearStart = req.query?.fiscalYearStart
      ? String(req.query.fiscalYearStart).slice(0, 10)
      : '';
    if (!fiscalYearStart) {
      fiscalYearStart = computeFiscalYearStartAugYmd(new Date());
    }
    // Accept legacy Jul 1 FY starts and coerce to Aug 1 of same year label
    if (/^\d{4}-07-01$/.test(fiscalYearStart)) {
      fiscalYearStart = `${fiscalYearStart.slice(0, 4)}-08-01`;
    }

    const byClientId = await getSessionTotalsByClient({
      agencyId,
      fiscalYearStart,
      providerUserId: providerUserId || null
    });

    res.json({
      fiscalYearStart,
      fiscalYearEnd: `${Number(fiscalYearStart.slice(0, 4)) + 1}-07-31`,
      byClientId
    });
  } catch (e) {
    next(e);
  }
};

export const getBillingRevenueSummary = async (req, res, next) => {
  try {
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const role = String(req.user?.role || '').toLowerCase();
    if (agencyId) {
      if (!(await requirePayrollAccess(req, res, agencyId))) return;
    } else if (role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'agencyId is required' } });
    }

    const startYmd = req.query?.start ? String(req.query.start).slice(0, 10) : null;
    const endYmd = req.query?.end ? String(req.query.end).slice(0, 10) : null;
    const result = await getRevenueAggregates({ agencyId, startYmd, endYmd });
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const listClientBillingEncounters = async (req, res, next) => {
  try {
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const clientId = parseInt(req.params.clientId, 10);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    if (!(await ensureBillingFinancialAccess(req, res, { agencyId }))) return;

    const encounters = await listBillingEncountersForClient({
      agencyId,
      clientId,
      limit: req.query?.limit
    });
    res.json({ encounters });
  } catch (e) {
    next(e);
  }
};

export const listClientMedicalRecord = async (req, res, next) => {
  try {
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const clientId = parseInt(req.params.clientId, 10);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    if (!(await ensureMedicalRecordAccess(req, res, { agencyId, clientId }))) return;

    const raw = await listBillingEncountersForClient({
      agencyId,
      clientId,
      limit: req.query?.limit
    });
    const encounters = (await enrichEncountersWithNoteSummary(raw)).map(stripEncounterFinancials);
    res.json({ encounters });
  } catch (e) {
    next(e);
  }
};

export const bootstrapBillingEncounterClinicalSession = async (req, res, next) => {
  try {
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : null;
    const encounterId = parseInt(req.params.encounterId, 10);
    if (!agencyId || !encounterId) {
      return res.status(400).json({ error: { message: 'agencyId and encounterId are required' } });
    }

    const [rows] = await pool.execute(
      `SELECT client_id FROM billing_encounters WHERE id = ? AND agency_id = ? LIMIT 1`,
      [encounterId, agencyId]
    );
    const clientId = Number(rows?.[0]?.client_id || 0);
    if (!clientId) return res.status(404).json({ error: { message: 'Billing encounter not found' } });
    if (!(await ensureMedicalRecordAccess(req, res, { agencyId, clientId }))) return;

    const result = await ensureClinicalSessionForBillingEncounter({
      agencyId,
      billingEncounterId: encounterId,
      actingUserId: req.user?.id || null
    });
    res.json({
      ok: true,
      clinicalSessionId: result.session?.id || null,
      clinicalNoteId: null,
      created: result.created
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listClientBillingDiagnoses = async (req, res, next) => {
  try {
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const clientId = parseInt(req.params.clientId, 10);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    if (!(await ensureMedicalRecordAccess(req, res, { agencyId, clientId }))) return;

    const diagnoses = await listBillingDiagnosesForClient({ agencyId, clientId });
    res.json({ diagnoses });
  } catch (e) {
    next(e);
  }
};

export const getBillingProviderClientPos = async (req, res, next) => {
  try {
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const role = String(req.user?.role || '').toLowerCase();
    let providerUserId = req.query?.providerUserId ? parseInt(req.query.providerUserId, 10) : null;
    const isProvider = ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'].includes(role);
    if (isProvider) {
      providerUserId = Number(req.user.id);
      const [ua] = await pool.execute(
        `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
        [providerUserId, agencyId]
      );
      if (!ua?.length && role !== 'super_admin') {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    } else if (!(await requirePayrollAccess(req, res, agencyId))) {
      return;
    }
    if (!providerUserId) {
      return res.status(400).json({ error: { message: 'providerUserId is required' } });
    }

    const [byClientId, schoolAffiliatedClientIds] = await Promise.all([
      getProviderClientPosFlags({ agencyId, providerUserId }),
      getProviderSchoolAffiliatedClientIds({ agencyId, providerUserId }).catch(() => [])
    ]);

    // School affiliation (including historical) also marks seenAtSchool for Setting UI.
    for (const rawId of schoolAffiliatedClientIds || []) {
      const key = String(rawId);
      const prev = byClientId[key] || { seenAtSchool: false, seenAtOffice: false };
      byClientId[key] = { ...prev, seenAtSchool: true };
    }

    res.json({ byClientId, schoolAffiliatedClientIds: schoolAffiliatedClientIds || [] });
  } catch (e) {
    next(e);
  }
};

/** Terminated (or inactive-assignment) clients still tied to a provider via billing encounters. */
export const listProviderBillingClients = async (req, res, next) => {
  try {
    const agencyId = req.query?.agencyId ? parseInt(req.query.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const role = String(req.user?.role || '').toLowerCase();
    let providerUserId = req.query?.providerUserId ? parseInt(req.query.providerUserId, 10) : null;
    const isProvider = ['provider', 'provider_plus', 'intern', 'intern_plus', 'clinical_practice_assistant'].includes(role);
    if (isProvider) {
      providerUserId = Number(req.user.id);
    } else if (!(await requirePayrollAccess(req, res, agencyId))) {
      return;
    }
    if (!providerUserId) {
      return res.status(400).json({ error: { message: 'providerUserId is required' } });
    }

    const includeTerminated = String(req.query?.includeTerminated || '') === '1' ||
      String(req.query?.includeTerminated || '').toLowerCase() === 'true';

    const [rows] = await pool.execute(
      `SELECT c.id, c.full_name, c.initials, c.identifier_code, c.client_type, c.status, c.submission_date,
              c.organization_id, c.provider_id, c.termination_reason, c.terminated_at,
              cs.status_key AS client_status_key, cs.label AS client_status_label,
              MAX(be.service_date) AS last_billing_session
       FROM billing_encounters be
       JOIN clients c ON c.id = be.client_id
       LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
       WHERE be.agency_id = ?
         AND be.provider_user_id = ?
         AND c.status <> 'ARCHIVED'
       GROUP BY c.id, c.full_name, c.initials, c.identifier_code, c.client_type, c.status, c.submission_date,
                c.organization_id, c.provider_id, c.termination_reason, c.terminated_at,
                cs.status_key, cs.label
       ORDER BY c.full_name ASC, c.id ASC`,
      [agencyId, providerUserId]
    );

    let clients = rows || [];
    if (!includeTerminated) {
      clients = clients.filter((c) => String(c.client_status_key || '').toLowerCase() !== 'terminated');
    }
    res.json({ clients });
  } catch (e) {
    next(e);
  }
};

export const revertBillingReportUploadHandler = async (req, res, next) => {
  try {
    const uploadId = parseInt(req.params.id, 10);
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : null;
    if (!uploadId || !agencyId) {
      return res.status(400).json({ error: { message: 'id and agencyId are required' } });
    }
    if (!(await requirePayrollAccess(req, res, agencyId))) return;

    const result = await revertBillingReportUpload({
      agencyId,
      uploadId,
      actingUserId: req.user?.id || null,
      deleteOrphanClients: req.body?.deleteOrphanClients !== false
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const runBillingAutoTerminate = async (req, res, next) => {
  try {
    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requirePayrollAccess(req, res, agencyId))) return;
    const result = await autoTerminateInactiveBillingClients({
      agencyId,
      actingUserId: req.user?.id || null,
      days: req.body?.days ? parseInt(req.body.days, 10) : 60
    });
    res.json({ ok: true, ...result, asOf: formatYmd(new Date()) });
  } catch (e) {
    next(e);
  }
};

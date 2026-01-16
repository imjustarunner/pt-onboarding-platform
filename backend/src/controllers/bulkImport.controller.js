/**
 * Bulk Import Controller
 * 
 * Handles bulk import of clients from CSV files with smart matching and deduplication
 */

import multer from 'multer';
import { parse } from 'csv-parse/sync';
import CSVParserService from '../services/csvParser.service.js';
import ClientMatchingService from '../services/clientMatching.service.js';
import BulkClientOneTimeImportService from '../services/bulkClientOneTimeImport.service.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';

// Configure multer for CSV uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV files are allowed.'), false);
    }
  }
});

/**
 * Bulk import clients from CSV
 * POST /api/bulk-import/clients
 */
export const bulkImportClients = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          error: { message: 'No CSV file uploaded' } 
        });
      }

      const userId = req.user.id;
      const userRole = req.user.role;

      // Permission check: Only admin or super_admin can bulk import
      if (!['super_admin', 'admin'].includes(userRole)) {
        return res.status(403).json({ 
          error: { message: 'Only admins can perform bulk imports' } 
        });
      }

      const updateExisting = req.body.updateExisting === 'true' || req.body.updateExisting === true;

      // Get user's primary agency ID
      let agencyId = req.body.agency_id || req.user.agencyId;
      
      if (!agencyId && userRole !== 'super_admin') {
        // Get user's first agency
        const userAgencies = await User.getAgencies(userId);
        if (userAgencies.length === 0) {
          return res.status(400).json({ 
            error: { message: 'You must be associated with an agency to import clients' } 
          });
        }
        agencyId = userAgencies[0].id;
      }

      if (!agencyId) {
        return res.status(400).json({ 
          error: { message: 'Agency ID is required for bulk import' } 
        });
      }

      // Parse CSV
      const rows = await CSVParserService.parseCSV(req.file.buffer);

      if (rows.length === 0) {
        return res.status(400).json({ 
          error: { message: 'CSV file is empty or contains no valid rows' } 
        });
      }

      // Process bulk import
      const results = await ClientMatchingService.processBulkImport(
        rows,
        agencyId,
        updateExisting,
        userId
      );

      res.json({
        success: true,
        totalRows: rows.length,
        created: results.created,
        updated: results.updated,
        errors: results.errors,
        message: `Import completed: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`
      });
    } catch (error) {
      console.error('Bulk import error:', error);
      
      // Handle CSV parsing errors
      if (error.message.includes('Row') || error.message.includes('CSV')) {
        return res.status(400).json({ 
          error: { message: error.message } 
        });
      }
      
      next(error);
    }
  }
];

function parseCsvRecords(csvBuffer) {
  return parse(csvBuffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true
  });
}

/**
 * One-time bulk import clients/providers/roster from three CSVs
 * POST /api/bulk-import/clients-one-time
 *
 * multipart fields:
 * - agencyId
 * - clientsCsv
 * - providersCsv
 * - rosterCsv
 */
export const bulkImportClientsOneTime = [
  upload.fields([
    { name: 'clientsCsv', maxCount: 1 },
    { name: 'providersCsv', maxCount: 1 },
    { name: 'rosterCsv', maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      // Agency selection is required (UI-driven).
      const agencyIdRaw = req.body.agencyId || req.body.agency_id || req.user.agencyId;
      const agencyId = agencyIdRaw ? parseInt(agencyIdRaw, 10) : null;
      if (!agencyId) {
        return res.status(400).json({ error: { message: 'agencyId is required' } });
      }

      // Ensure the requester can administer this agency unless super_admin.
      if (userRole !== 'super_admin') {
        const agencies = await User.getAgencies(userId);
        const allowed = agencies.some(a => a.id === agencyId);
        if (!allowed) {
          return res.status(403).json({ error: { message: 'You do not have admin access to this agency' } });
        }
      }

      const files = req.files || {};
      const clientsFile = files.clientsCsv?.[0];
      const providersFile = files.providersCsv?.[0];
      const rosterFile = files.rosterCsv?.[0];

      if (!clientsFile || !providersFile || !rosterFile) {
        return res.status(400).json({
          error: { message: 'clientsCsv, providersCsv, and rosterCsv are all required' }
        });
      }

      const clientsRecords = parseCsvRecords(clientsFile.buffer);
      const providersRecords = parseCsvRecords(providersFile.buffer);
      const rosterRecords = parseCsvRecords(rosterFile.buffer);

      const results = await BulkClientOneTimeImportService.runOneTimeImport({
        agencyId,
        uploadedByUserId: userId,
        clientsRecords,
        providersRecords,
        rosterRecords
      });

      res.json({
        success: true,
        jobId: results.jobId,
        totals: results.totals,
        created: results.created,
        updated: results.updated,
        errors: results.errors,
        message: `Import completed: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`
      });
    } catch (error) {
      console.error('One-time bulk import error:', error);
      // Parse/validation errors
      if (String(error.message || '').includes('CSV') || String(error.message || '').includes('headers')) {
        return res.status(400).json({ error: { message: error.message } });
      }
      next(error);
    }
  }
];

/**
 * Preview-only (no DB writes). Creates a PREVIEW job with PENDING/ERROR rows.
 * POST /api/bulk-import/clients-one-time/preview
 */
export const bulkImportClientsOneTimePreview = [
  upload.fields([
    { name: 'clientsCsv', maxCount: 1 },
    { name: 'providersCsv', maxCount: 1 },
    { name: 'rosterCsv', maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      const agencyIdRaw = req.body.agencyId || req.body.agency_id || req.user.agencyId;
      const agencyId = agencyIdRaw ? parseInt(agencyIdRaw, 10) : null;
      if (!agencyId) {
        return res.status(400).json({ error: { message: 'agencyId is required' } });
      }

      if (userRole !== 'super_admin') {
        const agencies = await User.getAgencies(userId);
        const allowed = agencies.some(a => a.id === agencyId);
        if (!allowed) {
          return res.status(403).json({ error: { message: 'You do not have admin access to this agency' } });
        }
      }

      const files = req.files || {};
      const clientsFile = files.clientsCsv?.[0];
      const providersFile = files.providersCsv?.[0];
      const rosterFile = files.rosterCsv?.[0];
      if (!clientsFile || !providersFile || !rosterFile) {
        return res.status(400).json({
          error: { message: 'clientsCsv, providersCsv, and rosterCsv are all required' }
        });
      }

      const clientsRecords = parseCsvRecords(clientsFile.buffer);
      const providersRecords = parseCsvRecords(providersFile.buffer);
      const rosterRecords = parseCsvRecords(rosterFile.buffer);

      const results = await BulkClientOneTimeImportService.createPreviewJob({
        agencyId,
        uploadedByUserId: userId,
        clientsRecords,
        providersRecords,
        rosterRecords
      });

      res.json({
        success: true,
        jobId: results.jobId,
        totals: results.totals,
        pending: results.pending,
        errors: results.errors,
        message: `Preview ready: ${results.pending} pending rows, ${results.errors.length} errors`
      });
    } catch (error) {
      console.error('One-time bulk import preview error:', error);
      if (String(error.message || '').includes('CSV') || String(error.message || '').includes('headers')) {
        return res.status(400).json({ error: { message: error.message } });
      }
      next(error);
    }
  }
];

async function requireAgencyAdminAccessFromJob(req, jobId) {
  const userId = req.user.id;
  const userRole = req.user.role;
  const [jobs] = await pool.execute(`SELECT id, agency_id FROM bulk_import_jobs WHERE id = ? LIMIT 1`, [jobId]);
  if (!jobs.length) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  const agencyId = jobs[0].agency_id;
  if (userRole !== 'super_admin') {
    const agencies = await User.getAgencies(userId);
    const allowed = agencies.some(a => a.id === agencyId);
    if (!allowed) {
      const err = new Error('You do not have admin access to this agency');
      err.status = 403;
      throw err;
    }
  }
  return agencyId;
}

/**
 * List recent preview jobs for an agency (one-time bulk client import).
 * GET /api/bulk-import/jobs/clients-one-time/previews?agencyId=123&limit=20
 */
export const listClientsOneTimePreviewJobs = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    const agencyIdRaw = req.query.agencyId || req.query.agency_id || req.user.agencyId;
    const agencyId = agencyIdRaw ? parseInt(agencyIdRaw, 10) : null;
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    if (userRole !== 'super_admin') {
      const agencies = await User.getAgencies(userId);
      const allowed = agencies.some(a => a.id === agencyId);
      if (!allowed) {
        return res.status(403).json({ error: { message: 'You do not have admin access to this agency' } });
      }
    }

    const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 50);

    const [rows] = await pool.execute(
      `SELECT
         j.id,
         j.agency_id,
         j.uploaded_by_user_id,
         j.kind,
         j.status,
         j.total_clients_rows,
         j.total_providers_rows,
         j.total_roster_rows,
         j.created_count,
         j.updated_count,
         j.error_count,
         j.created_at,
         j.updated_at,
         SUM(CASE WHEN r.sheet = 'clients' AND r.status = 'PENDING' THEN 1 ELSE 0 END) AS pending_clients,
         SUM(CASE WHEN r.sheet = 'clients' AND r.status = 'SUCCESS' THEN 1 ELSE 0 END) AS applied_clients,
         SUM(CASE WHEN r.status = 'ERROR' THEN 1 ELSE 0 END) AS error_rows
       FROM bulk_import_jobs j
       LEFT JOIN bulk_import_job_rows r ON r.job_id = j.id
       WHERE j.agency_id = ?
         AND j.kind = 'CLIENTS_ONE_TIME'
         AND j.status IN ('PREVIEW','APPLYING','COMPLETED','ROLLED_BACK','FAILED')
       GROUP BY j.id
       ORDER BY j.created_at DESC
       LIMIT ?`,
      [agencyId, limit]
    );

    res.json(rows);
  } catch (e) {
    next(e);
  }
};

/**
 * Approve/apply one client row from a preview job.
 * POST /api/bulk-import/jobs/:jobId/rows/:rowId/apply
 */
export const applyBulkImportJobRow = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { jobId, rowId } = req.params;
    await requireAgencyAdminAccessFromJob(req, parseInt(jobId, 10));
    const result = await BulkClientOneTimeImportService.applyJobRow({
      jobId: parseInt(jobId, 10),
      rowId: parseInt(rowId, 10),
      uploadedByUserId: userId
    });
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
};

/**
 * Approve/apply all pending client rows for a preview job.
 * POST /api/bulk-import/jobs/:jobId/apply
 */
export const applyBulkImportJobAll = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    await requireAgencyAdminAccessFromJob(req, parseInt(jobId, 10));
    const result = await BulkClientOneTimeImportService.applyJobAll({
      jobId: parseInt(jobId, 10),
      uploadedByUserId: userId
    });
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
};

/**
 * Roll back an applied preview job (best-effort undo for applied client rows).
 * POST /api/bulk-import/jobs/:jobId/rollback
 */
export const rollbackBulkImportJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    await requireAgencyAdminAccessFromJob(req, parseInt(jobId, 10));
    const result = await BulkClientOneTimeImportService.rollbackJob({
      jobId: parseInt(jobId, 10)
    });
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
};

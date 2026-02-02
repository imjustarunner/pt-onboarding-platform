/**
 * Bulk Import Controller
 * 
 * Handles bulk import of clients from CSV files with smart matching and deduplication
 */

import multer from 'multer';
import pool from '../config/database.js';
import CSVParserService from '../services/csvParser.service.js';
import ClientMatchingService from '../services/clientMatching.service.js';
import BulkClientOneTimeImportService from '../services/bulkClientOneTimeImport.service.js';
import User from '../models/User.model.js';

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

      // Resolve target agency ID:
      // - super_admin must provide agency_id/agencyId explicitly
      // - admin may omit and we’ll default to their first agency
      const rawAgencyId = req.body.agency_id ?? req.body.agencyId ?? req.user.agencyId;
      let agencyId = rawAgencyId ? parseInt(rawAgencyId, 10) : null;

      if (userRole === 'super_admin') {
        if (!agencyId) {
          return res.status(400).json({
            error: { message: 'Agency ID is required for bulk import (super admin must select an agency)' }
          });
        }
      } else {
        const userAgencies = await User.getAgencies(userId);
        if (!agencyId) {
          if (userAgencies.length === 0) {
            return res.status(400).json({
              error: { message: 'You must be associated with an agency to import clients' }
            });
          }
          agencyId = userAgencies[0].id;
        } else {
          const allowed = userAgencies.some((a) => a.id === agencyId);
          if (!allowed) {
            return res.status(403).json({
              error: { message: 'You do not have access to import clients for the selected agency' }
            });
          }
        }
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
          error: {
            message: error.message,
            row: error.rowNumber || null,
            missingFields: error.missingFields || null,
            foundHeaders: error.foundHeaders || null,
            expectedHeaders: error.expectedHeaders || null
          } 
        });
      }
      
      next(error);
    }
  }
];

async function requireAgencyAccessForImport(req, res, agencyId) {
  const userId = req.user?.id;
  const userRole = req.user?.role;
  const aId = agencyId ? parseInt(agencyId, 10) : null;
  if (!aId) {
    res.status(400).json({ error: { message: 'agencyId is required' } });
    return null;
  }
  if (userRole === 'super_admin') return aId;
  const userAgencies = await User.getAgencies(userId);
  const allowed = (userAgencies || []).some((a) => Number(a?.id) === Number(aId));
  if (!allowed) {
    res.status(403).json({ error: { message: 'You do not have access to this agency' } });
    return null;
  }
  return aId;
}

/**
 * List recent preview jobs for one-time client import.
 * GET /api/bulk-import/jobs/clients-one-time/previews?agencyId=123&limit=25
 */
export const listClientsOneTimePreviewJobs = async (req, res, next) => {
  try {
    const agencyId = await requireAgencyAccessForImport(req, res, req.query?.agencyId || req.body?.agencyId);
    if (!agencyId) return;
    const limitRaw = parseInt(req.query?.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(200, limitRaw) : 25;

    // Compute useful counts from job rows (so UI doesn't need to fetch rows).
    const [rows] = await pool.execute(
      `SELECT j.*,
              (SELECT COUNT(*) FROM bulk_import_job_rows r
               WHERE r.job_id = j.id AND r.sheet = 'clients' AND r.status = 'PENDING') AS pending_clients,
              (SELECT COUNT(*) FROM bulk_import_job_rows r
               WHERE r.job_id = j.id AND r.sheet = 'clients' AND r.applied_at IS NOT NULL) AS applied_clients,
              (SELECT COUNT(*) FROM bulk_import_job_rows r
               WHERE r.job_id = j.id AND r.sheet = 'clients' AND r.status = 'ERROR') AS error_rows
       FROM bulk_import_jobs j
       WHERE j.agency_id = ?
         AND j.kind = 'CLIENTS_ONE_TIME'
         AND j.status IN ('PREVIEW','APPLYING','COMPLETED','FAILED','ROLLED_BACK')
       ORDER BY j.created_at DESC
       LIMIT ?`,
      [agencyId, limit]
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

/**
 * Roll back a one-time client import job (best-effort).
 * POST /api/bulk-import/jobs/:jobId/rollback
 */
export const rollbackClientsOneTimeJob = async (req, res, next) => {
  try {
    const jobId = parseInt(req.params.jobId, 10);
    if (!jobId) return res.status(400).json({ error: { message: 'jobId is required' } });

    const [[job]] = await pool.execute(`SELECT agency_id FROM bulk_import_jobs WHERE id = ? LIMIT 1`, [jobId]);
    if (!job) return res.status(404).json({ error: { message: 'Job not found' } });

    const agencyId = await requireAgencyAccessForImport(req, res, job.agency_id);
    if (!agencyId) return;

    const result = await BulkClientOneTimeImportService.rollbackJob({ jobId });
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
};

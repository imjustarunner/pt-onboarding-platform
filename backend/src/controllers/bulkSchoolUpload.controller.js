import multer from 'multer';
import pool from '../config/database.js';
import BulkSchoolUploadParserService from '../services/bulkSchoolUploadParser.service.js';
import { processBulkSchoolUpload } from '../services/bulkSchoolUpload.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB
  }
});

const parseAgencyId = (req) => {
  const raw = req.body.agencyId || req.query.agencyId || req.user?.agencyId;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
};

export const bulkSchoolUpload = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: { message: 'No file uploaded' } });
      }

      const agencyId = parseAgencyId(req);
      if (!agencyId) {
        return res.status(400).json({ error: { message: 'agencyId is required' } });
      }

      let rows = [];
      try {
        rows = await BulkSchoolUploadParserService.parse(req.file.buffer, req.file.originalname, req.file.mimetype);
      } catch (e) {
        // Provide structured metadata for the frontend.
        const row = e?.rowNumber || e?.row || null;
        const missingFields = Array.isArray(e?.missingFields) ? e.missingFields : null;
        const foundHeaders = Array.isArray(e?.foundHeaders) ? e.foundHeaders : null;
        const expectedHeaders = Array.isArray(e?.expectedHeaders) ? e.expectedHeaders : null;
        return res.status(400).json({
          error: {
            message: e?.message || 'Invalid file format',
            row,
            missingFields,
            foundHeaders,
            expectedHeaders
          }
        });
      }

      if (!rows.length) {
        return res.status(400).json({ error: { message: 'File contained no rows' } });
      }

      const result = await processBulkSchoolUpload({
        agencyId,
        userId: req.user.id,
        fileName: req.file.originalname,
        rows
      });

      res.json({ success: true, ...result });
    } catch (e) {
      next(e);
    }
  }
];

export const listBulkSchoolUploadJobs = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const [rows] = await pool.execute(
      `SELECT * FROM bulk_import_jobs
       WHERE agency_id = ? AND job_type = 'bulk_school_upload'
       ORDER BY created_at DESC
       LIMIT 50`,
      [agencyId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const getBulkSchoolUploadJob = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const id = parseInt(req.params.jobId, 10);
    if (!id) return res.status(400).json({ error: { message: 'jobId is required' } });

    const [rows] = await pool.execute(
      `SELECT * FROM bulk_import_jobs
       WHERE id = ? AND agency_id = ? AND job_type = 'bulk_school_upload'
       LIMIT 1`,
      [id, agencyId]
    );
    if (!rows[0]) return res.status(404).json({ error: { message: 'Job not found' } });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
};

export const listBulkSchoolUploadJobRows = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const id = parseInt(req.params.jobId, 10);
    if (!id) return res.status(400).json({ error: { message: 'jobId is required' } });

    const [jobRows] = await pool.execute(
      `SELECT id FROM bulk_import_jobs
       WHERE id = ? AND agency_id = ? AND job_type = 'bulk_school_upload'
       LIMIT 1`,
      [id, agencyId]
    );
    if (!jobRows[0]) return res.status(404).json({ error: { message: 'Job not found' } });

    const [rows] = await pool.execute(
      `SELECT * FROM bulk_import_job_rows WHERE job_id = ? ORDER BY \`row_number\` ASC`,
      [id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};


import multer from 'multer';
import pool from '../config/database.js';
import BulkClientUploadParserService from '../services/bulkClientUploadParser.service.js';
import { processBulkClientUpload, undoBulkClientUploadJob } from '../services/bulkClientUpload.service.js';

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

export const bulkClientUpload = [
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

      const rows = await BulkClientUploadParserService.parse(req.file.buffer, req.file.originalname, req.file.mimetype);
      if (!rows.length) {
        return res.status(400).json({ error: { message: 'File contained no rows' } });
      }

      const result = await processBulkClientUpload({
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

export const listBulkClientUploadJobs = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const [rows] = await pool.execute(
      `SELECT * FROM bulk_import_jobs WHERE agency_id = ? ORDER BY created_at DESC LIMIT 50`,
      [agencyId]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const getBulkClientUploadJob = async (req, res, next) => {
  try {
    const id = parseInt(req.params.jobId, 10);
    if (!id) return res.status(400).json({ error: { message: 'jobId is required' } });

    const [rows] = await pool.execute(`SELECT * FROM bulk_import_jobs WHERE id = ? LIMIT 1`, [id]);
    if (!rows[0]) return res.status(404).json({ error: { message: 'Job not found' } });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
};

export const listBulkClientUploadJobRows = async (req, res, next) => {
  try {
    const id = parseInt(req.params.jobId, 10);
    if (!id) return res.status(400).json({ error: { message: 'jobId is required' } });

    const [rows] = await pool.execute(
      `SELECT * FROM bulk_import_job_rows WHERE job_id = ? ORDER BY \`row_number\` ASC`,
      [id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

export const undoBulkClientUpload = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    const jobId = parseInt(req.params.jobId, 10);
    if (!jobId) return res.status(400).json({ error: { message: 'jobId is required' } });

    // Safety: default to dry run unless explicitly confirmed
    const confirm = String(req.query.confirm || '').toLowerCase() === 'true';
    const dryRun = !confirm;

    const result = await undoBulkClientUploadJob({
      agencyId,
      jobId,
      requestingUserId: req.user?.id,
      dryRun
    });

    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
};

import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { importMboxToPersonalInbox } from '../services/mboxImport.service.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(os.tmpdir(), 'pthq-mbox-import');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const safe = String(file.originalname || 'mail.mbox')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .slice(0, 120);
      cb(null, `${Date.now()}-${safe}`);
    }
  }),
  limits: { fileSize: 750 * 1024 * 1024 }, // 750MB — Takeout mboxes can be large
  fileFilter: (_req, file, cb) => {
    const name = String(file?.originalname || '').toLowerCase();
    if (name.endsWith('.mbox') || name.endsWith('.mbox.txt') || file.mimetype === 'application/mbox' || file.mimetype === 'text/plain' || file.mimetype === 'application/octet-stream') {
      return cb(null, true);
    }
    cb(new Error('Invalid file type. Upload a Google Takeout .mbox file.'), false);
  }
});

function cleanup(filePath) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}

export const mboxUploadMiddleware = upload.single('file');

/**
 * POST /api/admin/mbox-import
 * multipart: file, agencyId, userId, dryRun?, skipSpamTrash?
 */
export async function importMbox(req, res) {
  const tmpPath = req.file?.path || null;
  try {
    const agencyId = Number(req.body?.agencyId);
    const userId = Number(req.body?.userId);
    const dryRun = String(req.body?.dryRun || '').toLowerCase() === 'true' || req.body?.dryRun === '1' || req.body?.dryRun === true;
    const skipSpamTrash =
      req.body?.skipSpamTrash === undefined ||
      req.body?.skipSpamTrash === null ||
      req.body?.skipSpamTrash === ''
        ? true
        : !['0', 'false', 'no'].includes(String(req.body.skipSpamTrash).toLowerCase());

    if (!agencyId || !userId) {
      cleanup(tmpPath);
      return res.status(400).json({ error: { message: 'agencyId and userId are required' } });
    }
    if (!tmpPath) {
      return res.status(400).json({ error: { message: 'mbox file is required (field name: file)' } });
    }

    const result = await importMboxToPersonalInbox({
      agencyId,
      userId,
      filePath: tmpPath,
      dryRun,
      skipSpamTrash
    });

    cleanup(tmpPath);
    return res.json({ success: true, result });
  } catch (err) {
    cleanup(tmpPath);
    console.error('[mbox-import]', err);
    return res.status(500).json({
      error: { message: err.message || 'Mbox import failed' }
    });
  }
}

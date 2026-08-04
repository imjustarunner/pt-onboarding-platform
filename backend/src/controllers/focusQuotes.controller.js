import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.resolve(__dirname, '../../..');
const FOCUS_ASSET_DIRS = [
  path.join(MONOREPO_ROOT, 'assets', 'Focus'),
  path.join(MONOREPO_ROOT, 'assets', 'focus'),
  path.join(MONOREPO_ROOT, 'backend', 'uploads', 'focus-quotes')
];

function packageEnabled(req) {
  const flags = req.agencyFeatureFlags || req.user?.agencyFeatureFlags || {};
  if (flags.focusPackageEnabled === false) return false;
  if (flags.focusMusicEnabled === false && flags.focusPackageEnabled == null) return false;
  return true;
}

async function resolveLocalPath(storagePath) {
  const rel = String(storagePath || '').replace(/^\/+/, '');
  const candidates = [
    path.join(MONOREPO_ROOT, 'assets', rel),
    path.join(MONOREPO_ROOT, rel),
    path.join(MONOREPO_ROOT, 'backend', rel)
  ];
  for (const dir of FOCUS_ASSET_DIRS) {
    candidates.push(path.join(dir, path.basename(rel)));
  }
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch { /* continue */ }
  }
  return null;
}

export const listQuotes = async (req, res, next) => {
  try {
    if (!packageEnabled(req)) {
      return res.status(403).json({ error: { message: 'Focus Package not enabled' } });
    }
    const userId = req.user.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const [rows] = await pool.execute(
      `SELECT q.*
       FROM focus_quote_images q
       LEFT JOIN user_focus_quote_hidden h
         ON h.focus_quote_image_id = q.id AND h.user_id = ?
       WHERE q.is_active = 1
         AND h.id IS NULL
         AND (
           q.scope = 'platform'
           OR (q.scope = 'agency' AND q.agency_id = ?)
           OR (q.scope = 'user' AND q.user_id = ?)
         )
       ORDER BY q.scope ASC, q.id ASC`,
      [userId, agencyId || 0, userId]
    );
    res.json((rows || []).map((r) => ({
      id: r.id,
      scope: r.scope,
      agency_id: r.agency_id,
      title: r.title,
      quote_text: r.quote_text,
      attribution: r.attribution,
      imageUrl: `/api/focus-quotes/${r.id}/image`
    })));
  } catch (err) {
    next(err);
  }
};

export const randomQuote = async (req, res, next) => {
  try {
    req.query = { ...req.query };
    // reuse list then pick
    const userId = req.user.id;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const [rows] = await pool.execute(
      `SELECT q.id
       FROM focus_quote_images q
       LEFT JOIN user_focus_quote_hidden h
         ON h.focus_quote_image_id = q.id AND h.user_id = ?
       WHERE q.is_active = 1 AND h.id IS NULL
         AND (
           q.scope = 'platform'
           OR (q.scope = 'agency' AND q.agency_id = ?)
           OR (q.scope = 'user' AND q.user_id = ?)
         )`,
      [userId, agencyId || 0, userId]
    );
    if (!rows?.length) return res.json(null);
    const pick = rows[Math.floor(Math.random() * rows.length)];
    const [full] = await pool.execute('SELECT * FROM focus_quote_images WHERE id = ?', [pick.id]);
    const r = full[0];
    res.json({
      id: r.id,
      scope: r.scope,
      title: r.title,
      quote_text: r.quote_text,
      attribution: r.attribution,
      imageUrl: `/api/focus-quotes/${r.id}/image`
    });
  } catch (err) {
    next(err);
  }
};

export const streamQuoteImage = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [rows] = await pool.execute('SELECT * FROM focus_quote_images WHERE id = ? AND is_active = 1', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: { message: 'Not found' } });
    const filePath = await resolveLocalPath(row.storage_path);
    if (!filePath) {
      // SVG placeholder when asset missing
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#166534"/><stop offset="100%" stop-color="#0f172a"/>
        </linearGradient></defs>
        <rect width="1200" height="800" fill="url(#g)"/>
        <text x="60" y="380" fill="#f8fafc" font-size="42" font-family="Georgia, serif">${String(row.quote_text || 'Focus').replace(/[<>&]/g, '')}</text>
      </svg>`;
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(svg);
    }
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
};

export const hideQuote = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const id = parseInt(req.params.id, 10);
    await pool.execute(
      `INSERT IGNORE INTO user_focus_quote_hidden (user_id, focus_quote_image_id) VALUES (?, ?)`,
      [userId, id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const unhideQuote = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const id = parseInt(req.params.id, 10);
    await pool.execute(
      `DELETE FROM user_focus_quote_hidden WHERE user_id = ? AND focus_quote_image_id = ?`,
      [userId, id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const uploadQuote = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = String(req.user.role || '').toLowerCase();
    const { scope = 'user', agencyId, title, quoteText, attribution, storagePath } = req.body || {};
    let resolvedScope = scope;
    if (resolvedScope === 'platform' && role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Superadmin required for platform quotes' } });
    }
    if (resolvedScope === 'agency' && !['admin', 'super_admin', 'support'].includes(role)) {
      return res.status(403).json({ error: { message: 'Admin required for agency quotes' } });
    }
    const pathVal = String(storagePath || req.file?.filename || '').trim();
    if (!pathVal && !req.file) {
      return res.status(400).json({ error: { message: 'storagePath or file required' } });
    }
    let stored = pathVal;
    if (req.file) {
      const uploadDir = path.join(MONOREPO_ROOT, 'backend', 'uploads', 'focus-quotes');
      await fs.mkdir(uploadDir, { recursive: true });
      stored = path.join('uploads/focus-quotes', req.file.filename || `quote-${Date.now()}.png`);
      if (req.file.path) {
        // multer already wrote file
        stored = path.relative(MONOREPO_ROOT, req.file.path).replace(/\\/g, '/');
      } else if (req.file.buffer) {
        const name = `quote-${userId}-${Date.now()}.png`;
        await fs.writeFile(path.join(uploadDir, name), req.file.buffer);
        stored = `uploads/focus-quotes/${name}`;
      }
    }
    const [result] = await pool.execute(
      `INSERT INTO focus_quote_images
        (scope, agency_id, user_id, storage_path, title, quote_text, attribution, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resolvedScope,
        resolvedScope === 'agency' ? parseInt(agencyId, 10) || null : null,
        resolvedScope === 'user' ? userId : null,
        stored,
        title || null,
        quoteText || null,
        attribution || null,
        userId
      ]
    );
    res.status(201).json({ id: result.insertId, imageUrl: `/api/focus-quotes/${result.insertId}/image` });
  } catch (err) {
    next(err);
  }
};

export const deleteQuote = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = String(req.user.role || '').toLowerCase();
    const id = parseInt(req.params.id, 10);
    const [rows] = await pool.execute('SELECT * FROM focus_quote_images WHERE id = ?', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: { message: 'Not found' } });
    if (row.scope === 'platform' && role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Superadmin required' } });
    }
    if (row.scope === 'agency' && !['admin', 'super_admin', 'support'].includes(role)) {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    if (row.scope === 'user' && Number(row.user_id) !== Number(userId) && role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Forbidden' } });
    }
    const deleteForAll = !!req.query.forAll || !!req.body?.forAll;
    if (deleteForAll || row.scope === 'user') {
      await pool.execute('DELETE FROM focus_quote_images WHERE id = ?', [id]);
    } else {
      await pool.execute('UPDATE focus_quote_images SET is_active = 0 WHERE id = ?', [id]);
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

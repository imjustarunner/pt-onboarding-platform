/**
 * Office room photo gallery — list / upload / delete / set-primary.
 * Upload/delete gated to super_admin, admin, support.
 */
import multer from 'multer';
import path from 'path';
import pool from '../config/database.js';
import StorageService from '../services/storage.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

const canManageRoomPhotos = (role) => {
  const r = String(role || '').toLowerCase();
  return ['super_admin', 'superadmin', 'admin', 'support'].includes(r);
};

export const roomPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (allowed.includes(String(file.mimetype || '').toLowerCase())) cb(null, true);
    else cb(new Error('Only PNG, JPEG, GIF, and WebP images are allowed.'), false);
  }
});

const photoToApi = (row) => ({
  id: Number(row.id),
  roomId: Number(row.room_id),
  filePath: row.file_path,
  url: publicUploadsUrlFromStoredPath(row.file_path),
  caption: row.caption || null,
  sortOrder: Number(row.sort_order || 0),
  isPrimary: !!row.is_primary,
  createdAt: row.created_at
});

async function assertRoomExists(officeId, roomId) {
  const [rows] = await pool.execute(
    `SELECT r.id, r.location_id, r.photo_url
     FROM office_rooms r
     WHERE r.id = ? AND r.location_id = ?
     LIMIT 1`,
    [roomId, officeId]
  );
  return rows?.[0] || null;
}

async function syncLegacyPhotoUrl(roomId) {
  const [rows] = await pool.execute(
    `SELECT file_path FROM office_room_photos
     WHERE room_id = ? AND is_active = 1
     ORDER BY is_primary DESC, sort_order ASC, id ASC
     LIMIT 1`,
    [roomId]
  );
  const pathVal = rows?.[0]?.file_path || null;
  await pool.execute('UPDATE office_rooms SET photo_url = ? WHERE id = ?', [pathVal, roomId]);
}

/**
 * GET /api/offices/:officeId/rooms/:roomId/photos
 * Any authenticated user can view.
 */
export const listRoomPhotos = async (req, res, next) => {
  try {
    const officeId = toInt(req.params.officeId);
    const roomId = toInt(req.params.roomId);
    if (!officeId || !roomId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    const room = await assertRoomExists(officeId, roomId);
    if (!room) return res.status(404).json({ error: { message: 'Room not found' } });

    const [rows] = await pool.execute(
      `SELECT * FROM office_room_photos
       WHERE room_id = ? AND is_active = 1
       ORDER BY is_primary DESC, sort_order ASC, id ASC`,
      [roomId]
    );
    return res.json({
      photos: (rows || []).map(photoToApi),
      canManage: canManageRoomPhotos(req.user?.role)
    });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/offices/:officeId/rooms/:roomId/photos  (multipart: file|photo=<image>)
 */
export const uploadRoomPhoto = async (req, res, next) => {
  try {
    if (!canManageRoomPhotos(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const officeId = toInt(req.params.officeId);
    const roomId = toInt(req.params.roomId);
    if (!officeId || !roomId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    const room = await assertRoomExists(officeId, roomId);
    if (!room) return res.status(404).json({ error: { message: 'Room not found' } });
    if (!req.file) return res.status(400).json({ error: { message: 'No file provided' } });

    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
    const filename = `room-photo-${Date.now()}${safeExt}`;
    const storageResult = await StorageService.saveOfficeRoomPhoto(
      roomId,
      req.file.buffer,
      filename,
      req.file.mimetype
    );
    const storedPath = storageResult.relativePath;
    const caption = req.body?.caption ? String(req.body.caption).trim().slice(0, 512) : null;

    const [existing] = await pool.execute(
      'SELECT COUNT(*) AS c FROM office_room_photos WHERE room_id = ? AND is_active = 1',
      [roomId]
    );
    const isFirst = Number(existing?.[0]?.c || 0) === 0;

    const [result] = await pool.execute(
      `INSERT INTO office_room_photos
         (room_id, file_path, caption, sort_order, is_primary, is_active, created_by_user_id)
       VALUES (?, ?, ?, 0, ?, 1, ?)`,
      [roomId, storedPath, caption, isFirst ? 1 : 0, req.user.id]
    );
    if (isFirst) {
      await pool.execute('UPDATE office_rooms SET photo_url = ? WHERE id = ?', [storedPath, roomId]);
    }
    const [rows] = await pool.execute('SELECT * FROM office_room_photos WHERE id = ?', [result.insertId]);
    return res.status(201).json({ photo: photoToApi(rows[0]) });
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /api/offices/:officeId/rooms/:roomId/photos/:photoId/set-primary
 */
export const setPrimaryRoomPhoto = async (req, res, next) => {
  try {
    if (!canManageRoomPhotos(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const officeId = toInt(req.params.officeId);
    const roomId = toInt(req.params.roomId);
    const photoId = toInt(req.params.photoId);
    if (!officeId || !roomId || !photoId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    const room = await assertRoomExists(officeId, roomId);
    if (!room) return res.status(404).json({ error: { message: 'Room not found' } });

    const [rows] = await pool.execute(
      'SELECT * FROM office_room_photos WHERE id = ? AND room_id = ? AND is_active = 1',
      [photoId, roomId]
    );
    if (!rows?.length) return res.status(404).json({ error: { message: 'Photo not found' } });

    await pool.execute('UPDATE office_room_photos SET is_primary = 0 WHERE room_id = ?', [roomId]);
    await pool.execute('UPDATE office_room_photos SET is_primary = 1 WHERE id = ?', [photoId]);
    await pool.execute('UPDATE office_rooms SET photo_url = ? WHERE id = ?', [rows[0].file_path, roomId]);
    return res.json({ ok: true, photoUrl: publicUploadsUrlFromStoredPath(rows[0].file_path) });
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /api/offices/:officeId/rooms/:roomId/photos/:photoId
 */
export const deleteRoomPhoto = async (req, res, next) => {
  try {
    if (!canManageRoomPhotos(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    const officeId = toInt(req.params.officeId);
    const roomId = toInt(req.params.roomId);
    const photoId = toInt(req.params.photoId);
    if (!officeId || !roomId || !photoId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    const room = await assertRoomExists(officeId, roomId);
    if (!room) return res.status(404).json({ error: { message: 'Room not found' } });

    const [rows] = await pool.execute(
      'SELECT * FROM office_room_photos WHERE id = ? AND room_id = ?',
      [photoId, roomId]
    );
    if (!rows?.length) return res.status(404).json({ error: { message: 'Photo not found' } });

    await pool.execute('UPDATE office_room_photos SET is_active = 0, is_primary = 0 WHERE id = ?', [photoId]);
    await syncLegacyPhotoUrl(roomId);
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

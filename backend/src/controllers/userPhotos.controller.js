/**
 * User Photo Album controller
 * Handles uploading, listing, deleting, and moderating user photos.
 * Profile photo designation is stored both in users.profile_photo_path and user_photos.is_profile.
 */
import multer from 'multer';
import path from 'path';
import pool from '../config/database.js';
import StorageService from '../services/storage.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { canUserManageClub } from '../utils/sscClubAccess.js';

const toInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (allowed.includes(String(file.mimetype || '').toLowerCase())) cb(null, true);
    else cb(new Error('Only PNG, JPEG, GIF, and WebP images are allowed.'), false);
  }
});

/** Roles that can moderate (flag/remove) any user's photos within a club context. */
const canModerate = (role) => {
  const r = String(role || '').toLowerCase();
  return ['super_admin', 'admin', 'support', 'staff', 'provider_plus'].includes(r);
};

/** Club managers may moderate photos for members in seasons they manage (same club as learning_program_classes.organization_id). */
const canClubManagerModerateTargetUser = async (req, targetUserId) => {
  const tid = toInt(targetUserId);
  if (!tid) return false;
  const [rows] = await pool.execute(
    `SELECT DISTINCT lpc.organization_id
     FROM learning_class_provider_memberships m
     INNER JOIN learning_program_classes lpc ON lpc.id = m.learning_class_id
     WHERE m.provider_user_id = ?
       AND m.membership_status IN ('active','completed')
       AND lpc.organization_id IS NOT NULL`,
    [tid]
  );
  for (const r of rows || []) {
    const cid = Number(r.organization_id);
    if (cid && (await canUserManageClub({ user: req.user, clubId: cid }))) return true;
  }
  return false;
};

const canModeratePhotos = async (req, { targetUserId = null, agencyId = null } = {}) => {
  if (canModerate(req.user?.role)) return true;
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'club_manager') return false;
  const aid = toInt(agencyId);
  if (aid && (await canUserManageClub({ user: req.user, clubId: aid }))) return true;
  if (targetUserId != null) return canClubManagerModerateTargetUser(req, targetUserId);
  return false;
};

const photoToApi = (row) => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  filePath: row.file_path,
  url: publicUploadsUrlFromStoredPath(row.file_path),
  caption: row.caption || null,
  isProfile: !!row.is_profile,
  source: row.source,
  sourceRefId: row.source_ref_id || null,
  isFlagged: !!row.is_flagged,
  flaggedReason: row.flagged_reason || null,
  flaggedAt: row.flagged_at || null,
  createdAt: row.created_at
});

/**
 * GET /api/users/:id/photos
 * Returns all active photos for a user.
 * Own photos: always visible. Other users' photos: only to managers or club members.
 */
export const listUserPhotos = async (req, res, next) => {
  try {
    const userId = toInt(req.params.id);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const isSelf = Number(req.user.id) === userId;
    const isMod = canModerate(req.user.role);
    if (!isSelf && !isMod) {
      // Challenge participants may view each other's photos within the same club
      const [shared] = await pool.execute(
        `SELECT 1 FROM learning_class_provider_memberships m1
         INNER JOIN learning_class_provider_memberships m2
           ON m2.learning_class_id = m1.learning_class_id
           AND m2.provider_user_id = ?
         WHERE m1.provider_user_id = ?
           AND m1.membership_status IN ('active','completed')
         LIMIT 1`,
        [userId, req.user.id]
      );
      if (!shared?.length) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const includeHidden = isMod;
    const [rows] = await pool.execute(
      `SELECT * FROM user_photos
       WHERE user_id = ? ${includeHidden ? '' : 'AND is_active = 1'}
       ORDER BY is_profile DESC, created_at DESC`,
      [userId]
    );
    return res.json({ photos: (rows || []).map(photoToApi) });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/users/:id/photos  (multipart: file=<image>, caption=<string>)
 * Upload a new photo to the album.
 */
export const uploadUserPhoto = async (req, res, next) => {
  try {
    const userId = toInt(req.params.id);
    if (!userId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    const isSelf = Number(req.user.id) === userId;
    const isMod = canModerate(req.user.role);
    if (!isSelf && !isMod) return res.status(403).json({ error: { message: 'Access denied' } });

    if (!req.file) return res.status(400).json({ error: { message: 'No file provided' } });

    const ext = path.extname(req.file.originalname || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
    const filename = `photo-${Date.now()}${safeExt}`;

    const storageResult = await StorageService.saveUserAlbumPhoto(userId, req.file.buffer, filename, req.file.mimetype);
    const storedPath = storageResult.relativePath;
    const caption = req.body?.caption ? String(req.body.caption).trim().slice(0, 512) : null;

    const [result] = await pool.execute(
      `INSERT INTO user_photos (user_id, file_path, caption, is_profile, source) VALUES (?, ?, ?, 0, 'direct_upload')`,
      [userId, storedPath, caption]
    );
    const [rows] = await pool.execute('SELECT * FROM user_photos WHERE id = ?', [result.insertId]);
    return res.status(201).json({ photo: photoToApi(rows[0]) });
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /api/users/:id/photos/:photoId/set-profile
 * Set this photo as the user's profile (avatar) photo.
 */
export const setProfilePhoto = async (req, res, next) => {
  try {
    const userId = toInt(req.params.id);
    const photoId = toInt(req.params.photoId);
    if (!userId || !photoId) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const isSelf = Number(req.user.id) === userId;
    const isMod = canModerate(req.user.role);
    if (!isSelf && !isMod) return res.status(403).json({ error: { message: 'Access denied' } });

    const [photoRows] = await pool.execute(
      'SELECT * FROM user_photos WHERE id = ? AND user_id = ? AND is_active = 1',
      [photoId, userId]
    );
    if (!photoRows?.length) return res.status(404).json({ error: { message: 'Photo not found' } });

    const photo = photoRows[0];

    // Demote all other profile photos
    await pool.execute('UPDATE user_photos SET is_profile = 0 WHERE user_id = ?', [userId]);
    await pool.execute('UPDATE user_photos SET is_profile = 1 WHERE id = ?', [photoId]);
    // Sync profile_photo_path on users table so avatars appear everywhere
    await pool.execute('UPDATE users SET profile_photo_path = ? WHERE id = ?', [photo.file_path, userId]);

    return res.json({ ok: true, profilePhotoUrl: publicUploadsUrlFromStoredPath(photo.file_path) });
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /api/users/:id/photos/:photoId
 * Soft-delete a photo. Owner or moderator.
 */
export const deleteUserPhoto = async (req, res, next) => {
  try {
    const userId = toInt(req.params.id);
    const photoId = toInt(req.params.photoId);
    if (!userId || !photoId) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const isSelf = Number(req.user.id) === userId;
    const isMod = canModerate(req.user.role);
    if (!isSelf && !isMod) return res.status(403).json({ error: { message: 'Access denied' } });

    const [rows] = await pool.execute(
      'SELECT * FROM user_photos WHERE id = ? AND user_id = ?',
      [photoId, userId]
    );
    if (!rows?.length) return res.status(404).json({ error: { message: 'Photo not found' } });

    const photo = rows[0];
    await pool.execute('UPDATE user_photos SET is_active = 0 WHERE id = ?', [photoId]);

    // If this was the profile photo, clear it from users table
    if (photo.is_profile) {
      await pool.execute(
        'UPDATE users SET profile_photo_path = NULL WHERE id = ? AND profile_photo_path = ?',
        [userId, photo.file_path]
      );
      // Promote the most recent remaining active photo, if any
      const [remaining] = await pool.execute(
        'SELECT file_path FROM user_photos WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1',
        [userId]
      );
      if (remaining?.length) {
        await pool.execute('UPDATE user_photos SET is_profile = 1 WHERE user_id = ? AND file_path = ?', [userId, remaining[0].file_path]);
        await pool.execute('UPDATE users SET profile_photo_path = ? WHERE id = ?', [remaining[0].file_path, userId]);
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/users/:id/photos/:photoId/flag
 * Flag a photo for moderation. Manager/staff/provider_plus only.
 */
export const flagUserPhoto = async (req, res, next) => {
  try {
    const userId = toInt(req.params.id);
    const photoId = toInt(req.params.photoId);
    if (!userId || !photoId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (!(await canModeratePhotos(req, { targetUserId: userId }))) {
      return res.status(403).json({ error: { message: 'Moderator access required' } });
    }

    const reason = req.body?.reason ? String(req.body.reason).trim().slice(0, 512) : null;
    await pool.execute(
      'UPDATE user_photos SET is_flagged = 1, flagged_by = ?, flagged_reason = ?, flagged_at = NOW() WHERE id = ? AND user_id = ?',
      [req.user.id, reason, photoId, userId]
    );
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /api/users/:id/photos/:photoId/flag
 * Unflag a photo (manager only). Clears is_flagged without deactivating.
 */
export const unflagUserPhoto = async (req, res, next) => {
  try {
    const userId = toInt(req.params.id);
    const photoId = toInt(req.params.photoId);
    if (!userId || !photoId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (!(await canModeratePhotos(req, { targetUserId: userId }))) {
      return res.status(403).json({ error: { message: 'Moderator access required' } });
    }

    await pool.execute(
      'UPDATE user_photos SET is_flagged = 0, flagged_reason = NULL, flagged_at = NULL, flagged_by = NULL WHERE id = ? AND user_id = ?',
      [photoId, userId]
    );
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /api/users/:id/photos/:photoId/moderate
 * Hard-remove a photo (moderator: deactivate + clear profile if needed). Manager only.
 */
export const moderateRemovePhoto = async (req, res, next) => {
  try {
    const userId = toInt(req.params.id);
    const photoId = toInt(req.params.photoId);
    if (!userId || !photoId) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (!(await canModeratePhotos(req, { targetUserId: userId }))) {
      return res.status(403).json({ error: { message: 'Moderator access required' } });
    }

    const [rows] = await pool.execute('SELECT * FROM user_photos WHERE id = ? AND user_id = ?', [photoId, userId]);
    if (!rows?.length) return res.status(404).json({ error: { message: 'Photo not found' } });

    const photo = rows[0];
    await pool.execute('UPDATE user_photos SET is_active = 0, is_flagged = 1 WHERE id = ?', [photoId]);

    if (photo.is_profile) {
      await pool.execute('UPDATE users SET profile_photo_path = NULL WHERE id = ? AND profile_photo_path = ?', [userId, photo.file_path]);
    }
    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/users/photos/flagged?agencyId=<id>
 * List all flagged photos across users in a club. Managers only.
 */
export const listFlaggedPhotos = async (req, res, next) => {
  try {
    const agencyId = toInt(req.query.agencyId);
    if (!(await canModeratePhotos(req, { agencyId }))) {
      return res.status(403).json({ error: { message: 'Moderator access required' } });
    }

    let sql = `
      SELECT p.*, u.first_name, u.last_name
      FROM user_photos p
      INNER JOIN users u ON u.id = p.user_id
      WHERE p.is_flagged = 1 AND p.is_active = 1
    `;
    const params = [];
    if (agencyId) {
      // Scope to users who are members of a class in this agency
      sql += ` AND EXISTS (
        SELECT 1 FROM learning_class_provider_memberships m
        INNER JOIN learning_program_classes lpc ON lpc.id = m.learning_class_id
        WHERE lpc.organization_id = ? AND m.provider_user_id = p.user_id
      )`;
      params.push(agencyId);
    }
    sql += ' ORDER BY p.flagged_at DESC LIMIT 100';

    const [rows] = await pool.execute(sql, params);
    return res.json({
      flagged: (rows || []).map((r) => ({
        ...photoToApi(r),
        userFirstName: r.first_name,
        userLastName: r.last_name
      }))
    });
  } catch (e) {
    next(e);
  }
};

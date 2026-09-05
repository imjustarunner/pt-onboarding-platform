import multer from 'multer';
import path from 'path';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import StorageService from '../services/storage.service.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024 // 8MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only PNG, JPEG, GIF, and WebP are allowed.'), false);
  }
});

export { upload };

const canEditTargetUserPhoto = (req, targetUserId) => {
  const requesterRole = String(req.user?.role || '').toLowerCase();
  const tId = parseInt(targetUserId || 0, 10);
  if (!tId) return false;
  // Backoffice admins can always manage profile photos.
  if (['admin', 'super_admin', 'support', 'staff', 'provider_plus'].includes(requesterRole)) return true;
  // Users may upload their own profile photo (self-service, used for SSC).
  if (Number(req.user?.id) === tId) return true;
  return false;
};

/**
 * Upload a user profile photo.
 * POST /api/users/:id/profile-photo
 * FormData: photo=<file>
 * Self-service is allowed: any authenticated user can upload for themselves.
 * Managers/admins can upload for any user.
 */
export const uploadUserProfilePhoto = async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    if (!canEditTargetUserPhoto(req, targetUserId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    if (!req.file) {
      return res.status(400).json({ error: { message: 'No file uploaded. Please select an image file.' } });
    }

    const fileBuffer = req.file.buffer;
    const ext = path.extname(req.file.originalname) || '';
    const safeExt = ext && ext.length <= 8 ? ext : '';
    const filename = `user-${targetUserId}-${Date.now()}${safeExt}`;

    const storageResult = await StorageService.saveUserProfilePhoto(
      targetUserId,
      fileBuffer,
      filename,
      req.file.mimetype
    );

    const storedPath = storageResult.relativePath;
    await pool.execute('UPDATE users SET profile_photo_path = ? WHERE id = ?', [storedPath, targetUserId]);

    // Also create a user_photos record so this appears in the album and can be moderated.
    // Gracefully skip if the table doesn't exist yet (pre-migration).
    try {
      // Clear any previous is_profile=1 flags for this user
      await pool.execute('UPDATE user_photos SET is_profile = 0 WHERE user_id = ?', [targetUserId]);
      await pool.execute(
        `INSERT INTO user_photos (user_id, file_path, is_profile, source)
         VALUES (?, ?, 1, 'direct_upload')
         ON DUPLICATE KEY UPDATE is_profile = 1, is_active = 1`,
        [targetUserId, storedPath]
      );
    } catch {
      // Table may not exist in older environments; non-fatal.
    }

    const url = publicUploadsUrlFromStoredPath(storedPath);
    res.json({ success: true, path: storedPath, url });
  } catch (e) {
    next(e);
  }
};

/**
 * Upload a user email signature image (Hub / personal outbound).
 * POST /api/users/:id/email-signature
 * FormData: signature=<file>
 * Self-service allowed; managers/admins can upload for any user.
 */
export const uploadUserEmailSignature = async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId) return res.status(400).json({ error: { message: 'Invalid user id' } });

    if (!canEditTargetUserPhoto(req, targetUserId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const user = await User.findById(targetUserId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    if (!req.file) {
      return res.status(400).json({ error: { message: 'No file uploaded. Please select a PNG or JPG image.' } });
    }

    const allowed = new Set(['image/png', 'image/jpeg', 'image/jpg']);
    if (!allowed.has(String(req.file.mimetype || '').toLowerCase())) {
      return res.status(400).json({ error: { message: 'Email signature must be a PNG or JPG image.' } });
    }
    if (req.file.buffer.length > 150 * 1024) {
      return res.status(400).json({
        error: {
          message: 'Signature image is too large. Aim for under ~100KB (max width 600px, height 150–200px).'
        }
      });
    }

    const fileBuffer = req.file.buffer;
    const ext = path.extname(req.file.originalname) || (req.file.mimetype.includes('png') ? '.png' : '.jpg');
    const safeExt = ext && ext.length <= 8 ? ext : '.png';
    const filename = `user-${targetUserId}-sig-${Date.now()}${safeExt}`;

    const storageResult = await StorageService.saveUserEmailSignature(
      targetUserId,
      fileBuffer,
      filename,
      req.file.mimetype
    );

    const storedPath = storageResult.relativePath;
    await pool.execute('UPDATE users SET email_signature_path = ? WHERE id = ?', [storedPath, targetUserId]);

    const url = publicUploadsUrlFromStoredPath(storedPath);
    res.json({ success: true, path: storedPath, url });
  } catch (e) {
    next(e);
  }
};

/**
 * Live HTML staff signature preview (tenant-branded).
 * GET /api/users/:id/email-signature/preview?agencyId=
 */
export const getUserEmailSignaturePreview = async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    const requesterRole = String(req.user?.role || '').toLowerCase();
    const isSelf = Number(req.user?.id) === targetUserId;
    const isAdmin = ['admin', 'super_admin', 'support', 'staff', 'provider_plus'].includes(requesterRole);
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const agencyId = parseInt(String(req.query?.agencyId || ''), 10) || null;
    const { getStaffSignaturePreview } = await import('../services/staffHtmlEmailSignature.service.js');
    const preview = await getStaffSignaturePreview({
      userId: targetUserId,
      agencyId: Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null
    });
    if (!preview) return res.status(404).json({ error: { message: 'User not found' } });
    res.json({ ok: true, ...preview });
  } catch (e) {
    next(e);
  }
};

/**
 * Toggle staff HTML signature active flag.
 * PATCH /api/users/:id/email-signature
 * body: { enabled: boolean, agencyId? }
 */
export const patchUserEmailSignature = async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    if (!targetUserId) return res.status(400).json({ error: { message: 'Invalid user id' } });
    if (!canEditTargetUserPhoto(req, targetUserId)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (req.body?.enabled === undefined) {
      return res.status(400).json({ error: { message: 'enabled is required' } });
    }
    const enabled = !(req.body.enabled === false || req.body.enabled === 0 || req.body.enabled === '0');
    try {
      await pool.execute('UPDATE users SET email_signature_enabled = ? WHERE id = ?', [
        enabled ? 1 : 0,
        targetUserId
      ]);
    } catch (e) {
      if (String(e?.message || '').includes('email_signature_enabled')) {
        return res.status(503).json({
          error: { message: 'Run migration 1378_user_email_signature_enabled.sql first' }
        });
      }
      throw e;
    }
    const { getStaffSignaturePreview } = await import('../services/staffHtmlEmailSignature.service.js');
    const agencyId = parseInt(String(req.body?.agencyId || req.query?.agencyId || ''), 10) || null;
    const preview = await getStaffSignaturePreview({
      userId: targetUserId,
      agencyId: Number.isFinite(agencyId) && agencyId > 0 ? agencyId : null
    });
    res.json({ ok: true, enabled, preview });
  } catch (e) {
    next(e);
  }
};

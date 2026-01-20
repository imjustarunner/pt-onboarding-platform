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
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only PNG, JPEG, GIF, and WebP are allowed.'), false);
  }
});

export { upload };

const canEditTargetUserPhoto = (req, targetUserId) => {
  const requesterId = parseInt(req.user?.id || 0, 10);
  const requesterRole = String(req.user?.role || '').toLowerCase();
  const tId = parseInt(targetUserId || 0, 10);
  if (!tId) return false;
  if (requesterId && requesterId === tId) return true;
  return requesterRole === 'admin' || requesterRole === 'super_admin' || requesterRole === 'support';
};

/**
 * Upload a user profile photo
 * POST /api/users/:id/profile-photo
 * FormData: photo=<file>
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

    // Ensure column exists (fail loudly so admins run migrations)
    try {
      const dbName = process.env.DB_NAME || 'onboarding_stage';
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_photo_path' LIMIT 1",
        [dbName]
      );
      if (!cols || cols.length === 0) {
        return res.status(500).json({
          error: { message: 'Database missing users.profile_photo_path. Run migrations (database/migrations/206_users_add_profile_photo_path.sql).' }
        });
      }
    } catch (e) {
      // If info_schema is unavailable for some reason, let the UPDATE fail loudly below.
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

    const url = publicUploadsUrlFromStoredPath(storedPath);
    res.json({ success: true, path: storedPath, url });
  } catch (e) {
    next(e);
  }
};


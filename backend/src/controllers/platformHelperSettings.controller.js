import multer from 'multer';
import path from 'path';
import StorageService from '../services/storage.service.js';
import PlatformHelperSettings from '../models/PlatformHelperSettings.model.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only image files (PNG, JPEG, GIF, SVG, WebP) are allowed.'), false);
  }
});

export const uploadPlatformHelperImageMiddleware = upload.single('image');

export const getPlatformHelperSettings = async (req, res, next) => {
  try {
    const row = await PlatformHelperSettings.get();
    const imagePath = row.image_path || null;
    const publicRel = String(imagePath || '').startsWith('uploads/')
      ? String(imagePath).substring('uploads/'.length)
      : String(imagePath || '');

    res.json({
      enabled: row.enabled === 1 || row.enabled === true,
      imagePath,
      imageUrl: imagePath ? `/uploads/${publicRel}` : null,
      missingTable: row.missingTable === true
    });
  } catch (e) {
    next(e);
  }
};

export const uploadPlatformHelperImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'No file uploaded. Please select an image file.' } });
    }

    const fileBuffer = req.file.buffer;
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(req.file.originalname) || '';
    const filename = `helper-${uniqueSuffix}${ext}`;

    const storageResult = await StorageService.saveHelperAsset(fileBuffer, filename, req.file.mimetype);
    const filePath = storageResult.relativePath;

    // Persist as platform setting
    const actorUserId = req.user?.id || null;
    await PlatformHelperSettings.update({ enabled: true, imagePath: filePath, actorUserId });

    const publicRel = String(filePath || '').startsWith('uploads/')
      ? String(filePath).substring('uploads/'.length)
      : String(filePath || '');

    res.json({
      success: true,
      path: filePath,
      url: `/uploads/${publicRel}`,
      filename
    });
  } catch (e) {
    next(e);
  }
};

export const updatePlatformHelperSettings = async (req, res, next) => {
  try {
    const actorUserId = req.user?.id || null;
    const enabled = req.body?.enabled !== false;
    const imagePath = req.body?.imagePath == null ? null : String(req.body.imagePath);
    const row = await PlatformHelperSettings.update({ enabled, imagePath, actorUserId });
    res.json({ message: 'Platform helper settings updated', settings: row });
  } catch (e) {
    next(e);
  }
};


import multer from 'multer';
import path from 'path';
import StorageService from '../services/storage.service.js';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept image files
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/svg+xml', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only image files (PNG, JPEG, GIF, SVG, WebP) are allowed.'), false);
    }
  }
});

/**
 * Upload a logo file
 * POST /api/logos/upload
 */
export const uploadLogo = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'No file uploaded. Please select a logo file.' } });
    }

    const fileBuffer = req.file.buffer;
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(req.file.originalname);
    const filename = `logo-${uniqueSuffix}${ext}`;

    // Upload to GCS using StorageService
    const storageResult = await StorageService.saveLogo(
      fileBuffer,
      filename,
      req.file.mimetype
    );

    const filePath = storageResult.relativePath;
    console.log('Logo uploaded to GCS:', filePath);

    // Return the path that can be used to construct the URL
    // The stored path will be like "uploads/logos/logo-1234567890-123456789.png"
    // Public URL should be "/uploads/logos/..." (without the leading "uploads/").
    const publicRel = String(filePath || '').startsWith('uploads/')
      ? String(filePath).substring('uploads/'.length)
      : String(filePath || '');
    res.json({
      success: true,
      path: filePath,
      url: `/uploads/${publicRel}`,
      filename: filename
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    next(error);
  }
};

// Export multer middleware for use in routes
export { upload };

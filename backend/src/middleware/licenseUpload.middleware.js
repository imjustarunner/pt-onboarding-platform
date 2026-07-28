import multer from 'multer';
import { isAllowedLicenseUploadMime } from '../utils/licenseUploadMime.js';

const storage = multer.memoryStorage();

export const licenseUpload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (isAllowedLicenseUploadMime(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only PDF or image files (JPEG, PNG, WebP, HEIC) are allowed'), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

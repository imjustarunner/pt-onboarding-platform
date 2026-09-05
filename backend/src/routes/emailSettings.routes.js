import express from 'express';
import multer from 'multer';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import {
  getEmailSettings,
  updateEmailSettings,
  uploadHtmlEmailChrome,
  getHtmlEmailChrome
} from '../controllers/emailSettings.controller.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new Error('Only PNG, JPEG, or WebP images are allowed'), ok);
  }
});

router.get('/', authenticate, requireBackofficeAdmin, getEmailSettings);
router.put('/', authenticate, requireBackofficeAdmin, updateEmailSettings);
router.get('/html-chrome', authenticate, requireBackofficeAdmin, getHtmlEmailChrome);
router.post(
  '/html-chrome/:kind',
  authenticate,
  requireBackofficeAdmin,
  upload.single('file'),
  uploadHtmlEmailChrome
);

export default router;

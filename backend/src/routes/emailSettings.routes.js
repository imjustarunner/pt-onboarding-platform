import { excludeSupportSettings } from '../middleware/supportContentAccess.middleware.js';
import { getVacationSettings, updateVacationSettings, updateVacationDefaults } from '../controllers/vacationResponder.controller.js';
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

router.get('/vacation', authenticate, getVacationSettings);
router.put('/vacation', authenticate, updateVacationSettings);
router.put('/vacation/defaults', authenticate, updateVacationDefaults);

router.get('/', authenticate, excludeSupportSettings, requireBackofficeAdmin, getEmailSettings);
router.put('/', authenticate, excludeSupportSettings, requireBackofficeAdmin, updateEmailSettings);
router.get('/html-chrome', authenticate, excludeSupportSettings, requireBackofficeAdmin, getHtmlEmailChrome);
router.post(
  '/html-chrome/:kind',
  authenticate, excludeSupportSettings,
  requireBackofficeAdmin,
  upload.single('file'),
  uploadHtmlEmailChrome
);

export default router;

import express from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import {
  createMarketingPageAdmin,
  deleteMarketingPageAdmin,
  listMarketingPagesAdmin,
  updateMarketingPageAdmin,
  uploadPublicMarketingPageAsset,
  uploadPublicMarketingPageAssetMiddleware,
  uploadPublicMarketingPageVideoMiddleware
} from '../controllers/publicMarketingPages.controller.js';

const router = express.Router();

router.use(authenticate, requireSuperAdmin);
router.post('/upload', uploadPublicMarketingPageAssetMiddleware, uploadPublicMarketingPageAsset);
router.post('/upload-video', uploadPublicMarketingPageVideoMiddleware, uploadPublicMarketingPageAsset);
router.get('/', listMarketingPagesAdmin);
router.post('/', createMarketingPageAdmin);
router.put('/:id', updateMarketingPageAdmin);
router.delete('/:id', deleteMarketingPageAdmin);

export default router;

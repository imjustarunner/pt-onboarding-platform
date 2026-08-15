import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  sharePreviewUpload,
  getPublicSharePreviewImage,
  getPublicSharePreviewState,
  postPublicSharePreviewImage,
  deletePublicSharePreviewImage
} from '../controllers/publicSharePreview.controller.js';

const router = express.Router();

router.get('/image', getPublicSharePreviewImage);
router.get('/:agencySlug', getPublicSharePreviewState);
router.post('/:agencySlug/image', authenticate, sharePreviewUpload, postPublicSharePreviewImage);
router.delete('/:agencySlug/image', authenticate, deletePublicSharePreviewImage);

export default router;

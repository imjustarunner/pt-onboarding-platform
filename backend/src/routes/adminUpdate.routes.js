import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getMyAdminUpdateSplash,
  openMyAdminUpdateSplash,
  dismissMyAdminUpdateSplash,
  openMyAdminUpdateSplashByToken
} from '../controllers/adminUpdate.controller.js';

const router = express.Router();
router.use(authenticate);
router.get('/me/pending-splash', getMyAdminUpdateSplash);
router.post('/me/splash-by-token/:token/open', openMyAdminUpdateSplashByToken);
router.post('/me/splash/:splashId/open', openMyAdminUpdateSplash);
router.post('/me/splash/:splashId/dismiss', dismissMyAdminUpdateSplash);

export default router;

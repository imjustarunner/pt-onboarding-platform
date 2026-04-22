import express from 'express';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { precomputeTranslations } from '../controllers/translations.controller.js';

const router = express.Router();

router.use(authenticate, requireBackofficeAdmin);

router.post('/precompute', precomputeTranslations);

export default router;

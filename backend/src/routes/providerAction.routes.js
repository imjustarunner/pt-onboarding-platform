import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/providerActionOutreach.controller.js';

const router = express.Router();

router.get('/summaries', authenticate, ctrl.listProviderActionSummaries);
router.get('/providers/:providerUserId', authenticate, ctrl.getProviderActionDetail);
router.post('/providers/:providerUserId/link', authenticate, ctrl.createProviderActionLinkHandler);
router.get('/providers/:providerUserId/pdf', authenticate, ctrl.downloadProviderActionPdf);

export default router;

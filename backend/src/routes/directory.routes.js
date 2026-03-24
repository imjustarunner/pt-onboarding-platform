import express from 'express';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { listDirectoryPublicLinks } from '../controllers/directoryPublicLinks.controller.js';

const router = express.Router();

router.get('/public-links', authenticate, requireBackofficeAdmin, listDirectoryPublicLinks);

export default router;

import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  createDiscoverySession,
  listDiscoverySessions,
  getPublicDiscovery,
  postPublicDiscoverySelect,
  getPublicDiscoveryVideoToken
} from '../controllers/discoverySessions.controller.js';

const router = express.Router();

// Public token routes (no auth)
router.get('/public/:token', getPublicDiscovery);
router.post('/public/:token/select', postPublicDiscoverySelect);
router.get('/public/:token/video-token', getPublicDiscoveryVideoToken);

router.use(authenticate);
router.get('/', listDiscoverySessions);
router.post('/', createDiscoverySession);

export default router;

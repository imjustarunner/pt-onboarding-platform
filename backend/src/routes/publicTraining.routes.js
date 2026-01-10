import express from 'express';
import {
  getPublicModules,
  getPublicModule,
  getStandaloneModules,
  getPublicTrainingFocuses
} from '../controllers/publicTraining.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// On-demand training routes - accessible with approved employee auth or regular auth
router.get('/modules', authenticate, getPublicModules);
router.get('/modules/:id', authenticate, getPublicModule);
router.get('/training-focuses', authenticate, getPublicTrainingFocuses);
router.get('/standalone', authenticate, getStandaloneModules);

export default router;


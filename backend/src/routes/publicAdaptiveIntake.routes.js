import express from 'express';
import {
  getPublicConfig,
  submitQuick,
  listProviders
} from '../controllers/adaptiveIntake.controller.js';

const router = express.Router();

router.get('/:agencySlug', getPublicConfig);
router.get('/:agencySlug/providers', listProviders);
router.post('/:agencySlug/quick', submitQuick);

export default router;

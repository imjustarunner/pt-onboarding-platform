import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listAgencyCampaigns,
  listAgencyCampaignStaff,
  createAgencyCampaign,
  sendAgencyCampaign,
  closeAgencyCampaign,
  listAgencyCampaignResponses
} from '../controllers/agencyCampaigns.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/', listAgencyCampaigns);
router.get('/staff', listAgencyCampaignStaff);
router.post('/', createAgencyCampaign);
router.post('/:id/send', sendAgencyCampaign);
router.post('/:id/close', closeAgencyCampaign);
router.get('/:id/responses', listAgencyCampaignResponses);

export default router;

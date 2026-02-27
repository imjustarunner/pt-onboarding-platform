import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  giveKudos,
  getMyKudos,
  getMyGiveBalance,
  awardNotesComplete,
  getLeaderboard,
  listTiers,
  createTier,
  updateTier,
  deleteTier,
  getTierProgress,
  listPendingKudos,
  getPendingSummary,
  approveKudos,
  rejectKudos
} from '../controllers/kudos.controller.js';

const router = express.Router();
router.use(authenticate);

router.post('/', giveKudos);
router.get('/me', getMyKudos);
router.get('/give-balance', getMyGiveBalance);
router.post('/notes-complete', awardNotesComplete);
router.get('/leaderboard', getLeaderboard);
router.get('/tier-progress', getTierProgress);
router.get('/pending-summary', getPendingSummary);
router.get('/pending', listPendingKudos);
router.post('/:id/approve', approveKudos);
router.post('/:id/reject', rejectKudos);
router.get('/tiers', listTiers);
router.post('/tiers', createTier);
router.put('/tiers/:id', updateTier);
router.delete('/tiers/:id', deleteTier);

export default router;

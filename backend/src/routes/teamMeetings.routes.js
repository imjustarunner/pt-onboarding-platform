import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getTeamMeetingJoinInfo,
  getTeamMeetingVideoToken,
  saveTeamMeetingClientTranscript
} from '../controllers/teamMeetings.controller.js';

const router = express.Router();

// Public: resolve event to org slug for join redirect (no auth)
router.get('/join-info/:eventId', getTeamMeetingJoinInfo);

router.use(authenticate);

router.get('/:eventId/video-token', getTeamMeetingVideoToken);
router.post('/:eventId/client-transcript', saveTeamMeetingClientTranscript);

export default router;

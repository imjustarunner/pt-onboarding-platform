import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getTeamMeetingJoinInfo,
  getTeamMeetingVideoToken,
  setTeamMeetingRecordingRules,
  saveTeamMeetingClientTranscript
} from '../controllers/teamMeetings.controller.js';
import { getTeamMeetingActivity, postTeamMeetingActivity } from '../controllers/videoMeetingActivity.controller.js';

const router = express.Router();

// Public: resolve event to org slug for join redirect (no auth)
router.get('/join-info/:eventId', getTeamMeetingJoinInfo);

router.use(authenticate);

router.get('/:eventId/video-token', getTeamMeetingVideoToken);
router.post('/:eventId/recording-rules', setTeamMeetingRecordingRules);
router.post('/:eventId/client-transcript', saveTeamMeetingClientTranscript);
router.get('/:eventId/activity', getTeamMeetingActivity);
router.post('/:eventId/activity', postTeamMeetingActivity);

export default router;

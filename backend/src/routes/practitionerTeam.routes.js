import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getMyTeamAccess,
  listTeam,
  inviteAssistant,
  updateMemberPermissions,
  resendMemberSetup,
  removeMember
} from '../controllers/practitionerTeam.controller.js';

const router = express.Router();

router.use(authenticate);
router.get('/me', getMyTeamAccess);
router.get('/', listTeam);
router.post('/invite', inviteAssistant);
router.put('/:userId/permissions', updateMemberPermissions);
router.post('/:userId/resend-setup', resendMemberSetup);
router.delete('/:userId', removeMember);

export default router;

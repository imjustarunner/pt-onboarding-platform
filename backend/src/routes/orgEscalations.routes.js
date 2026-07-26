import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireAgencyAccess } from '../middleware/agencyAccess.middleware.js';
import {
  createEscalation,
  listEscalations,
  getEscalation,
  updateEscalationStatus,
  updateEscalationDetails,
  assignEscalation,
  listEscalationAssignees,
  getEscalationRouting,
  updateEscalationRouting,
  listEscalationMessages,
  createEscalationMessage,
  escalationUpload,
  uploadEscalationAttachment,
  getEscalationsSummary,
  listUpcomingAdminMeetings,
  updateEscalationMeetingLink
} from '../controllers/orgEscalations.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/summary', requireAgencyAccess, getEscalationsSummary);
router.get('/assignees', requireAgencyAccess, listEscalationAssignees);
router.get('/routing', requireAgencyAccess, getEscalationRouting);
router.put('/routing', requireAgencyAccess, updateEscalationRouting);
router.get('/admin-meetings', requireAgencyAccess, listUpcomingAdminMeetings);

router.get('/', requireAgencyAccess, listEscalations);
router.post('/', requireAgencyAccess, createEscalation);

router.get('/:id', getEscalation);
router.patch('/:id', updateEscalationDetails);
router.patch('/:id/status', updateEscalationStatus);
router.patch('/:id/meeting-link', updateEscalationMeetingLink);
router.post('/:id/assign', assignEscalation);
router.get('/:id/messages', listEscalationMessages);
router.post('/:id/messages', createEscalationMessage);
router.post(
  '/:id/attachments',
  escalationUpload.single('file'),
  uploadEscalationAttachment
);

export default router;

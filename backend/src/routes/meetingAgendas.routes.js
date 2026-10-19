import express from 'express';
import {
  getAgendaForMeeting,
  createAgenda,
  addAgendaItem,
  addAgendaItemsBulk,
  updateAgendaItem,
  deleteAgendaItem,
  listUpcomingMeetings
} from '../controllers/meetingAgendas.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authenticateTeamMeetingAgenda } from '../middleware/teamMeetingInvitationAccess.middleware.js';

const router = express.Router();

router.get('/', authenticateTeamMeetingAgenda, getAgendaForMeeting);
router.get('/meetings', authenticate, listUpcomingMeetings);
router.post('/', authenticateTeamMeetingAgenda, createAgenda);
router.post('/:agendaId/items', authenticateTeamMeetingAgenda, addAgendaItem);
router.post('/:agendaId/items/bulk', authenticateTeamMeetingAgenda, addAgendaItemsBulk);
router.patch('/:agendaId/items/:itemId', authenticateTeamMeetingAgenda, updateAgendaItem);
router.delete('/:agendaId/items/:itemId', authenticateTeamMeetingAgenda, deleteAgendaItem);

export default router;

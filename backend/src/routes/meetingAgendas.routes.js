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
import { authenticateSupervisionAgenda } from '../middleware/supervisionInvitationAccess.middleware.js';

const router = express.Router();

router.get('/', authenticateSupervisionAgenda, getAgendaForMeeting);
router.get('/meetings', authenticate, listUpcomingMeetings);
router.post('/', authenticateSupervisionAgenda, createAgenda);
router.post('/:agendaId/items', authenticateSupervisionAgenda, addAgendaItem);
router.post('/:agendaId/items/bulk', authenticateSupervisionAgenda, addAgendaItemsBulk);
router.patch('/:agendaId/items/:itemId', authenticateSupervisionAgenda, updateAgendaItem);
router.delete('/:agendaId/items/:itemId', authenticateSupervisionAgenda, deleteAgendaItem);

export default router;

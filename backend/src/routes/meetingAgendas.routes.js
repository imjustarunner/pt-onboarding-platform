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

const router = express.Router();

router.get('/', authenticate, getAgendaForMeeting);
router.get('/meetings', authenticate, listUpcomingMeetings);
router.post('/', authenticate, createAgenda);
router.post('/:agendaId/items', authenticate, addAgendaItem);
router.post('/:agendaId/items/bulk', authenticate, addAgendaItemsBulk);
router.patch('/:agendaId/items/:itemId', authenticate, updateAgendaItem);
router.delete('/:agendaId/items/:itemId', authenticate, deleteAgendaItem);

export default router;

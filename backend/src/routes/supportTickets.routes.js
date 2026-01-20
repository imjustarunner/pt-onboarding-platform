import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listMySupportTickets,
  listSupportTicketsQueue,
  createSupportTicket,
  answerSupportTicket
} from '../controllers/supportTickets.controller.js';

const router = express.Router();
router.use(authenticate);

// School staff: list own tickets
router.get('/mine', listMySupportTickets);

// Admin/support: queue (optionally filter by schoolOrganizationId/status)
router.get('/', listSupportTicketsQueue);

// School staff: create ticket
router.post('/', createSupportTicket);

// Admin/support: answer ticket
router.post('/:id/answer', answerSupportTicket);

export default router;


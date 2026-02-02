import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listMySupportTickets,
  listSupportTicketsQueue,
  createSupportTicket,
  getClientSupportTicketThread,
  listSupportTicketMessages,
  createSupportTicketMessage,
  answerSupportTicket,
  claimSupportTicket,
  unclaimSupportTicket
} from '../controllers/supportTickets.controller.js';

const router = express.Router();
router.use(authenticate);

// School staff: list own tickets
router.get('/mine', listMySupportTickets);

// School Portal: client-scoped thread lookup (school staff + agency staff/admin)
router.get('/client-thread', getClientSupportTicketThread);

// Admin/support: queue (optionally filter by schoolOrganizationId/status)
router.get('/', listSupportTicketsQueue);

// School staff: create ticket
router.post('/', createSupportTicket);

// Thread messages (client-scoped + future general ticket threading)
router.get('/:id/messages', listSupportTicketMessages);
router.post('/:id/messages', createSupportTicketMessage);

// Admin/support: answer ticket
router.post('/:id/answer', answerSupportTicket);

// Admin/support/staff: claim ticket (ownership)
router.post('/:id/claim', claimSupportTicket);

// Admin/support/staff: unclaim ticket (return to queue)
router.post('/:id/unclaim', unclaimSupportTicket);

export default router;


import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listMySupportTickets,
  listSupportTicketsQueue,
  getSupportTicketsCount,
  createSupportTicket,
  getClientSupportTicketThread,
  markClientSupportTicketThreadRead,
  listClientSupportTickets,
  listSupportTicketMessages,
  createSupportTicketMessage,
  deleteSupportTicketMessage,
  generateSupportTicketResponse,
  reviewSupportTicketDraft,
  markSupportTicketDraftSent,
  answerSupportTicket,
  claimSupportTicket,
  unclaimSupportTicket,
  listSupportTicketAssignees,
  assignSupportTicket,
  closeSupportTicket
} from '../controllers/supportTickets.controller.js';

const router = express.Router();
router.use(authenticate);

// School staff: list own tickets
router.get('/mine', listMySupportTickets);

// School Portal: client-scoped thread lookup (school staff + agency staff/admin)
router.get('/client-thread', getClientSupportTicketThread);
router.post('/client-thread/read', markClientSupportTicketThreadRead);

// School Portal: list client ticket history (school staff + agency staff/admin)
router.get('/client-tickets', listClientSupportTickets);

// Admin/support: queue (optionally filter by schoolOrganizationId/status)
router.get('/count', getSupportTicketsCount);
router.get('/', listSupportTicketsQueue);
router.get('/assignees', listSupportTicketAssignees);

// School staff: create ticket
router.post('/', createSupportTicket);

// Thread messages (client-scoped + future general ticket threading)
router.get('/:id/messages', listSupportTicketMessages);
router.post('/:id/messages', createSupportTicketMessage);
router.delete('/:id/messages/:messageId', deleteSupportTicketMessage);

// Admin/support: answer ticket
router.post('/:id/answer', answerSupportTicket);

// Admin/support: generate Gemini draft response
router.post('/:id/generate-response', generateSupportTicketResponse);
router.post('/:id/review-draft', reviewSupportTicketDraft);
router.post('/:id/mark-sent', markSupportTicketDraftSent);

// Admin/support/staff: claim ticket (ownership)
router.post('/:id/claim', claimSupportTicket);

// Admin/support/staff: unclaim ticket (return to queue)
router.post('/:id/unclaim', unclaimSupportTicket);

// Admin/support: assign ticket to user
router.post('/:id/assign', assignSupportTicket);

// Staff/admin/support: close ticket
router.post('/:id/close', closeSupportTicket);

export default router;


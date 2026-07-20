import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireAgencyAccess } from '../middleware/agencyAccess.middleware.js';
import {
  listMySupportTickets,
  listSupportTicketsQueue,
  getSupportTicketsCount,
  getSupportTicketsMetrics,
  getSupportTicketsCountsByAgency,
  createPlatformSupportTicket,
  escalateSupportTicketToPlatform,
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
  updateSupportTicketPriority,
  closeSupportTicket,
  listClientAssignedProvidersForSupportTicket,
  forwardSupportTicketToProviders
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

// Admin/support: queue (optionally filter by schoolOrganizationId/status) - now strictly tenant-scoped
router.get('/count', requireAgencyAccess, getSupportTicketsCount);
router.get('/metrics', requireAgencyAccess, getSupportTicketsMetrics);
router.get('/counts-by-agency', requireAgencyAccess, getSupportTicketsCountsByAgency);
router.get('/', requireAgencyAccess, listSupportTicketsQueue);
router.get('/assignees', requireAgencyAccess, listSupportTicketAssignees);

// Tenant admin → Plot Twist HQ platform support (direct)
router.post('/platform', createPlatformSupportTicket);

// School staff / providers / tenant team: create tenant-scoped ticket
router.post('/', createSupportTicket);

// Thread messages (client-scoped + future general ticket threading)
router.get('/:id/messages', listSupportTicketMessages);
router.get('/:id/client-assigned-providers', listClientAssignedProvidersForSupportTicket);
router.post('/:id/forward-to-providers', forwardSupportTicketToProviders);
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

// Admin/support: update priority
router.post('/:id/priority', updateSupportTicketPriority);

// Staff/admin/support: close ticket
router.post('/:id/close', closeSupportTicket);

// Tenant admin escalates an existing ticket to platform
router.post('/:id/escalate-to-platform', escalateSupportTicketToPlatform);

export default router;


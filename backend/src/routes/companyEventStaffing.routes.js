import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getCompanyEventSessionStaffingSummary,
  listCompanyEventSessionGroups,
  listCompanyEventSessionClientGroupAssignments,
  upsertCompanyEventSessionGroups,
  assignClientToSessionGroup,
  listMyCompanyEventSessionRequests,
  createCompanyEventSessionRequest,
  withdrawCompanyEventSessionRequest,
  listCompanyEventSessionRequests,
  approveCompanyEventSessionRequest,
  denyCompanyEventSessionRequest,
  assignProviderToSession,
  unassignProviderFromSession
} from '../controllers/companyEventStaffing.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/:eventId/session-staffing-summary', getCompanyEventSessionStaffingSummary);

router.get('/:eventId/session-groups', listCompanyEventSessionGroups);
router.get('/:eventId/session-client-group-assignments', listCompanyEventSessionClientGroupAssignments);
router.post('/:eventId/session-groups', upsertCompanyEventSessionGroups);
router.post('/:eventId/session-groups/:groupId/assign-client', assignClientToSessionGroup);

router.get('/:eventId/my-session-requests', listMyCompanyEventSessionRequests);
router.post('/:eventId/session-requests', createCompanyEventSessionRequest);
router.post('/:eventId/session-requests/:requestId/withdraw', withdrawCompanyEventSessionRequest);

router.get('/:eventId/session-requests', listCompanyEventSessionRequests);
router.post('/:eventId/session-requests/:requestId/approve', approveCompanyEventSessionRequest);
router.post('/:eventId/session-requests/:requestId/deny', denyCompanyEventSessionRequest);

router.post('/:eventId/session-providers/assign', assignProviderToSession);
router.post('/:eventId/session-providers/unassign', unassignProviderFromSession);

export default router;


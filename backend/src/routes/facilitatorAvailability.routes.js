import express from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import {
  createRequest,
  listRequests,
  getRequest,
  updateRequest,
  pushRequest,
  getResponses,
  listMyPending,
  getRequestForEmployee,
  submitResponse,
  listAgencyEvents,
  getSchedulingData,
  setSlotOverride,
  assignFacilitator,
  unassignFacilitator
} from '../controllers/facilitatorAvailability.controller.js';

// ── Employee routes — mounted at /api/facilitator-availability ────────────────
export const employeeRouter = express.Router();
employeeRouter.use(authenticate);
employeeRouter.get('/my-pending', listMyPending);
employeeRouter.get('/:requestId', getRequestForEmployee);
employeeRouter.post('/:requestId/submit', submitResponse);

// ── Admin routes — mounted at /api/agencies/:agencyId/facilitator-availability ─
export const adminRouter = express.Router({ mergeParams: true });
adminRouter.use(authenticate);
adminRouter.get('/agency-events', listAgencyEvents);      // event picker helper
adminRouter.get('/', listRequests);
adminRouter.post('/', createRequest);
adminRouter.get('/:requestId', getRequest);
adminRouter.put('/:requestId', updateRequest);
adminRouter.post('/:requestId/push', requireAdmin, pushRequest);
adminRouter.get('/:requestId/responses', getResponses);
adminRouter.get('/:requestId/schedule', getSchedulingData);
adminRouter.put('/:requestId/slot-override', setSlotOverride);
adminRouter.post('/:requestId/assign', assignFacilitator);
adminRouter.post('/:requestId/unassign', unassignFacilitator);

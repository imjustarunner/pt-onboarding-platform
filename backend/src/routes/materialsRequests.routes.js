import express from 'express';
import { authenticate, requireAgencyAdminOrOperationsLead } from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/materialsRequests.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/:agencyId', requireAgencyAdminOrOperationsLead, ctrl.getBoard);
router.get('/:agencyId/assignees', requireAgencyAdminOrOperationsLead, ctrl.getAssignees);
router.get('/:agencyId/inventory-options', requireAgencyAdminOrOperationsLead, ctrl.getInventoryOptionsHandler);
router.post('/:agencyId/items/assign', requireAgencyAdminOrOperationsLead, ctrl.assignItem);
router.post('/:agencyId/items/fulfill', requireAgencyAdminOrOperationsLead, ctrl.fulfillItem);
router.post('/:agencyId/items/reopen', requireAgencyAdminOrOperationsLead, ctrl.reopenItem);

export default router;

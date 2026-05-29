import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listCompanyEventClients,
  listCompanyEventProviderOptions,
  searchCompanyEventClients,
  addCompanyEventClient,
  updateCompanyEventClientNotes,
  removeCompanyEventClient,
  patchCompanyEventClientWorkflow,
  listCompanyEventAttendanceStatus,
  putCompanyEventClientAttendanceStatus
} from '../controllers/companyEventClients.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/:eventId/clients', listCompanyEventClients);
router.get('/:eventId/client-search', searchCompanyEventClients);
router.get('/:eventId/provider-options', listCompanyEventProviderOptions);
router.get('/:eventId/attendance-status', listCompanyEventAttendanceStatus);
router.post('/:eventId/clients', addCompanyEventClient);
router.patch('/:eventId/clients/:clientId', updateCompanyEventClientNotes);
router.patch('/:eventId/clients/:clientId/workflow', patchCompanyEventClientWorkflow);
router.put('/:eventId/clients/:clientId/attendance-status', putCompanyEventClientAttendanceStatus);
router.delete('/:eventId/clients/:clientId', removeCompanyEventClient);

export default router;

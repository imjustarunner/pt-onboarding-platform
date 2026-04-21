import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listCompanyEventClients,
  listCompanyEventProviderOptions,
  searchCompanyEventClients,
  addCompanyEventClient,
  updateCompanyEventClientNotes,
  removeCompanyEventClient,
  patchCompanyEventClientWorkflow
} from '../controllers/companyEventClients.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/:eventId/clients', listCompanyEventClients);
router.get('/:eventId/client-search', searchCompanyEventClients);
router.get('/:eventId/provider-options', listCompanyEventProviderOptions);
router.post('/:eventId/clients', addCompanyEventClient);
router.patch('/:eventId/clients/:clientId', updateCompanyEventClientNotes);
router.patch('/:eventId/clients/:clientId/workflow', patchCompanyEventClientWorkflow);
router.delete('/:eventId/clients/:clientId', removeCompanyEventClient);

export default router;

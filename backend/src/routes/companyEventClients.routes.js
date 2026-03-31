import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listCompanyEventClients,
  searchCompanyEventClients,
  addCompanyEventClient,
  updateCompanyEventClientNotes,
  removeCompanyEventClient
} from '../controllers/companyEventClients.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/:eventId/clients', listCompanyEventClients);
router.get('/:eventId/client-search', searchCompanyEventClients);
router.post('/:eventId/clients', addCompanyEventClient);
router.patch('/:eventId/clients/:clientId', updateCompanyEventClientNotes);
router.delete('/:eventId/clients/:clientId', removeCompanyEventClient);

export default router;

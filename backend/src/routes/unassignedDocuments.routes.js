import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import {
  listUnassignedDocuments,
  assignToClient,
  getGuardianClients,
  downloadDocument
} from '../controllers/unassignedDocuments.controller.js';

const router = express.Router();

router.use(authenticate, requireBackofficeAdmin);

router.get('/', listUnassignedDocuments);
router.get('/:id/download', downloadDocument);
router.get('/:id/guardian-clients', getGuardianClients);
router.post(
  '/:id/assign',
  [body('clientId').isInt().withMessage('clientId must be an integer')],
  assignToClient
);

export default router;

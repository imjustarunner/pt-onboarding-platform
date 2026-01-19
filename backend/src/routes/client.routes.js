import express from 'express';
import { body } from 'express-validator';
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  updateClientStatus,
  assignProvider,
  deleteBulkImportedClients,
  getClientHistory,
  getClientNotes,
  createClientNote
} from '../controllers/client.controller.js';
import { listClientGuardians, upsertClientGuardian, updateClientGuardian, removeClientGuardian } from '../controllers/clientGuardian.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// All client routes require authentication (controllers assume req.user is present)
router.use(authenticate);

// List clients (agency view)
router.get('/', getClients);

// Delete bulk-imported clients for an agency (admin only)
// DELETE /api/clients/bulk-import?agencyId=123&confirm=true
router.delete('/bulk-import', deleteBulkImportedClients);

// Get client detail
router.get('/:id', getClientById);

// Create client
router.post('/', createClient);

// Update client
router.put('/:id', updateClient);

// Update client status
router.put('/:id/status', updateClientStatus);

// Assign provider
router.put('/:id/provider', assignProvider);

// Get status history
router.get('/:id/history', getClientHistory);

// Get notes
router.get('/:id/notes', getClientNotes);

// Create note
router.post('/:id/notes', createClientNote);

// Guardians (admin-managed)
router.get('/:id/guardians', requireAdmin, listClientGuardians);
router.post(
  '/:id/guardians',
  requireAdmin,
  [
    body('email').isString().isLength({ min: 3, max: 255 }),
    body('firstName').isString().isLength({ min: 1, max: 255 }),
    body('lastName').isString().isLength({ min: 1, max: 255 }),
    body('relationshipTitle').optional().isString().isLength({ min: 1, max: 100 }),
    body('accessEnabled').optional(),
    body('permissionsJson').optional()
  ],
  upsertClientGuardian
);
router.patch('/:id/guardians/:guardianUserId', requireAdmin, updateClientGuardian);
router.delete('/:id/guardians/:guardianUserId', requireAdmin, removeClientGuardian);

export default router;

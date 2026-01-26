import express from 'express';
import { body } from 'express-validator';
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  updateClientStatus,
  unarchiveClient,
  assignProvider,
  deleteBulkImportedClients,
  getClientHistory,
  getClientNotes,
  createClientNote,
  markClientNotesRead,
  updateClientComplianceChecklist,
  getClientAccessLog
} from '../controllers/client.controller.js';
import { listClientGuardians, upsertClientGuardian, updateClientGuardian, removeClientGuardian } from '../controllers/clientGuardian.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

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

// Unarchive client (admin/staff/support/super_admin)
router.post('/:id/unarchive', unarchiveClient);

// Update client status
router.put('/:id/status', updateClientStatus);

// Assign provider
router.put('/:id/provider', assignProvider);

// Get status history
router.get('/:id/history', getClientHistory);

// Access log (admin/support)
router.get('/:id/access-log', getClientAccessLog);

// Get notes
router.get('/:id/notes', getClientNotes);

// Create note
router.post('/:id/notes', createClientNote);

// Mark notes read (per-user)
router.post('/:id/notes/read', markClientNotesRead);

// Compliance checklist (provider/admin/staff)
router.put('/:id/compliance-checklist', updateClientComplianceChecklist);

// Guardians (admin-managed)
router.get('/:id/guardians', requireBackofficeAdmin, listClientGuardians);
router.post(
  '/:id/guardians',
  requireBackofficeAdmin,
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
router.patch('/:id/guardians/:guardianUserId', requireBackofficeAdmin, updateClientGuardian);
router.delete('/:id/guardians/:guardianUserId', requireBackofficeAdmin, removeClientGuardian);

export default router;

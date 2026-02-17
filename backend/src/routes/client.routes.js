import express from 'express';
import { body } from 'express-validator';
import {
  getClients,
  getClientsForUser,
  getArchivedClients,
  getClientById,
  createClient,
  updateClient,
  graduateClientType,
  updateClientStatus,
  unarchiveClient,
  bulkPromoteSchoolYear,
  rolloverSchoolYear,
  assignProvider,
  deleteBulkImportedClients,
  getClientHistory,
  getClientPaperworkHistory,
  createClientPaperworkHistory,
  getClientDocumentStatus,
  updateClientDocumentStatus,
  getClientNotes,
  getClientAdminNote,
  createClientNote,
  getClientDailyNotes,
  upsertClientDailyNote,
  upsertClientAdminNote,
  setClientIdentifierCode,
  generateClientIdentifierCode,
  markClientNotesRead,
  updateClientComplianceChecklist,
  getClientAccessLog,
  listClientAffiliations,
  upsertClientAffiliation,
  removeClientAffiliation,
  listClientAgencyAffiliations,
  upsertClientAgencyAffiliation,
  removeClientAgencyAffiliation,
  listClientProviderAssignments,
  upsertClientProviderAssignment,
  removeClientProviderAssignment,
  deleteClient
} from '../controllers/client.controller.js';
import { listClientGuardians, upsertClientGuardian, updateClientGuardian, removeClientGuardian } from '../controllers/clientGuardian.controller.js';
import { authenticate, requireBackofficeAdmin, requireGuardianListAccess } from '../middleware/auth.middleware.js';

const router = express.Router();

// All client routes require authentication (controllers assume req.user is present)
router.use(authenticate);

// List clients (agency view)
router.get('/', getClients);
router.get('/for-user/:userId', getClientsForUser);
router.get('/archived', getArchivedClients);

// Delete bulk-imported clients for an agency (admin only)
// DELETE /api/clients/bulk-import?agencyId=123&confirm=true
router.delete('/bulk-import', deleteBulkImportedClients);

// Bulk actions
router.post('/bulk/promote-school-year', bulkPromoteSchoolYear);
router.post('/bulk/rollover-school-year', rolloverSchoolYear);

// Get client detail
router.get('/:id', getClientById);

// Create client
router.post('/', createClient);

// Update client
router.put('/:id', updateClient);

// Graduate client type (school -> learning -> clinical)
router.post('/:id/client-type', graduateClientType);

// Unarchive client (admin/staff/support/super_admin)
router.post('/:id/unarchive', unarchiveClient);

// Update client status
router.put('/:id/status', updateClientStatus);

// Assign provider
router.put('/:id/provider', assignProvider);

// Get status history
router.get('/:id/history', getClientHistory);

// Get paperwork/document history (agency-only)
router.get('/:id/paperwork-history', getClientPaperworkHistory);

// Create paperwork/document history entry (agency-only)
router.post('/:id/paperwork-history', createClientPaperworkHistory);

// Document status checklist (Needed/Received)
router.get('/:id/document-status', getClientDocumentStatus);
router.put('/:id/document-status', updateClientDocumentStatus);

// Access log (admin/support)
router.get('/:id/access-log', getClientAccessLog);

// Single admin note (internal-only; shown on Overview)
router.get('/:id/admin-note', getClientAdminNote);
router.put('/:id/admin-note', upsertClientAdminNote);

// Client identifier code (6-digit, permanent)
router.put('/:id/identifier-code', setClientIdentifierCode);
router.post('/:id/identifier-code/generate', generateClientIdentifierCode);

// Get notes
router.get('/:id/notes', getClientNotes);

// Create note
router.post('/:id/notes', createClientNote);

// Daily notes (per-day, program-scoped)
router.get('/:id/daily-notes', getClientDailyNotes);
router.post('/:id/daily-notes', upsertClientDailyNote);

// Mark notes read (per-user)
router.post('/:id/notes/read', markClientNotesRead);

// Compliance checklist (provider/admin/staff)
router.put('/:id/compliance-checklist', updateClientComplianceChecklist);

// Multi-org affiliations (admin/staff/support/super_admin)
router.get('/:id/affiliations', listClientAffiliations);
router.post('/:id/affiliations', upsertClientAffiliation);
router.delete('/:id/affiliations/:organizationId', removeClientAffiliation);

// Multi-agency affiliations (admin/staff/support/super_admin)
router.get('/:id/agency-affiliations', listClientAgencyAffiliations);
router.post('/:id/agency-affiliations', upsertClientAgencyAffiliation);
router.delete('/:id/agency-affiliations/:agencyId', removeClientAgencyAffiliation);

// Multi-provider assignments (admin/staff/support/super_admin)
router.get('/:id/provider-assignments', listClientProviderAssignments);
router.post('/:id/provider-assignments', upsertClientProviderAssignment);
router.delete('/:id/provider-assignments/:assignmentId', removeClientProviderAssignment);

// Guardians (admin or supervisor with client access can view; only admin can create/update/delete)
router.get('/:id/guardians', requireGuardianListAccess, listClientGuardians);
router.post(
  '/:id/guardians',
  requireBackofficeAdmin,
  [
    body('email').isString().isLength({ min: 3, max: 255 }),
    body('firstName').isString().isLength({ min: 1, max: 255 }),
    body('lastName').isString().isLength({ min: 1, max: 255 }),
    body('relationshipType').optional().isIn(['self', 'guardian', 'proxy']),
    body('relationshipTitle').optional().isString().isLength({ min: 1, max: 100 }),
    body('accessEnabled').optional(),
    body('permissionsJson').optional()
  ],
  upsertClientGuardian
);
router.patch('/:id/guardians/:guardianUserId', requireBackofficeAdmin, updateClientGuardian);
router.delete('/:id/guardians/:guardianUserId', requireBackofficeAdmin, removeClientGuardian);

// Permanently delete a client (archived-only; admin only)
router.delete('/:id', requireBackofficeAdmin, deleteClient);

export default router;

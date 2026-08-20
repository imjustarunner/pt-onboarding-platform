import express from 'express';
import { body } from 'express-validator';
import {
  getClients,
  getClientsForUser,
  getArchivedClients,
  getClientNameDuplicates,
  getClientById,
  createClient,
  updateClient,
  graduateClientType,
  updateClientStatus,
  unarchiveClient,
  terminateClient,
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
  getClientClinicalResponses,
  updateClientClinicalResponses,
  getClientInsuranceCard,
  getClientDemographics,
  logClientProfileView,
  listClientAffiliations,
  upsertClientAffiliation,
  removeClientAffiliation,
  listClientAgencyAffiliations,
  upsertClientAgencyAffiliation,
  removeClientAgencyAffiliation,
  listClientProviderAssignments,
  listClientEventAssignments,
  listClientEventRegistrationSwitchOptions,
  switchClientEventRegistrationHandler,
  upsertClientProviderAssignment,
  removeClientProviderAssignment,
  deleteClient,
  getClientDeletePreviewHandler,
  getBulkClientsDeletePreviewHandler,
  bulkDeleteDevFillClients
} from '../controllers/client.controller.js';
import {
  listClientSchoolRoiAccess,
  updateClientSchoolRoiAccess,
  updateClientSchoolRoiExpiration,
  updateClientSchoolRoiSigningConfig,
  issueClientSchoolRoiSigningLink,
  trackClientSchoolRoiSigningLinkCopied,
  sendClientSchoolRoiSigningText,
  sendClientSchoolRoiSigningEmail
} from '../controllers/clientSchoolRoiAccess.controller.js';
import { listClientGuardians, upsertClientGuardian, updateClientGuardian, removeClientGuardian } from '../controllers/clientGuardian.controller.js';
import { getClientGuardianWaiverAudit } from '../controllers/guardianWaiver.controller.js';
import {
  listClientCommunications,
  getClientCommunicationBody,
  listClientSmsAudit
} from '../controllers/clientCommunications.controller.js';
import {
  getOnboardingChecklist,
  putOnboardingDocs,
  postMarkPacketSignature,
  postAcknowledgeRoiStaff,
  postWaiveNewPacketFlag,
  putOnboardingRoiExpiration,
  postCompleteStaffOnboarding,
  getOnboardingQueue,
  getProviderOnboardingQueue
} from '../controllers/clientOnboarding.controller.js';
import {
  getClientDisclosure,
  requireClientDisclosure
} from '../controllers/clientDisclosure.controller.js';
import {
  getClientIntakeNote,
  generateClientIntakeNote,
  confirmClientIntakeDiagnosis,
  finalizeClientIntakeNote,
  getClientRecordsCopyBlocks
} from '../controllers/clientIntakeNote.controller.js';
import {
  getClientAgencyIntake,
  putClientAgencyIntake,
  getClientYearDisposition,
  getClientLifecycleHistoryHandler,
  putClientSpringUpdate,
  putClientFallConfirmation,
  putClientAgencyClearance,
  putClientRoiFollowup,
  postConfirmServicesStarted
} from '../controllers/clientLifecycle.controller.js';
import { authenticate, requireBackofficeAdmin, requireGuardianListAccess } from '../middleware/auth.middleware.js';
import {
  getPeopleDuplicates as getClientDuplicates,
  getPeopleTests as getClientTests,
  previewPeopleMerge as previewClientMerge,
  applyPeopleMerge as applyClientMerge,
  patchClientDemo,
  bulkPatchDemo as bulkPatchClientDemo
} from '../controllers/identityHygiene.controller.js';

const router = express.Router();

// All client routes require authentication (controllers assume req.user is present)
router.use(authenticate);

// List clients (agency view)
router.get('/', getClients);
router.get('/for-user/:userId', getClientsForUser);
router.get('/archived', getArchivedClients);
router.get('/name-duplicates', getClientNameDuplicates);
router.get('/duplicates', getClientDuplicates);
router.get('/tests', getClientTests);
router.post('/merge/preview', requireBackofficeAdmin, previewClientMerge);
router.post('/merge', requireBackofficeAdmin, applyClientMerge);
router.post('/demo/bulk', requireBackofficeAdmin, bulkPatchClientDemo);

// New Client Onboarding queue (must be before /:id)
router.get('/onboarding-queue', getOnboardingQueue);
router.get('/provider-onboarding-queue', getProviderOnboardingQueue);

// Delete bulk-imported clients for an agency (admin only)
// DELETE /api/clients/bulk-import?agencyId=123&confirm=true
router.delete('/bulk-import', deleteBulkImportedClients);

// Bulk actions
router.post('/bulk/promote-school-year', bulkPromoteSchoolYear);
router.post('/bulk/rollover-school-year', rolloverSchoolYear);

// Get client detail
router.get('/:id', getClientById);
router.patch('/:id/demo', requireBackofficeAdmin, patchClientDemo);

// Create client
router.post('/', createClient);

// Update client
router.put('/:id', updateClient);

// Graduate client type (school -> learning -> clinical)
router.post('/:id/client-type', graduateClientType);

// Unarchive client (admin/staff/support/super_admin)
router.post('/:id/unarchive', unarchiveClient);

// Terminate client (support staff or assigned provider; requires termination_reason)
router.post('/:id/terminate', terminateClient);

// Update client status
router.put('/:id/status', updateClientStatus);

// Assign provider
router.put('/:id/provider', assignProvider);

// Get status history
router.get('/:id/history', getClientHistory);

// Get paperwork/document history (agency-only)
router.get('/:id/paperwork-history', getClientPaperworkHistory);

// Guardian waiver audit (admin/backoffice)
router.get('/:id/guardian-waiver-audit', requireBackofficeAdmin, getClientGuardianWaiverAudit);

// Create paperwork/document history entry (agency-only)
router.post('/:id/paperwork-history', createClientPaperworkHistory);

// Document status checklist (Needed/Received)
router.get('/:id/document-status', getClientDocumentStatus);
router.put('/:id/document-status', updateClientDocumentStatus);

// Access log (admin/support)
router.get('/:id/access-log', getClientAccessLog);

// Communications history (emails + SMS sent on behalf of / about this client,
// including messages addressed to linked guardians).
router.get('/:id/communications', listClientCommunications);
router.get('/:id/communications/email/:commId/body', getClientCommunicationBody);
router.get('/:id/sms-audit', listClientSmsAudit);

// Log a profile view (best-effort; called on panel mount)
router.post('/:id/log-view', logClientProfileView);

// Clinical responses from intake (provider/admin)
router.get('/:id/clinical-responses', getClientClinicalResponses);
router.put('/:id/clinical-responses', updateClientClinicalResponses);

// Insurance card images from intake (provider/admin) — streamed (decrypts if encrypted)
router.get('/:id/insurance-card', getClientInsuranceCard);

// Demographics from profile + latest intake (backfills legacy data)
router.get('/:id/demographics', getClientDemographics);

// Copy-ready chart blocks (demographics + scrubbed clinical text)
router.get('/:id/records-copy-blocks', getClientRecordsCopyBlocks);

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

// Role-based lifecycle Actions (agency intake, spring/fall, confirm services)
router.get('/:id/agency-intake', getClientAgencyIntake);
router.put('/:id/agency-intake', putClientAgencyIntake);
router.get('/:id/year-disposition', getClientYearDisposition);
router.get('/:id/lifecycle-history', getClientLifecycleHistoryHandler);
router.put('/:id/spring-update', putClientSpringUpdate);
router.put('/:id/fall-confirmation', putClientFallConfirmation);
router.put('/:id/agency-clearance', putClientAgencyClearance);
router.put('/:id/roi-followup', putClientRoiFollowup);
router.post('/:id/confirm-services-started', postConfirmServicesStarted);

// New Client Onboarding checklist
router.get('/:id/onboarding-checklist', getOnboardingChecklist);
router.put('/:id/onboarding-docs', putOnboardingDocs);
router.post('/:id/onboarding/mark-packet-signature', postMarkPacketSignature);
router.post('/:id/onboarding/waive-new-packet', postWaiveNewPacketFlag);
router.post('/:id/onboarding/acknowledge-roi-staff', postAcknowledgeRoiStaff);
router.put('/:id/onboarding/roi-expiration', putOnboardingRoiExpiration);
router.post('/:id/onboarding/complete-staff', postCompleteStaffOnboarding);

// Intake note pipeline (90791 / H0031 AI-assisted drafting)
router.get('/:id/intake-note', getClientIntakeNote);
router.post('/:id/intake-note/generate', generateClientIntakeNote);
router.post('/:id/intake-note/:draftId/diagnosis', confirmClientIntakeDiagnosis);
router.post('/:id/intake-note/:draftId/finalize', finalizeClientIntakeNote);

// Smart Disclosure status / require re-sign
router.get('/:id/disclosure', getClientDisclosure);
router.post('/:id/disclosure/require', requireClientDisclosure);

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
router.get('/:id/event-assignments', listClientEventAssignments);
router.get('/:id/event-registration-switch-options', listClientEventRegistrationSwitchOptions);
router.post('/:id/switch-event-registration', switchClientEventRegistrationHandler);
router.post('/:id/provider-assignments', upsertClientProviderAssignment);
router.delete('/:id/provider-assignments/:assignmentId', removeClientProviderAssignment);

// Guardians (admin or supervisor with client access can view; only admin can create/update/delete)
router.get('/:id/guardians', requireGuardianListAccess, listClientGuardians);
router.get('/:id/school-roi-access', listClientSchoolRoiAccess);
router.put('/:id/school-roi-access/:schoolStaffUserId', updateClientSchoolRoiAccess);
router.put('/:id/school-roi-expiration', updateClientSchoolRoiExpiration);
router.put('/:id/school-roi-signing-config', updateClientSchoolRoiSigningConfig);
router.post('/:id/school-roi-signing-link', issueClientSchoolRoiSigningLink);
router.post('/:id/school-roi-signing-link/copied', trackClientSchoolRoiSigningLinkCopied);
router.post('/:id/school-roi-signing-text', sendClientSchoolRoiSigningText);
router.post('/:id/school-roi-signing-email', sendClientSchoolRoiSigningEmail);
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

router.post('/bulk/delete-preview', requireBackofficeAdmin, getBulkClientsDeletePreviewHandler);
router.post('/bulk/delete-dev-fill', requireBackofficeAdmin, bulkDeleteDevFillClients);

// Permanently delete or compliance-archive a client (admin only)
router.get('/:id/delete-preview', requireBackofficeAdmin, getClientDeletePreviewHandler);
router.delete('/:id', requireBackofficeAdmin, deleteClient);

export default router;

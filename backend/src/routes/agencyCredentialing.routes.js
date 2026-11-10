import * as operations from '../controllers/credentialingOperations.controller.js';
import express from 'express';
import { body } from 'express-validator';
import { authenticate as sharedAuthenticate, requireActiveStatus as sharedActiveStatus } from '../middleware/auth.middleware.js';
import {getCredentialingOrganizations,getCredentialingWorkspace,updateCredentialingWorkflow,getCredentialingWorkflowHistory} from '../controllers/credentialingWorkspace.controller.js';
import {
  listAgencyProvidersCredentialing,
  patchAgencyProvidersCredentialing,
  downloadAgencyProvidersCredentialingCsv,
  deleteAgencyProvidersCredentialingField,
  listInsuranceDefinitions,
  createInsuranceDefinition,
  getInsuranceDefinition,
  updateInsuranceDefinition,
  deleteInsuranceDefinition,
  listCredentialingByInsurance,
  listUserCredentialing,
  upsertUserInsuranceCredentialing,
  updateUserInsuranceCredentialing,
  deleteUserInsuranceCredentialing,
  revealCredential,
  listCredentialingTimeline,
  uploadInsuranceDefinitionLogo,
  insuranceLogoUpload,
  listInsuranceContacts,
  createInsuranceContact,
  updateInsuranceContact,
  deleteInsuranceContact,
  listInsuranceInteractions,
  createInsuranceInteraction,
  updateInsuranceInteraction,
  deleteInsuranceInteraction,
  uploadProviderLicenseCredentialing,
  downloadProviderLicenseCredentialing,
  ocrProviderLicenseCredentialing,
  licenseUploadMulter,
  uploadUserInsuranceCredentialDocument,
  payerCredentialDocUpload
} from '../controllers/agencyCredentialing.controller.js';
import {
  listAgencyGroupNpis,
  createAgencyGroupNpi,
  updateAgencyGroupNpi,
  deleteAgencyGroupNpi,
  listAgencyGroupNpiPayerCredentialing,
  upsertAgencyGroupNpiPayerCredentialing,
  updateAgencyGroupNpiPayerCredentialing,
  deleteAgencyGroupNpiPayerCredentialing,
  uploadAgencyGroupNpiPayerDocument,
  payerCredentialDocUpload as groupNpiPayerDocUpload
} from '../controllers/agencyGroupNpi.controller.js';

export function createAgencyCredentialingRouter(authenticate = sharedAuthenticate, requireActiveStatus = sharedActiveStatus) {
const router = express.Router();
router.get('/credentialing/organizations',authenticate,requireActiveStatus,getCredentialingOrganizations);
router.get('/credentialing/workspace',authenticate,requireActiveStatus,getCredentialingWorkspace);
router.patch('/:agencyId/credentialing/workflow/:kind/:id',authenticate,requireActiveStatus,updateCredentialingWorkflow);
router.get('/:agencyId/credentialing/workflow/:kind/:id/history',authenticate,requireActiveStatus,getCredentialingWorkflowHistory);

// Documents and reminders share the same credentialing authorization as the editor.
router.get('/:agencyId/credentialing/insurances/:id/documents', authenticate, requireActiveStatus, operations.listPayerDocuments);
router.post('/:agencyId/credentialing/insurances/:id/documents', authenticate, requireActiveStatus, operations.authorizeCredentialingUpload, payerCredentialDocUpload.single('file'), operations.uploadPayerDocument);
router.get('/:agencyId/credentialing/insurances/:id/documents/:documentId', authenticate, requireActiveStatus, operations.downloadPayerDocument);
router.get('/:agencyId/credentialing/subjects/:kind/:id/documents/:documentType', authenticate, requireActiveStatus, operations.downloadExistingDocument);
router.patch('/:agencyId/credentialing/subjects/:kind/:id/notifications/read', authenticate, requireActiveStatus, operations.acknowledgeNotifications);
router.get('/:agencyId/credentialing/subjects/:kind/:id/reminders', authenticate, requireActiveStatus, operations.listReminders);
router.post('/:agencyId/credentialing/subjects/:kind/:id/reminders', authenticate, requireActiveStatus, operations.createReminder);
router.patch('/:agencyId/credentialing/subjects/:kind/:id/reminders/:reminderId', authenticate, requireActiveStatus, operations.finishReminder);
router.get('/:agencyId/credentialing/cases/:id/email', authenticate, requireActiveStatus, operations.getCaseEmail);
router.post('/:agencyId/credentialing/cases/:id/email', authenticate, requireActiveStatus, operations.createCaseEmail);
router.get('/:agencyId/credentialing/cases/:id/tickets', authenticate, requireActiveStatus, operations.listCaseTickets);
router.get('/:agencyId/credentialing/cases/:id/tickets/:ticketId', authenticate, requireActiveStatus, operations.getCaseTicket);
router.get('/:agencyId/credentialing/cases/:id/tickets/:ticketId/attachments/:attachmentId', authenticate, requireActiveStatus, operations.getCaseAttachment);

const validatePatch = [
  body('updates').isArray().withMessage('updates must be an array'),
  body('updates.*.userId').isInt({ min: 1 }).withMessage('userId must be an integer'),
  body('updates.*.fieldKey').isString().trim().notEmpty().withMessage('fieldKey required'),
  body('updates.*.value').optional({ nullable: true })
];

router.get('/:agencyId/credentialing/providers', authenticate, listAgencyProvidersCredentialing);
router.patch('/:agencyId/credentialing/providers', authenticate, validatePatch, patchAgencyProvidersCredentialing);
router.get('/:agencyId/credentialing/providers.csv', authenticate, downloadAgencyProvidersCredentialingCsv);
router.get('/:agencyId/credentialing/providers/:userId/license', authenticate, downloadProviderLicenseCredentialing);
router.post(
  '/:agencyId/credentialing/providers/:userId/license',
  authenticate,
  licenseUploadMulter.single('file'),
  uploadProviderLicenseCredentialing
);
router.post(
  '/:agencyId/credentialing/providers/:userId/license/ocr',
  authenticate,
  ocrProviderLicenseCredentialing
);

// Optional cleanup endpoint (purge stored values by field_key across providers in an agency)
router.delete('/:agencyId/credentialing/field/:fieldKey', authenticate, deleteAgencyProvidersCredentialingField);

// Insurance definitions CRUD
router.get('/:agencyId/credentialing/insurances', authenticate, listInsuranceDefinitions);
router.post('/:agencyId/credentialing/insurances', authenticate, createInsuranceDefinition);
router.get('/:agencyId/credentialing/insurances/:id', authenticate, getInsuranceDefinition);
router.patch('/:agencyId/credentialing/insurances/:id', authenticate, updateInsuranceDefinition);
router.delete('/:agencyId/credentialing/insurances/:id', authenticate, deleteInsuranceDefinition);
router.post(
  '/:agencyId/credentialing/insurances/:id/logo',
  authenticate,
  insuranceLogoUpload.single('logo'),
  uploadInsuranceDefinitionLogo
);

router.get('/:agencyId/credentialing/insurances/:id/contacts', authenticate, listInsuranceContacts);
router.post('/:agencyId/credentialing/insurances/:id/contacts', authenticate, createInsuranceContact);
router.patch('/:agencyId/credentialing/insurances/:id/contacts/:contactId', authenticate, updateInsuranceContact);
router.delete('/:agencyId/credentialing/insurances/:id/contacts/:contactId', authenticate, deleteInsuranceContact);

router.get('/:agencyId/credentialing/insurances/:id/interactions', authenticate, listInsuranceInteractions);
router.post('/:agencyId/credentialing/insurances/:id/interactions', authenticate, createInsuranceInteraction);
router.patch('/:agencyId/credentialing/insurances/:id/interactions/:interactionId', authenticate, updateInsuranceInteraction);
router.delete('/:agencyId/credentialing/insurances/:id/interactions/:interactionId', authenticate, deleteInsuranceInteraction);

// View by insurance
router.get('/:agencyId/credentialing/by-insurance', authenticate, listCredentialingByInsurance);

// User insurance credentialing (for credentialing tab)
router.get('/:agencyId/credentialing/users/:userId', authenticate, listUserCredentialing);
router.post('/:agencyId/credentialing/user-insurance', authenticate, upsertUserInsuranceCredentialing);
router.patch('/:agencyId/credentialing/user-insurance/:id', authenticate, updateUserInsuranceCredentialing);
router.delete('/:agencyId/credentialing/user-insurance', authenticate, deleteUserInsuranceCredentialing);
router.post(
  '/:agencyId/credentialing/user-insurance/:id/documents/:docType',
  authenticate,
  payerCredentialDocUpload.single('file'),
  uploadUserInsuranceCredentialDocument
);

// Credential reveal (decrypt)
router.post('/:agencyId/credentialing/reveal', authenticate, revealCredential);

// Agency (tenant) group NPIs — Type-2 NPIs tied to locations, with per-payer credentialing
router.get('/:agencyId/credentialing/group-npis', authenticate, listAgencyGroupNpis);
router.post('/:agencyId/credentialing/group-npis', authenticate, createAgencyGroupNpi);
router.patch('/:agencyId/credentialing/group-npis/:id', authenticate, updateAgencyGroupNpi);
router.delete('/:agencyId/credentialing/group-npis/:id', authenticate, deleteAgencyGroupNpi);
router.get(
  '/:agencyId/credentialing/group-npis/:id/payers',
  authenticate,
  listAgencyGroupNpiPayerCredentialing
);
router.post(
  '/:agencyId/credentialing/group-npi-insurance',
  authenticate,
  upsertAgencyGroupNpiPayerCredentialing
);
router.patch(
  '/:agencyId/credentialing/group-npi-insurance/:credId',
  authenticate,
  updateAgencyGroupNpiPayerCredentialing
);
router.delete(
  '/:agencyId/credentialing/group-npi-insurance',
  authenticate,
  deleteAgencyGroupNpiPayerCredentialing
);
router.post(
  '/:agencyId/credentialing/group-npi-insurance/:credId/documents/:docType',
  authenticate,
  groupNpiPayerDocUpload.single('file'),
  uploadAgencyGroupNpiPayerDocument
);

// Timeline
router.get('/:agencyId/credentialing/timeline', authenticate, listCredentialingTimeline);

return router;
}
export default createAgencyCredentialingRouter();

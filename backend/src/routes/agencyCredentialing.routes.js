import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware.js';
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
  uploadProviderLicenseAdmin,
  licenseFileUpload
} from '../controllers/agencyCredentialing.controller.js';

const router = express.Router();

const validatePatch = [
  body('updates').isArray().withMessage('updates must be an array'),
  body('updates.*.userId').isInt({ min: 1 }).withMessage('userId must be an integer'),
  body('updates.*.fieldKey').isString().trim().notEmpty().withMessage('fieldKey required'),
  body('updates.*.value').optional({ nullable: true })
];

router.get('/:agencyId/credentialing/providers', authenticate, listAgencyProvidersCredentialing);
router.patch('/:agencyId/credentialing/providers', authenticate, validatePatch, patchAgencyProvidersCredentialing);
router.get('/:agencyId/credentialing/providers.csv', authenticate, downloadAgencyProvidersCredentialingCsv);

// Admin license-copy upload for a specific provider
router.post(
  '/:agencyId/credentialing/providers/:userId/license-upload',
  authenticate,
  licenseFileUpload.single('file'),
  uploadProviderLicenseAdmin
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

// Credential reveal (decrypt)
router.post('/:agencyId/credentialing/reveal', authenticate, revealCredential);

// Timeline
router.get('/:agencyId/credentialing/timeline', authenticate, listCredentialingTimeline);

export default router;


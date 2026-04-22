import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { createIntakeLink, createIntakeLinkFromJob, deleteIntakeLink, duplicateIntakeLink, listIntakeLinks, updateIntakeLink, getLinkedTranslationAdmin } from '../controllers/intakeLinks.controller.js';

const router = express.Router();

router.use(authenticate, requireBackofficeAdmin);

router.get('/', listIntakeLinks);

router.post(
  '/',
  [
    body('title').optional().isString(),
    body('description').optional().isString(),
    body('languageCode').optional().isString(),
    body('scopeType').isIn(['agency', 'school', 'program', 'learning_class']).withMessage('scopeType must be agency, school, program, or learning_class'),
    body('formType').optional().isIn(['intake', 'public_form', 'job_application', 'medical_records_request', 'smart_school_roi', 'smart_registration', 'internal_preferences']),
    body('organizationId').optional().isInt(),
    body('programId').optional().isInt(),
    body('learningClassId').optional().isInt(),
    body('isActive').optional().isBoolean(),
    body('createClient').optional().isBoolean(),
    body('createGuardian').optional().isBoolean(),
    body('jobDescriptionId').optional().isInt(),
    body('requiresAssignment').optional().isBoolean(),
    body('retentionPolicy').optional().custom((val) => typeof val === 'object' || typeof val === 'string'),
    body('linkedEsFormId').optional({ nullable: true }).custom((val) => val === null || /^\d+$/.test(String(val))),
    body('documentTranslationMap').optional({ nullable: true })
  ],
  createIntakeLink
);

router.post('/from-job/:jobDescriptionId', createIntakeLinkFromJob);

router.put(
  '/:id',
  [
    body('title').optional().isString(),
    body('description').optional().isString(),
    body('languageCode').optional().isString(),
    body('scopeType').optional().isIn(['agency', 'school', 'program', 'learning_class']),
    body('formType').optional().isIn(['intake', 'public_form', 'job_application', 'medical_records_request', 'smart_school_roi', 'smart_registration', 'internal_preferences']),
    body('organizationId').optional().isInt(),
    body('programId').optional().isInt(),
    body('learningClassId').optional().isInt(),
    body('jobDescriptionId').optional().isInt(),
    body('requiresAssignment').optional().isBoolean(),
    body('isActive').optional().isBoolean(),
    body('createClient').optional().isBoolean(),
    body('createGuardian').optional().isBoolean(),
    body('retentionPolicy').optional().custom((val) => typeof val === 'object' || typeof val === 'string'),
    body('linkedEsFormId').optional({ nullable: true }).custom((val) => val === null || /^\d+$/.test(String(val))),
    body('documentTranslationMap').optional({ nullable: true })
  ],
  updateIntakeLink
);

router.post('/:id/duplicate', duplicateIntakeLink);

router.get('/:id/linked-translation', getLinkedTranslationAdmin);

router.delete('/:id', deleteIntakeLink);

export default router;

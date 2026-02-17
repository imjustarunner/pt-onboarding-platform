import express from 'express';
import { body } from 'express-validator';
import {
  uploadTemplate,
  createTemplate,
  getTemplates,
  getTemplate,
  getTemplateForTask,
  previewTemplate,
  updateTemplate,
  archiveTemplate,
  restoreTemplate,
  getArchivedTemplates,
  deleteTemplate,
  getVersionHistory,
  getTemplateVariables,
  duplicateTemplate,
  upload
} from '../controllers/documentTemplate.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateTemplate = [
  body('name').notEmpty().withMessage('Template name is required'),
  body('description').optional().isString(),
  body('htmlContent').optional().isString(),
  body('layoutType').optional().isIn(['standard', 'letter']).withMessage('layoutType must be standard or letter'),
  body('letterheadTemplateId').optional().custom((value) => {
    if (value === null || value === undefined || value === 'null' || value === '') return true;
    const intValue = typeof value === 'string' ? parseInt(value) : value;
    return Number.isInteger(intValue) && intValue > 0;
  }).withMessage('letterheadTemplateId must be null or a positive integer'),
  body('letterHeaderHtml').optional().custom((value) => value === null || value === undefined || typeof value === 'string')
    .withMessage('letterHeaderHtml must be null or a string'),
  body('letterFooterHtml').optional().custom((value) => value === null || value === undefined || typeof value === 'string')
    .withMessage('letterFooterHtml must be null or a string'),
  body('agencyId').optional().custom((value) => {
    // Allow null, undefined, or a valid integer
    if (value === null || value === undefined || value === 'null' || value === '') {
      return true;
    }
    const intValue = typeof value === 'string' ? parseInt(value) : value;
    return Number.isInteger(intValue) && intValue > 0;
  }).withMessage('Agency ID must be null or a positive integer'),
  body('organizationId').optional().custom((value) => {
    // Allow null, undefined, or a valid integer
    if (value === null || value === undefined || value === 'null' || value === '') {
      return true;
    }
    const intValue = typeof value === 'string' ? parseInt(value) : value;
    return Number.isInteger(intValue) && intValue > 0;
  }).withMessage('Organization ID must be null or a positive integer'),
  body('documentType').optional().isIn(['acknowledgment', 'authorization', 'agreement', 'compliance', 'disclosure', 'consent', 'audio_recording_consent', 'hipaa_security', 'administrative']).withMessage('Invalid document type'),
  body('isUserSpecific').optional().isBoolean().withMessage('isUserSpecific must be a boolean'),
  body('userId').optional().isInt().withMessage('User ID must be an integer')
];

// Separate validation for updates (name is optional, can update other fields)
const validateTemplateUpdate = [
  body('name').optional().notEmpty().withMessage('Template name cannot be empty if provided'),
  body('description').optional().custom((value) => {
    // Allow null, undefined, or a string
    if (value === null || value === undefined) {
      return true;
    }
    return typeof value === 'string';
  }).withMessage('Description must be null or a string'),
  body('htmlContent').optional().custom((value) => {
    // Allow null, undefined, or a string
    if (value === null || value === undefined) {
      return true;
    }
    return typeof value === 'string';
  }).withMessage('HTML content must be null or a string'),
  body('layoutType').optional().isIn(['standard', 'letter']).withMessage('layoutType must be standard or letter'),
  body('letterheadTemplateId').optional().custom((value) => {
    if (value === null || value === undefined || value === 'null' || value === '') return true;
    const intValue = typeof value === 'string' ? parseInt(value) : value;
    return Number.isInteger(intValue) && intValue > 0;
  }).withMessage('letterheadTemplateId must be null or a positive integer'),
  body('letterHeaderHtml').optional().custom((value) => value === null || value === undefined || typeof value === 'string')
    .withMessage('letterHeaderHtml must be null or a string'),
  body('letterFooterHtml').optional().custom((value) => value === null || value === undefined || typeof value === 'string')
    .withMessage('letterFooterHtml must be null or a string'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  body('createNewVersion').optional().isBoolean().withMessage('createNewVersion must be a boolean'),
  body('iconId').optional().custom((value) => {
    // Allow null, undefined, or a valid integer
    if (value === null || value === undefined || value === 'null' || value === '') {
      return true;
    }
    const intValue = typeof value === 'string' ? parseInt(value) : value;
    return Number.isInteger(intValue) && intValue > 0;
  }).withMessage('Icon ID must be null or a positive integer'),
  body('agencyId').optional().custom((value) => {
    // Allow null, undefined, or a valid integer
    if (value === null || value === undefined || value === 'null' || value === '') {
      return true;
    }
    const intValue = typeof value === 'string' ? parseInt(value) : value;
    return Number.isInteger(intValue) && intValue > 0;
  }).withMessage('Agency ID must be null or a positive integer'),
  body('organizationId').optional().custom((value) => {
    if (value === null || value === undefined || value === 'null' || value === '') return true;
    const intValue = typeof value === 'string' ? parseInt(value) : value;
    return Number.isInteger(intValue) && intValue > 0;
  }).withMessage('Organization ID must be null or a positive integer'),
  body('signatureX').optional().custom((value) => {
    if (value === null || value === undefined || value === 'null' || value === '') {
      return true;
    }
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return !isNaN(numValue) && numValue >= 0;
  }).withMessage('Signature X must be null or a non-negative number'),
  body('signatureY').optional().custom((value) => {
    if (value === null || value === undefined || value === 'null' || value === '') {
      return true;
    }
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return !isNaN(numValue) && numValue >= 0;
  }).withMessage('Signature Y must be null or a non-negative number'),
  body('signatureWidth').optional().custom((value) => {
    if (value === null || value === undefined || value === 'null' || value === '') {
      return true;
    }
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return !isNaN(numValue) && numValue > 0;
  }).withMessage('Signature width must be null or a positive number'),
  body('signatureHeight').optional().custom((value) => {
    if (value === null || value === undefined || value === 'null' || value === '') {
      return true;
    }
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return !isNaN(numValue) && numValue > 0;
  }).withMessage('Signature height must be null or a positive number'),
  body('signaturePage').optional().custom((value) => {
    if (value === null || value === undefined || value === 'null' || value === '' || value === 0) {
      return true;
    }
    const intValue = typeof value === 'string' ? parseInt(value) : value;
    return Number.isInteger(intValue) && intValue > 0;
  }).withMessage('Signature page must be null or a positive integer'),
  body('documentType').optional().isIn(['acknowledgment', 'authorization', 'agreement', 'compliance', 'disclosure', 'consent', 'audio_recording_consent', 'hipaa_security', 'administrative']).withMessage('Invalid document type'),
  body('isUserSpecific').optional().isBoolean().withMessage('isUserSpecific must be a boolean'),
  body('userId').optional().isInt().withMessage('User ID must be an integer')
];

const validateUserSpecificUpload = [
  body('name').notEmpty().withMessage('Template name is required'),
  body('userId').isInt().withMessage('User ID is required and must be an integer'),
  body('documentType').isIn(['acknowledgment', 'authorization', 'agreement', 'compliance', 'disclosure', 'consent', 'audio_recording_consent', 'hipaa_security', 'administrative']).withMessage('Invalid document type'),
  body('documentActionType').isIn(['signature', 'review']).withMessage('Document action type must be signature or review'),
  body('dueDate').optional().isISO8601().withMessage('Due date must be a valid ISO 8601 date')
];

// All routes require authentication and admin access
router.get('/variables', authenticate, requireBackofficeAdmin, getTemplateVariables); // Public endpoint for variables
router.post('/upload', authenticate, requireBackofficeAdmin, upload.single('file'), uploadTemplate);
router.post('/', authenticate, requireBackofficeAdmin, validateTemplate, createTemplate);
router.get('/', authenticate, requireBackofficeAdmin, getTemplates);
router.get('/archived', authenticate, requireBackofficeAdmin, getArchivedTemplates); // Must come before /:id
router.get('/:id/task', authenticate, getTemplateForTask); // Allow users to access templates for their assigned tasks
router.get('/:id/preview', authenticate, previewTemplate);
router.get('/:id', authenticate, requireBackofficeAdmin, getTemplate);
router.put('/:id', authenticate, requireBackofficeAdmin, validateTemplateUpdate, updateTemplate);
router.post('/:id/archive', authenticate, requireBackofficeAdmin, archiveTemplate);
router.post('/:id/restore', authenticate, requireBackofficeAdmin, restoreTemplate);
router.post('/:id/duplicate', authenticate, requireBackofficeAdmin, duplicateTemplate);
router.delete('/:id', authenticate, requireBackofficeAdmin, deleteTemplate);
router.get('/versions/history', authenticate, requireBackofficeAdmin, getVersionHistory);

export default router;


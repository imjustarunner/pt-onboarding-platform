import express from 'express';
import { body } from 'express-validator';
import {
  getAllFieldDefinitions,
  getFieldDefinitionById,
  getPlatformTemplates,
  getAgencyFields,
  createFieldDefinition,
  updateFieldDefinition,
  deleteFieldDefinition,
  pushToAgency
} from '../controllers/userInfoFieldDefinition.controller.js';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateFieldDefinition = [
  body('fieldLabel').trim().notEmpty().withMessage('Field label is required'),
  body('fieldKey').optional().trim(),
  body('fieldType').isIn(['text', 'number', 'date', 'email', 'phone', 'select', 'multi_select', 'textarea', 'boolean']).withMessage('Invalid field type'),
  body('options').optional().custom((value) => {
    if (value && typeof value !== 'object' && !Array.isArray(value)) {
      throw new Error('Options must be an object or array');
    }
    return true;
  }),
  body('isRequired').optional().isBoolean(),
  body('isPlatformTemplate').optional().isBoolean(),
  body('agencyId').optional().isInt({ min: 1 }),
  body('parentFieldId').optional().isInt({ min: 1 }),
  body('orderIndex').optional().isInt({ min: 0 })
];

router.get('/platform-templates', authenticate, getPlatformTemplates);
router.get('/agencies/:agencyId/fields', authenticate, getAgencyFields);
router.get('/', authenticate, getAllFieldDefinitions);
router.get('/:id', authenticate, getFieldDefinitionById);
router.post('/', authenticate, requireAdmin, validateFieldDefinition, createFieldDefinition);
router.put('/:id', authenticate, requireAdmin, validateFieldDefinition, updateFieldDefinition);
router.delete('/:id', authenticate, requireAdmin, deleteFieldDefinition);
router.post('/:id/push-to-agency', authenticate, requireSuperAdmin, pushToAgency);

export default router;


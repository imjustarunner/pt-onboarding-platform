import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import {
  getIconTemplates,
  getIconTemplate,
  createIconTemplate,
  updateIconTemplate,
  deleteIconTemplate
} from '../controllers/iconTemplate.controller.js';

const router = express.Router();

const validateIconTemplate = [
  body('name').trim().notEmpty().withMessage('Template name is required'),
  body('description').optional().trim(),
  body('scope').isIn(['platform', 'agency']).withMessage('Scope must be platform or agency'),
  body('agencyId').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    const num = parseInt(value, 10);
    if (isNaN(num)) throw new Error('Agency ID must be an integer');
    return true;
  }),
  body('isShared').optional().custom((value) => {
    if (value === undefined || value === null) return true;
    return typeof value === 'boolean' || value === 'true' || value === 'false';
  }).withMessage('isShared must be a boolean'),
  body('iconData').optional().custom((value) => {
    if (value === undefined || value === null) return true;
    return typeof value === 'object' && !Array.isArray(value);
  }).withMessage('iconData must be an object')
];

router.get('/', authenticate, getIconTemplates);
router.get('/:id', authenticate, getIconTemplate);
router.post('/', authenticate, requireBackofficeAdmin, validateIconTemplate, createIconTemplate);
router.put('/:id', authenticate, requireBackofficeAdmin, validateIconTemplate, updateIconTemplate);
router.delete('/:id', authenticate, requireBackofficeAdmin, deleteIconTemplate);

export default router;


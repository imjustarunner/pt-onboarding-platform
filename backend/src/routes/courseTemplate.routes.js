import express from 'express';
import { body } from 'express-validator';
import {
  getCourseTemplates,
  getCourseTemplateById,
  createFromTemplate
} from '../controllers/courseTemplate.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', authenticate, requireBackofficeAdmin, getCourseTemplates);
router.get('/:id', authenticate, requireBackofficeAdmin, getCourseTemplateById);
router.post('/:id/instantiate', authenticate, requireBackofficeAdmin, [
  body('agencyId').optional({ nullable: true }).isInt({ min: 1 }),
  body('trainingFocusId').optional({ nullable: true }).isInt({ min: 1 }),
  body('createFocus').optional().isBoolean(),
  body('customTitle').optional({ nullable: true }).trim()
], createFromTemplate);

export default router;

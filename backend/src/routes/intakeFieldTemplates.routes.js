import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import {
  createIntakeFieldTemplate,
  listIntakeFieldTemplates,
  updateIntakeFieldTemplate,
  deleteIntakeFieldTemplate
} from '../controllers/intakeFieldTemplates.controller.js';

const router = express.Router();

router.use(authenticate, requireBackofficeAdmin);

router.get('/', listIntakeFieldTemplates);

router.post(
  '/',
  [
    body('agencyId').isInt().withMessage('agencyId is required'),
    body('name').notEmpty().withMessage('name is required'),
    body('fieldsJson').optional(),
    body('templateType').optional()
  ],
  createIntakeFieldTemplate
);

router.put('/:id', updateIntakeFieldTemplate);

router.delete('/:id', deleteIntakeFieldTemplate);

export default router;

import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireAgencyAdmin, requireAgencyAccess } from '../middleware/auth.middleware.js';
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment
} from '../controllers/agencyDepartments.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/:agencyId/departments', requireAgencyAccess, listDepartments);

router.post(
  '/:agencyId/departments',
  requireAgencyAdmin,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('displayOrder').optional().isInt({ min: 0 }),
    body('settings').optional().isObject()
  ],
  createDepartment
);

router.put(
  '/:agencyId/departments/:id',
  requireAgencyAdmin,
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('displayOrder').optional().isInt({ min: 0 }),
    body('settings').optional().isObject(),
    body('isActive').optional().isBoolean()
  ],
  updateDepartment
);

router.delete('/:agencyId/departments/:id', requireAgencyAdmin, deleteDepartment);

export default router;

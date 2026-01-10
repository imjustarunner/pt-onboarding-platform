import express from 'express';
import { body } from 'express-validator';
import { getAllAccountTypes, getAccountTypeById, createAccountType, updateAccountType, deleteAccountType, pushToAgency } from '../controllers/accountType.controller.js';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateAccountType = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').optional().trim(),
  body('isPlatformTemplate').optional().isBoolean(),
  body('agencyId').optional().isInt({ min: 1 })
];

router.get('/', authenticate, getAllAccountTypes);
router.get('/:id', authenticate, getAccountTypeById);
router.post('/', authenticate, requireAdmin, validateAccountType, createAccountType);
router.put('/:id', authenticate, requireAdmin, validateAccountType, updateAccountType);
router.delete('/:id', authenticate, requireAdmin, deleteAccountType);
router.post('/:id/push-to-agency', authenticate, requireSuperAdmin, pushToAgency);

export default router;


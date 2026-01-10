import express from 'express';
import { body } from 'express-validator';
import { getUserAccounts, createUserAccount, updateUserAccount, deleteUserAccount } from '../controllers/userAccount.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateUserAccount = [
  body('accountName').trim().notEmpty().withMessage('Account name is required'),
  body('accountTypeId').optional().isInt({ min: 1 }),
  body('username').optional().trim(),
  body('pin').optional().trim(),
  body('temporaryPassword').optional().trim(),
  body('temporaryLink').optional().trim().isURL().withMessage('Temporary link must be a valid URL'),
  body('agencyId').optional().isInt({ min: 1 })
];

router.get('/:userId/accounts', authenticate, getUserAccounts);
router.post('/:userId/accounts', authenticate, validateUserAccount, createUserAccount);
router.put('/:userId/accounts/:accountId', authenticate, validateUserAccount, updateUserAccount);
router.delete('/:userId/accounts/:accountId', authenticate, deleteUserAccount);

export default router;


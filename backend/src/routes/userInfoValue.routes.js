import express from 'express';
import { body } from 'express-validator';
import {
  getUserInfo,
  updateUserInfo,
  updateUserInfoField,
  deleteUserInfoField,
  getLeaveOfAbsence,
  putLeaveOfAbsence
} from '../controllers/userInfoValue.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateUserInfo = [
  body('values').isArray().withMessage('Values must be an array'),
  body('values.*.fieldDefinitionId').isInt({ min: 1 }).withMessage('Field definition ID is required'),
  body('values.*.value').optional()
];

const validateUserInfoField = [
  body('value').optional()
];

router.get('/users/:userId/user-info', authenticate, getUserInfo);
router.post('/users/:userId/user-info', authenticate, validateUserInfo, updateUserInfo);
router.put('/users/:userId/user-info/:fieldId', authenticate, validateUserInfoField, updateUserInfoField);
router.delete('/users/:userId/user-info/:fieldId', authenticate, deleteUserInfoField);
router.get('/users/:userId/leave-of-absence', authenticate, getLeaveOfAbsence);
router.put('/users/:userId/leave-of-absence', authenticate, putLeaveOfAbsence);

export default router;


import express from 'express';
import { body } from 'express-validator';
import { saveSignature, getSignature } from '../controllers/signature.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateSignature = [
  body('moduleId').isInt({ min: 1 }),
  body('signatureData').notEmpty().withMessage('Signature data is required')
];

router.post('/', authenticate, validateSignature, saveSignature);
router.get('/:moduleId', authenticate, getSignature);

export default router;


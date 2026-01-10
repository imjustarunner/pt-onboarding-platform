import express from 'express';
import { body } from 'express-validator';
import { acknowledgeModule, getAcknowledgment, getUserAcknowledgments, checkAcknowledgment } from '../controllers/acknowledgment.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateAcknowledgment = [
  body('moduleId').isInt({ min: 1 })
];

router.post('/', authenticate, validateAcknowledgment, acknowledgeModule);
router.get('/', authenticate, getUserAcknowledgments);
router.get('/:moduleId', authenticate, checkAcknowledgment);
router.get('/:moduleId/details', authenticate, getAcknowledgment);

export default router;


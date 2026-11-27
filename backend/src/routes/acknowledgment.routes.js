import express from 'express';
import { requireTrainingModuleAccess } from '../middleware/trainingModuleAccess.middleware.js';
import { body } from 'express-validator';
import { acknowledgeModule, getAcknowledgment, getUserAcknowledgments, checkAcknowledgment } from '../controllers/acknowledgment.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateAcknowledgment = [
  body('moduleId').isInt({ min: 1 })
];

const authorizePlotlineLesson = (req, res, next) =>
  req.plotlineCompanyId ? requireTrainingModuleAccess(req, res, next) : next();

router.post('/', authenticate, validateAcknowledgment, authorizePlotlineLesson, acknowledgeModule);
router.get('/', authenticate, getUserAcknowledgments);
router.get('/:moduleId', authenticate, authorizePlotlineLesson, checkAcknowledgment);
router.get('/:moduleId/details', authenticate, authorizePlotlineLesson, getAcknowledgment);

export default router;


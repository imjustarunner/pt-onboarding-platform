import express from 'express';
import { body } from 'express-validator';
import { listSaved, saveCourse, unsaveCourse } from '../controllers/trainingSaved.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', authenticate, listSaved);
router.post('/', authenticate, [
  body('itemId').isInt({ min: 1 }),
  body('itemType').optional().isIn(['module', 'focus'])
], saveCourse);
router.delete('/:itemType/:itemId', authenticate, unsaveCourse);

export default router;
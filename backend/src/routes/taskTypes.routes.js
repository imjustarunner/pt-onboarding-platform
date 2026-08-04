import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listTaskTypes,
  createAgencyTaskType,
  createPlatformTaskType,
  updateTaskType,
  setTaskTypePref
} from '../controllers/taskTypes.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/', listTaskTypes);
router.post('/agency', createAgencyTaskType);
router.post('/platform', createPlatformTaskType);
router.put('/:id', updateTaskType);
router.put('/:id/pref', setTaskTypePref);

export default router;

import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listLearningProgramClasses,
  getLearningProgramClass,
  createLearningProgramClass,
  updateLearningProgramClass,
  duplicateLearningProgramClass,
  upsertClassClientMembers,
  upsertClassProviderMembers,
  listClassResources,
  createClassResource,
  updateClassResource,
  deleteClassResource,
  listMyLearningClasses
} from '../controllers/learningProgramClasses.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/my', listMyLearningClasses);
router.get('/', listLearningProgramClasses);
router.post('/', createLearningProgramClass);
router.get('/:classId', getLearningProgramClass);
router.put('/:classId', updateLearningProgramClass);
router.post('/:classId/duplicate', duplicateLearningProgramClass);
router.put('/:classId/clients', upsertClassClientMembers);
router.put('/:classId/providers', upsertClassProviderMembers);
router.get('/:classId/resources', listClassResources);
router.post('/:classId/resources', createClassResource);
router.put('/:classId/resources/:resourceId', updateClassResource);
router.delete('/:classId/resources/:resourceId', deleteClassResource);

export default router;

import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getPublicClassJoinInfo,
  resolveAuthenticatedClassJoin,
  listClassSessions,
  createClassSession,
  getClassSession,
  startClassSession,
  endClassSession,
  getClassSessionVideoToken,
  listSessionRoles,
  upsertSessionRole,
  listSessionSlides,
  createSessionSlide,
  updateSessionSlide,
  syncSessionPresentationState,
  listSessionActivity,
  postSessionActivity,
  createHandRaise,
  resolveHandRaise,
  scoreSessionEvidence,
  getInPersonPlan,
  patchInPersonPlan,
  duplicateInPersonPlan,
  listInPersonMaterials,
  postInPersonMaterial,
  patchInPersonMaterial,
  deleteInPersonMaterialController,
  getInPersonMaterialFileController,
  getInPersonMaterialResponseController,
  putInPersonMaterialResponseController,
  downloadInPersonMaterialResponseController,
  inPersonAiAssist,
  inPersonMaterialUpload
} from '../controllers/learningClassSessions.controller.js';

const router = express.Router();

router.get('/join-info/:classId', getPublicClassJoinInfo);

router.use(authenticate);

router.get('/classes/:classId/join-resolve', resolveAuthenticatedClassJoin);
router.get('/classes/:classId/sessions', listClassSessions);
router.post('/classes/:classId/sessions', createClassSession);

router.get('/sessions/:sessionId', getClassSession);
router.post('/sessions/:sessionId/start', startClassSession);
router.post('/sessions/:sessionId/end', endClassSession);
router.get('/sessions/:sessionId/video-token', getClassSessionVideoToken);

router.get('/sessions/:sessionId/roles', listSessionRoles);
router.put('/sessions/:sessionId/roles', upsertSessionRole);

router.get('/sessions/:sessionId/slides', listSessionSlides);
router.post('/sessions/:sessionId/slides', createSessionSlide);
router.patch('/sessions/:sessionId/slides/:slideId', updateSessionSlide);
router.put('/sessions/:sessionId/state', syncSessionPresentationState);

router.get('/sessions/:sessionId/activity', listSessionActivity);
router.post('/sessions/:sessionId/activity', postSessionActivity);

router.post('/sessions/:sessionId/hand-raises', createHandRaise);
router.patch('/sessions/:sessionId/hand-raises/:handRaiseId', resolveHandRaise);

router.post('/sessions/:sessionId/score-evidence', scoreSessionEvidence);

router.get('/sessions/:sessionId/in-person-plan', getInPersonPlan);
router.patch('/sessions/:sessionId/in-person-plan', patchInPersonPlan);
router.post('/sessions/:sessionId/in-person-plan/duplicate-from/:sourceSessionId', duplicateInPersonPlan);

router.get('/sessions/:sessionId/in-person-materials', listInPersonMaterials);
router.post('/sessions/:sessionId/in-person-materials', inPersonMaterialUpload.single('file'), postInPersonMaterial);
router.patch('/sessions/:sessionId/in-person-materials/:materialId', patchInPersonMaterial);
router.delete('/sessions/:sessionId/in-person-materials/:materialId', deleteInPersonMaterialController);
router.get('/sessions/:sessionId/in-person-materials/:materialId/file', getInPersonMaterialFileController);
router.get('/sessions/:sessionId/in-person-materials/:materialId/response', getInPersonMaterialResponseController);
router.put('/sessions/:sessionId/in-person-materials/:materialId/response', putInPersonMaterialResponseController);
router.get('/sessions/:sessionId/in-person-materials/:materialId/download', downloadInPersonMaterialResponseController);

router.post('/sessions/:sessionId/in-person-ai-assist', inPersonAiAssist);

export default router;

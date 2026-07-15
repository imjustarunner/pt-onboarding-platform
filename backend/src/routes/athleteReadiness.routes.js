import { Router } from 'express';
import * as ctrl from '../controllers/athleteReadiness.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

// Public guest flow (localStorage + optional server draft via token)
router.get('/guest/template', ctrl.getGuestTemplate);
router.post('/guest/assessments', ctrl.createGuestAssessment);
router.get('/guest/assessments/:token', ctrl.getByToken);
router.patch('/guest/assessments/:token/responses', ctrl.upsertResponseByToken);
router.post('/guest/assessments/:token/complete', ctrl.completeByToken);

// Authenticated athlete/coach API
router.get('/template', authenticate, ctrl.getTemplate);
router.get('/mine', authenticate, ctrl.listMine);
router.post('/assessments', authenticate, ctrl.createAssessment);
router.get('/assessments/:id', authenticate, ctrl.getAssessment);
router.patch('/assessments/:id/responses', authenticate, ctrl.upsertResponse);
router.post('/assessments/:id/complete', authenticate, ctrl.completeAssessment);

export default router;

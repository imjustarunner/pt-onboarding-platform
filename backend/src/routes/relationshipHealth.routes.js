import { Router } from 'express';
import * as ctrl from '../controllers/relationshipHealth.controller.js';

const router = Router();

router.get('/guest/template', ctrl.getGuestTemplate);
router.post('/guest/cycles', ctrl.createGuestCycle);
router.get('/guest/partners/:token', ctrl.getByToken);
router.patch('/guest/partners/:token/responses', ctrl.upsertResponseByToken);
router.post('/guest/partners/:token/submit', ctrl.submitByToken);
router.patch('/guest/partners/:token/priorities', ctrl.updatePrioritiesByToken);
router.patch('/guest/partners/:token/plans', ctrl.updatePlansByToken);

export default router;

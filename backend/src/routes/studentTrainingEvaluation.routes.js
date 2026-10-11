import express from 'express';
import { trainingScope, listTrainingEvaluations, getTrainingEvaluation, createTrainingEvaluation, saveTrainingEvaluation } from '../services/studentTrainingEvaluation.service.js';

// Mounted below the evaluations router's authenticate middleware.
const router = express.Router();
const handler = action => async (req, res, next) => {
  try {
    const scope = await trainingScope(req.user, req.query.agencyId || req.body?.agencyId);
    res.set('Cache-Control', 'private, no-store');
    res.json(await action(scope, req));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: { message: error.message } });
    next(error);
  }
};
router.get('/', handler(scope => listTrainingEvaluations(scope)));
router.get('/:id', handler((scope, req) => getTrainingEvaluation(scope, req.params.id)));
router.post('/', handler((scope, req) => createTrainingEvaluation(scope, req.body || {})));
router.put('/:id', handler((scope, req) => saveTrainingEvaluation(scope, req.params.id, req.body || {})));
router.post('/:id/submit', handler((scope, req) => saveTrainingEvaluation(scope, req.params.id, req.body || {}, { submit: true })));
export default router;

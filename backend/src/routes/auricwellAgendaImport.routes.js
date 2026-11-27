import express from 'express';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { auricwellAgendaImporter } from '../services/auricwellAgendaImport.service.js';

import { providerPlannerDay, providerPlannerOfficeOptions } from '../services/providerDayPlanner.service.js';

const router = express.Router();
router.use(authenticate, requireActiveStatus);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});
const run = operation => async (req, res, next) => {
  try { res.json(await operation(req)); }
  catch (error) {
    if (error.status) return res.status(error.status).json({ error: { message: error.message, code: error.code }, ...(error.preview ? { preview: error.preview } : {}) });
    next(error);
  }
};
router.get('/planner/options', run(req => auricwellAgendaImporter.options({
  actor: req.user, agencyId: req.query.agencyId, providerId: req.query.providerId, planner: true
})));
router.get('/planner/day', run(req => providerPlannerDay(req.user, req.query)));
router.get('/planner/office-options', run(req => providerPlannerOfficeOptions(req.user, req.query)));
router.post('/planner/preview', run(req => auricwellAgendaImporter.preview({ actor: req.user, input: req.body || {}, planner: true })));
router.post('/planner/commit', run(req => auricwellAgendaImporter.commit({ actor: req.user, input: req.body || {}, planner: true })));

router.use((req, res, next) => {
  if (!['admin', 'super_admin'].includes(String(req.user?.role || '').toLowerCase())) {
    return res.status(403).json({ error: { message: 'Practice administrator access is required.' } });
  }
  next();
});
router.get('/options', run(req => auricwellAgendaImporter.options({ actor: req.user, agencyId: req.query.agencyId, providerId: req.query.providerId })));
router.post('/preview', run(req => auricwellAgendaImporter.preview({ actor: req.user, input: req.body || {} })));
router.post('/commit', run(req => auricwellAgendaImporter.commit({ actor: req.user, input: req.body || {} })));
export default router;

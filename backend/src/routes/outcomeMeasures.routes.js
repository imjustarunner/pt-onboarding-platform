import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getUserCapabilities } from '../utils/capabilities.js';
import { logClientAccess } from '../services/clientAccessLog.service.js';
import { outcomeCatalogFor, assertMeasureRole, listOutcomeResponses, saveOutcomeResponse, reviewOutcomeResponse } from '../services/outcomeMeasures.service.js';
const router = Router();
router.use(authenticate);
router.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
const handle = fn => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (error) { res.status(error.status || 503).json({ error: { message: error.status ? error.message : 'Outcome measures are temporarily unavailable. Please try again.' } }); }
};
router.get('/catalog', handle(async req => {
  // Blank instruments and rights notes only. No clinical responses enter the library.
  if (!getUserCapabilities(req.user, { effectiveRole: req.user?.effectiveRole }).canViewLibrary) assertMeasureRole(req.user);
  return outcomeCatalogFor(req.user, { clientId: req.query.clientId, agencyId: req.query.agencyId });
}));
router.get('/clients/:clientId', handle(async req => {
  const responses = await listOutcomeResponses(req.user, req.params.clientId);
  await logClientAccess(req, req.params.clientId, 'view_outcome_measures');
  return { responses };
}));
router.post('/clients/:clientId', handle(async req => {
  const response = await saveOutcomeResponse(req.user, req.params.clientId, req.body);
  await logClientAccess(req, req.params.clientId, 'record_outcome_measure');
  return { response };
}));
router.post('/clients/:clientId/:responseId/review', handle(async req => {
  const result = await reviewOutcomeResponse(req.user, req.params.clientId, req.params.responseId, req.body);
  await logClientAccess(req, req.params.clientId, 'review_outcome_measure');
  return result;
}));
export default router;

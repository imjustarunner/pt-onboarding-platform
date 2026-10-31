import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.middleware.js';
import { getSchoolContactPlan, saveSchoolContactPlan, sendSchoolContactExample } from '../services/schoolContactPlan.service.js';

const router = express.Router();
router.use(authenticate);
const input = req => ({ agencyId: req.query.agencyId || req.headers['x-agency-id'], userId: req.user.id });
router.get('/', async (req, res, next) => { try { res.json(await getSchoolContactPlan(input(req))); } catch (error) { next(error); } });
router.put('/', async (req, res, next) => { try { res.json(await saveSchoolContactPlan(input(req), req.body)); } catch (error) { next(error); } });
router.get('/workflows', async (req, res, next) => {
  try {
    const { getContactPlanContext } = await import('../services/schoolContactPlan.service.js');
    const ctx = await getContactPlanContext(input(req));
    const { listSchoolContactWorkflows } = await import('../services/schoolContactAutomation.service.js');
    const clientId = req.query.clientId === undefined ? null : Number(req.query.clientId);
    if (clientId !== null && (!Number.isSafeInteger(clientId) || clientId < 1)) return res.status(400).json({ error: { message: 'Choose a valid client.' } });
    res.json(await listSchoolContactWorkflows({ agencyId: ctx.agencyId, providerUserId: ctx.userId, clientId }));
  } catch (error) { next(error); }
});
router.post('/workflows/:id/parent-replied', async (req, res, next) => {
  try {
    const { getContactPlanContext } = await import('../services/schoolContactPlan.service.js');
    const ctx = await getContactPlanContext(input(req));
    const workflowId = Number(req.params.id);
    if (!Number.isSafeInteger(workflowId) || workflowId < 1) return res.status(400).json({ error: { message: 'Choose a valid contact workflow.' } });
    const { markSchoolContactWorkflowReplied } = await import('../services/schoolContactAutomation.service.js');
    res.json(await markSchoolContactWorkflowReplied({ agencyId: ctx.agencyId, providerUserId: ctx.userId, workflowId }));
  } catch (error) { next(error); }
});
router.post('/example', rateLimit({ windowMs: 10 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false }),
  async (req, res, next) => { try { res.json(await sendSchoolContactExample(input(req), req.body)); } catch (error) { next(error); } });
export default router;

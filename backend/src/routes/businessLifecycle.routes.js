import express from 'express';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import { authenticate, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { createBusinessLifecycleService } from '../services/businessLifecycle.service.js';
import { BusinessLifecycleError } from '../services/businessLifecyclePolicy.js';
import { createBusinessLifecycleAccess } from '../middleware/businessLifecycleAccess.js';

const service = createBusinessLifecycleService(pool);
const router = express.Router();
router.use(authenticate, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
// Contract and business notes are restricted to the company's administrators.
export const authorizeBusinessLifecycle = createBusinessLifecycleAccess(id => User.getAgencies(id));
const run = fn => async (req, res, next) => {
  try { res.json(await fn(req)); }
  catch (error) {
    if (error instanceof BusinessLifecycleError) return res.status(error.status).json({ error: { message: error.message } });
    // Do not expose SQL parameters containing business notes or contract terms.
    res.status(503).json({ error: { message: 'The business journey could not be loaded or saved. Please try again.' } });
  }
};
router.get('/requests/:requestId', requireSuperAdmin, run(req => service.get({ requestId: req.params.requestId })));
router.put('/requests/:requestId', requireSuperAdmin, run(req => service.save({ requestId: req.params.requestId }, req.body, req.user)));
router.get('/companies/:agencyId', authorizeBusinessLifecycle, run(req => service.get({ agencyId: req.params.agencyId })));
router.put('/companies/:agencyId', authorizeBusinessLifecycle, run(req => service.save({ agencyId: req.params.agencyId }, req.body, req.user)));
export default router;

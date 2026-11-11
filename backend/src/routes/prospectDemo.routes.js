import express from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcrypt';
import pool from '../config/database.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { createProspectDemoService } from '../services/prospectDemo.service.js';

const router = express.Router();
const service = createProspectDemoService({ database: pool, hashPassword: value => bcrypt.hash(value, 12) });
const run = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/public/:surface/:alias', rateLimit({ windowMs: 60000, max: 120, standardHeaders: true, legacyHeaders: false }), run(async (req, res) => {
  const page = await service.publicPage(req.params.alias, req.params.surface);
  if (page.status === 'DEMO') res.set('X-Robots-Tag', 'noindex, nofollow');
  res.json(page);
}));
router.use(authenticate, requireBackofficeAdmin);
router.get('/:agencyId', run(async (req, res) => res.json(await service.summary(req.params.agencyId, req.user))));
router.patch('/:agencyId/employees/:userId', run(async (req, res) => res.json(await service.updateEmployee(req.params.agencyId, req.params.userId, req.body.email, req.user))));
router.post('/:agencyId/clear', run(async (req, res) => res.json(await service.clearFixtures(req.params.agencyId, req.user, { confirmSlug: req.body.confirmSlug }))));
router.post('/:agencyId/activate', run(async (req, res) => res.json(await service.clearFixtures(req.params.agencyId, req.user, { activate: true, confirmSlug: req.body.confirmSlug }))));
export default router;

import express from 'express';
import * as ctrl from '../controllers/schoolOnboarding.controller.js';
import { authenticateOptional } from '../middleware/auth.middleware.js';

const router = express.Router();

// QR self-serve (must be before /:token)
router.get('/qr/:token', ctrl.getPublicQr);
router.post('/qr/:token/start', ctrl.startFromQr);

// Standalone Hogwarts portal demo (no invite/login required)
router.get('/demo/school', ctrl.getPublicStandaloneDemoSchoolMeta);
router.use('/demo/portal', (req, res, next) => {
  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return ctrl.getPublicStandaloneDemoPortal(req, res, next);
  return ctrl.mutatePublicStandaloneDemoPortal(req, res, next);
});
router.get('/demo', ctrl.getPublicStandaloneDemo);

router.get('/:token', ctrl.getPublicByToken);
router.post('/:token/password', ctrl.setPassword);
router.put('/:token/steps/:stepKey', authenticateOptional, ctrl.saveStep);
router.get('/:token/demo/snapshot', ctrl.getDemoSnapshot);
router.get('/:token/demo/school', ctrl.getDemoSchoolMeta);
router.use('/:token/demo/portal', (req, res, next) => {
  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return ctrl.getDemoPortal(req, res, next);
  return ctrl.mutateDemoPortal(req, res, next);
});
router.get('/:token/demo', ctrl.getDemo);
router.post('/:token/submit', ctrl.submit);

export default router;

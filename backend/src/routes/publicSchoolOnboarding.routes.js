import express from 'express';
import * as ctrl from '../controllers/schoolOnboarding.controller.js';

const router = express.Router();

// QR self-serve (must be before /:token)
router.get('/qr/:token', ctrl.getPublicQr);
router.post('/qr/:token/start', ctrl.startFromQr);

router.get('/:token', ctrl.getPublicByToken);
router.post('/:token/password', ctrl.setPassword);
router.put('/:token/steps/:stepKey', ctrl.saveStep);
router.get('/:token/demo', ctrl.getDemo);
router.post('/:token/submit', ctrl.submit);

export default router;

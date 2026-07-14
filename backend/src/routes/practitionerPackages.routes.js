import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listPackages,
  createPackage,
  updatePackage,
  sendClientPacket,
  getPublicPacket,
  postPublicPacketSelect,
  postPublicPacketCheckout,
  postPublicPacketConfirm,
  postPublicPacketMarkIntake,
  postPublicPacketCreateAccount,
  getClientBalance,
  postSessionCompletedDebit,
  postMissedSession,
  getClientPackageOverview,
  postBookCoachingSession,
  getDashboardOverview
} from '../controllers/practitionerPackages.controller.js';

const router = express.Router();

router.get('/public/packets/:token', getPublicPacket);
router.post('/public/packets/:token/select', postPublicPacketSelect);
router.post('/public/packets/:token/checkout', postPublicPacketCheckout);
router.post('/public/packets/:token/confirm', postPublicPacketConfirm);
router.post('/public/packets/:token/mark-intake', postPublicPacketMarkIntake);
router.post('/public/packets/:token/create-account', postPublicPacketCreateAccount);

router.use(authenticate);
router.get('/dashboard-overview', getDashboardOverview);
router.get('/packages', listPackages);
router.post('/packages', createPackage);
router.put('/packages/:id', updatePackage);
router.post('/packets', sendClientPacket);
router.get('/clients/:clientId/balance', getClientBalance);
router.get('/clients/:clientId/package-overview', getClientPackageOverview);
router.post('/sessions/book', postBookCoachingSession);
router.post('/sessions/complete-debit', postSessionCompletedDebit);
router.post('/sessions/missed', postMissedSession);

export default router;

import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { listMyGuardianClients } from '../controllers/clientGuardian.controller.js';
import { getGuardianPortalOverview } from '../controllers/guardianPortal.controller.js';

const router = express.Router();

router.use(authenticate);

// Guard: only guardian portal accounts
router.use((req, res, next) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  if (role !== 'client_guardian') {
    return res.status(403).json({ error: { message: 'Guardian access required' } });
  }
  next();
});

router.get('/clients', listMyGuardianClients);
router.get('/overview', getGuardianPortalOverview);

export default router;


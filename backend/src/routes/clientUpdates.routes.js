import express from 'express';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { guardianClientUpdate, confirmUpdateInformation, clientUpdatesEnabled } from '../services/clientUpdate.service.js';

const router = express.Router();
router.use(authenticate, requireActiveStatus);
router.get('/status',(_req,res)=>res.json({enabled:clientUpdatesEnabled()}));

router.get('/clients/:clientId', async (req, res, next) => {
  try {
    const clientId = Number(req.params.clientId || 0);
    const agencyId = Number(req.query.agencyId || 0);
    if (!clientId || !agencyId) return res.status(400).json({ error: { message: 'Client and agency are required' } });
    res.json(await guardianClientUpdate({ user: req.user, agencyId, clientId }));
  } catch (error) {
    if (error?.status) return res.status(error.status).json({ error: { message: error.message } });
    next(error);
  }
});

router.post('/clients/:clientId/items/:itemId/confirm', async (req, res, next) => {
  try {
    const clientId = Number(req.params.clientId || 0);
    const itemId = Number(req.params.itemId || 0);
    const agencyId = Number(req.body?.agencyId || 0);
    if (!clientId || !itemId || !agencyId) return res.status(400).json({ error: { message: 'Client, item, and agency are required' } });
    res.json(await confirmUpdateInformation({ user: req.user, agencyId, clientId, itemId }));
  } catch (error) {
    if (error?.status) return res.status(error.status).json({ error: { message: error.message } });
    next(error);
  }
});

export default router;

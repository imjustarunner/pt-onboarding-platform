import express from 'express';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { tutoringWorkspace } from '../services/tutoringWorkspace.service.js';
const router = express.Router();
router.use(authenticate, requireActiveStatus);
const handle = operation => async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  try { res.json(await tutoringWorkspace[operation](req.user, req.query.agencyId || req.body?.agencyId, req.body)); }
  catch (error) { if (error.status) return res.status(error.status).json({ error: { message: error.message } }); next(error); }
};
router.get('/context', handle('context'));
router.get('/profile', handle('profile'));
router.put('/profile', handle('save'));
router.get('/students', handle('students'));
export default router;

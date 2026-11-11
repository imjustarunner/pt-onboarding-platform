import express from 'express';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { auricwellAgendaImporter } from '../services/auricwellAgendaImport.service.js';

const router = express.Router();
router.use(authenticate, requireActiveStatus);
router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  if (!['admin', 'super_admin'].includes(String(req.user?.role || '').toLowerCase())) return res.status(403).json({ error: { message: 'Practice administrator access is required.' } });
  next();
});
const run = operation => async (req, res, next) => {
  try { res.json(await operation(req)); }
  catch (error) {
    if (error.status) return res.status(error.status).json({ error: { message: error.message, code: error.code }, ...(error.preview ? { preview: error.preview } : {}) });
    next(error);
  }
};
router.get('/options', run(req => auricwellAgendaImporter.options({ actor: req.user, agencyId: req.query.agencyId, providerId: req.query.providerId })));
router.post('/preview', run(req => auricwellAgendaImporter.preview({ actor: req.user, input: req.body || {} })));
router.post('/commit', run(req => auricwellAgendaImporter.commit({ actor: req.user, input: req.body || {} })));
export default router;

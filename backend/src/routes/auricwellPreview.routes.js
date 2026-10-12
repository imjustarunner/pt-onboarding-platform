import { withToastLoginSession } from '../utils/toastLoginSession.js';
import express from 'express';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { requirePreviewAdmin } from '../middleware/auricwellPreview.middleware.js';
import { previewAgencySlug, previewError } from '../services/auricwellPreviewPolicy.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
import { listToasts, saveToast, deleteToast } from '../services/toastAnnouncements.service.js';
const router = express.Router();
router.use(authenticate, requireActiveStatus, requirePreviewAdmin);
const practice = a => ({ id: a.id, name: a.name, slug: a.slug, organization_type: a.organization_type, feature_flags: a.feature_flags });
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.execute("SELECT id,name,slug,organization_type FROM agencies WHERE is_active=1 AND COALESCE(organization_type,'agency') IN ('agency','clinical') ORDER BY name");
    res.json({ actor: req.previewActor, practices: rows.map(practice) });
  } catch (error) { next(error); }
});
router.get('/context', async (req, res, next) => {
  try {
    const agency = await Agency.findBySlug(previewAgencySlug(req.query.slug));
    if (!agency?.is_active || !['agency', 'clinical'].includes(agency.organization_type || 'agency')) throw previewError(404, 'Practice unavailable.');
    await logAuditEvent(req, { actionType: 'auricwell_preview_open', agencyId: agency.id, metadata: { actorUserId: req.user.id, product: 'auricwell_preview' } });
    res.json({ actor: req.previewActor, practice: practice(agency), preview: true });
  } catch (error) { next(error); }
});
// The preview boundary resolves and validates the active practice before these handlers.
const toastAgency = req => {
  const id = req.auricwellPreview?.agencyId;
  if (!id) throw previewError(400, 'Select a practice first.');
  return id;
};
const run = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
router.get('/toasts/active', run(async (req, res) => {
  const rows = await listToasts({ agencyId: toastAgency(req), active: true, includeSupport: true });
  res.set('Cache-Control', 'private, no-store');
  res.json(withToastLoginSession(rows, req));
}));
router.get('/toasts', run(async (req, res) => res.json(await listToasts({ agencyId: toastAgency(req) }))));
router.post('/toasts', run(async (req, res) => res.status(201).json(await saveToast({ agencyId: toastAgency(req), userId: req.user.id, input: req.body }))));
router.put('/toasts/:id', run(async (req, res) => res.json(await saveToast({ agencyId: toastAgency(req), userId: req.user.id, id: req.params.id, input: req.body }))));
router.delete('/toasts/:id', run(async (req, res) => res.json(await deleteToast({ agencyId: toastAgency(req), id: req.params.id }))));
router.get('/providers', async (req, res, next) => {
  try {
    const agencyId = req.auricwellPreview?.agencyId;
    if (!agencyId) throw previewError(400, 'Select a practice first.');
    const [providers] = await pool.execute(`SELECT u.id,u.first_name,u.last_name,u.credential,u.is_active,u.status
      FROM users u JOIN user_agencies ua ON ua.user_id=u.id
      WHERE ua.agency_id=? AND u.role IN ('provider','provider_plus','intern','intern_plus','supervisor') ORDER BY u.last_name,u.first_name`, [agencyId]);
    res.json({ providers });
  } catch (error) { next(error); }
});
export default router;

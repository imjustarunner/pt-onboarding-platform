import { withToastLoginSession } from '../utils/toastLoginSession.js';
import express from 'express';
import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { requirePreviewAdmin } from '../middleware/auricwellPreview.middleware.js';
import { previewAgencySlug, previewError, assertQaPreviewPractice, AURICWELL_QA_SLUG } from '../services/auricwellPreviewPolicy.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
import { listToasts, saveToast, deleteToast } from '../services/toastAnnouncements.service.js';
const router = express.Router();
router.use(authenticate, requireActiveStatus, requirePreviewAdmin);
const practice = a => ({ id: a.id, name: a.name, slug: a.slug, organization_type: a.organization_type, feature_flags: a.feature_flags });
router.get('/', async (req, res, next) => {
  try {
    const [rows] = req.auricwellQaAgencyId
      ? await pool.execute("SELECT id,name,slug,organization_type FROM agencies WHERE id=? AND slug=? AND is_active=1",[req.auricwellQaAgencyId,AURICWELL_QA_SLUG])
      : await pool.execute("SELECT id,name,slug,organization_type FROM agencies WHERE is_active=1 AND COALESCE(organization_type,'agency') IN ('agency','clinical') ORDER BY name");
    res.json({ actor: req.previewActor, practices: rows.map(practice) });
  } catch (error) { next(error); }
});
router.get('/context', async (req, res, next) => {
  try {
    const agency = await Agency.findBySlug(previewAgencySlug(req.query.slug));
    assertQaPreviewPractice(req,agency);
    if (!agency?.is_active || !['agency', 'clinical'].includes(agency.organization_type || 'agency')) throw previewError(404, 'Practice unavailable.');
    await logAuditEvent(req, { actionType: 'auricwell_preview_open', agencyId: agency.id, metadata: { actorUserId: req.user.id, product: 'auricwell_preview' } });
    res.json({ actor: req.previewActor, practice: practice(agency), preview: true, qaWorkspace: !!req.auricwellQaAgencyId });
  } catch (error) { next(error); }
});
// The preview boundary resolves and validates the active practice before these handlers.
const toastAgency = req => {
  if(req.auricwellQaAgencyId && req.path !== '/toasts/active') throw previewError(403,'Announcement management is not available to QA accounts.');
  const id = req.auricwellPreview?.agencyId;
  if (!id) throw previewError(400, 'Select a practice first.');
  return id;
};
const run = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next);
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
// Personal dashboard reads always use the authenticated actor and validated practice.
router.get('/tasks', run(async (req,res) => {
  const agencyId=req.auricwellPreview?.agencyId;
  if(!agencyId) throw previewError(400,'Select a practice first.');
  const from=`FROM tasks t LEFT JOIN task_lists tl ON tl.id=t.task_list_id
    LEFT JOIN task_projects tp ON tp.id=t.project_id
    WHERE t.assigned_to_user_id=? AND COALESCE(t.assigned_to_agency_id,tl.agency_id,tp.agency_id)=?
    AND t.status NOT IN ('completed','overridden','archived')`;
  const params=[req.user.id,agencyId];
  const [[count]]=await pool.execute(`SELECT COUNT(*) AS total ${from}`,params);
  const [tasks]=await pool.execute(`SELECT t.id,t.title,t.task_type,t.status,t.due_date,tl.name AS task_list_name ${from}
    ORDER BY (t.due_date IS NULL),t.due_date,t.id LIMIT 50`,params);
  res.set('Cache-Control','private, no-store');
  res.json({tasks,total:Number(count.total)});
}));
router.get('/notifications', run(async (req,res,next) => {
  const agencyId=req.auricwellPreview?.agencyId;
  if(!agencyId) throw previewError(400,'Select a practice first.');
  // Ignore caller-supplied managed/team scope, user IDs and agency filters.
  req.query={agencyId:String(agencyId),scope:'inbox',page:'1',pageSize:'10',status:'all'};
  res.set('Cache-Control','private, no-store');
  const {getNotificationFeed}=await import('../controllers/notification.controller.js');
  return getNotificationFeed(req,res,next);
}));
export default router;

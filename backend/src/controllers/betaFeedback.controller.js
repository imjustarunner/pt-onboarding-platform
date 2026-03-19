import BetaFeedback from '../models/BetaFeedback.model.js';
import PlatformBranding from '../models/PlatformBranding.model.js';
import StorageService from '../services/storage.service.js';
import multer from 'multer';
import path from 'path';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPEG, WebP images allowed'), false);
  }
});

/**
 * Check if beta feedback is enabled (platform-wide)
 */
export async function isBetaFeedbackEnabled() {
  try {
    const pb = await PlatformBranding.get();
    return !!pb?.beta_feedback_enabled;
  } catch {
    return false;
  }
}

/**
 * Submit beta feedback (any authenticated user when enabled)
 * POST /api/beta-feedback
 * Body: description, routePath, routeName (optional)
 * Optional file: screenshot
 */
export const submitBetaFeedback = [
  upload.single('screenshot'),
  async (req, res, next) => {
    try {
      const enabled = await isBetaFeedbackEnabled();
      if (!enabled) {
        return res.status(403).json({ error: { message: 'Beta feedback is not currently enabled' } });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: { message: 'Authentication required' } });
      }

      const description = (req.body.description || '').trim() || null;
      const routePath = (req.body.routePath || '').trim() || null;
      const routeName = (req.body.routeName || '').trim() || null;
      const agencyId = req.body.agencyId ? parseInt(req.body.agencyId, 10) : null;
      const organizationId = req.body.organizationId ? parseInt(req.body.organizationId, 10) : null;
      const userAgent = (req.headers['user-agent'] || '').substring(0, 1024) || null;
      const viewportWidth = req.body.viewportWidth ? parseInt(req.body.viewportWidth, 10) : null;
      const viewportHeight = req.body.viewportHeight ? parseInt(req.body.viewportHeight, 10) : null;

      const feedbackId = await BetaFeedback.create({
        userId,
        agencyId: Number.isInteger(agencyId) ? agencyId : null,
        organizationId: Number.isInteger(organizationId) ? organizationId : null,
        routePath,
        routeName,
        description,
        screenshotPath: null,
        userAgent,
        viewportWidth: Number.isInteger(viewportWidth) ? viewportWidth : null,
        viewportHeight: Number.isInteger(viewportHeight) ? viewportHeight : null
      });

      let screenshotPath = null;
      if (req.file && req.file.buffer) {
        const ext = path.extname(req.file.originalname || '') || '.png';
        const filename = `screenshot${ext}`;
        const result = await StorageService.saveBetaFeedbackScreenshot(
          feedbackId,
          req.file.buffer,
          filename,
          req.file.mimetype || 'image/png'
        );
        screenshotPath = result.relativePath;
        await BetaFeedback.updateScreenshotPath(feedbackId, screenshotPath);
      }

      const feedback = await BetaFeedback.findById(feedbackId);
      res.status(201).json(feedback);
    } catch (err) {
      next(err);
    }
  }
];

/**
 * List all beta feedback (super admin only)
 * GET /api/beta-feedback?limit=100&offset=0&agencyId=&userId=&status=&dateFrom=&dateTo=
 */
export const listBetaFeedback = async (req, res, next) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const agencyId = req.query.agencyId ? parseInt(req.query.agencyId, 10) : null;
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;
    const since = req.query.since || null;
    const status = req.query.status || null;
    const dateFrom = req.query.dateFrom || null;
    const dateTo = req.query.dateTo || null;

    const opts = { limit, offset, agencyId, userId, since, status, dateFrom, dateTo };

    const [items, total] = await Promise.all([
      BetaFeedback.findAll(opts),
      BetaFeedback.count(opts)
    ]);

    res.json({ items, total });
  } catch (err) {
    next(err);
  }
};

/**
 * Get pending count (super admin only) - for badge display
 * GET /api/beta-feedback/pending-count
 */
export const getPendingCount = async (req, res, next) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }

    const count = await BetaFeedback.countPending();
    res.json({ count: Number(count) });
  } catch (err) {
    next(err);
  }
};

/**
 * List my beta feedback (owner view)
 * GET /api/beta-feedback/mine?limit=50&offset=0
 */
export const listMyBetaFeedback = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    const items = await BetaFeedback.findMine(userId, { limit, offset });
    res.json({ items });
  } catch (err) {
    next(err);
  }
};

/**
 * Update feedback status (super admin only)
 * PATCH /api/beta-feedback/:id
 * Body: { status: 'pending'|'reviewed'|'resolved' }
 */
export const updateBetaFeedback = async (req, res, next) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: { message: 'Invalid feedback ID' } });
    }

    const status = req.body?.status;
    if (!status || !['pending', 'reviewed', 'resolved'].includes(status)) {
      return res.status(400).json({ error: { message: 'Invalid status. Use pending, reviewed, or resolved.' } });
    }

    await BetaFeedback.updateStatus(id, status, req.user.id);
    const feedback = await BetaFeedback.findById(id);
    res.json(feedback);
  } catch (err) {
    next(err);
  }
};

/**
 * Delete feedback (super admin only)
 * DELETE /api/beta-feedback/:id
 */
export const deleteBetaFeedback = async (req, res, next) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: { message: 'Invalid feedback ID' } });
    }

    const existing = await BetaFeedback.findById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Feedback not found' } });
    }

    const deleted = await BetaFeedback.deleteById(id);
    if (!deleted) {
      return res.status(404).json({ error: { message: 'Feedback not found' } });
    }

    if (existing.screenshot_path) {
      StorageService.deleteObject(existing.screenshot_path).catch(() => {});
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

/**
 * Bulk delete feedback (super admin only)
 * POST /api/beta-feedback/bulk-delete
 * Body: { ids: number[] }
 */
export const bulkDeleteBetaFeedback = async (req, res, next) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }

    const idsRaw = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids = idsRaw
      .map((v) => parseInt(v, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) {
      return res.status(400).json({ error: { message: 'Provide at least one valid feedback ID' } });
    }

    const existing = await BetaFeedback.findByIds(uniqueIds);
    const deletedCount = await BetaFeedback.deleteManyByIds(uniqueIds);
    for (const row of existing) {
      if (row?.screenshot_path) StorageService.deleteObject(row.screenshot_path).catch(() => {});
    }

    res.json({ deletedCount: Number(deletedCount || 0) });
  } catch (err) {
    next(err);
  }
};

/**
 * Delete all resolved feedback (super admin only)
 * POST /api/beta-feedback/delete-resolved
 * Body: { agencyId?: number, dateFrom?: string, dateTo?: string }
 */
export const deleteResolvedBetaFeedback = async (req, res, next) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }

    const agencyId = req.body?.agencyId ? parseInt(req.body.agencyId, 10) : null;
    const dateFrom = req.body?.dateFrom || null;
    const dateTo = req.body?.dateTo || null;
    const opts = {
      agencyId: Number.isInteger(agencyId) ? agencyId : null,
      dateFrom,
      dateTo
    };

    const existing = await BetaFeedback.findResolvedForDeletion(opts);
    const deletedCount = await BetaFeedback.deleteResolved(opts);
    for (const row of existing) {
      if (row?.screenshot_path) StorageService.deleteObject(row.screenshot_path).catch(() => {});
    }

    res.json({ deletedCount: Number(deletedCount || 0) });
  } catch (err) {
    next(err);
  }
};

const canAccessFeedback = (feedback, user) => {
  if (!feedback || !user) return false;
  if (user.role === 'super_admin') return true;
  return Number(feedback.user_id) === Number(user.id);
};

/**
 * List feedback messages for admin/owner
 * GET /api/beta-feedback/:id/messages
 */
export const listBetaFeedbackMessages = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: { message: 'Invalid feedback ID' } });
    }
    const feedback = await BetaFeedback.findById(id);
    if (!feedback) return res.status(404).json({ error: { message: 'Feedback not found' } });
    if (!canAccessFeedback(feedback, req.user)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const items = await BetaFeedback.findMessages(id);
    res.json({ items });
  } catch (err) {
    next(err);
  }
};

/**
 * Post feedback message for admin/owner
 * POST /api/beta-feedback/:id/messages
 * Body: { message: string }
 */
export const createBetaFeedbackMessage = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: { message: 'Invalid feedback ID' } });
    }
    const feedback = await BetaFeedback.findById(id);
    if (!feedback) return res.status(404).json({ error: { message: 'Feedback not found' } });
    if (!canAccessFeedback(feedback, req.user)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (req.user?.role !== 'super_admin' && String(feedback.status || '').toLowerCase() === 'resolved') {
      return res.status(400).json({ error: { message: 'Resolved feedback is closed for replies' } });
    }

    const message = String(req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: { message: 'Message is required' } });
    }
    if (message.length > 4000) {
      return res.status(400).json({ error: { message: 'Message is too long (max 4000 chars)' } });
    }

    await BetaFeedback.createMessage({
      feedbackId: id,
      userId: req.user.id,
      messageText: message
    });

    const items = await BetaFeedback.findMessages(id);
    res.status(201).json({ items });
  } catch (err) {
    next(err);
  }
};

/**
 * Get single beta feedback (super admin only)
 * GET /api/beta-feedback/:id
 */
export const getBetaFeedback = async (req, res, next) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: { message: 'Invalid feedback ID' } });
    }

    const feedback = await BetaFeedback.findById(id);
    if (!feedback) {
      return res.status(404).json({ error: { message: 'Feedback not found' } });
    }

    res.json(feedback);
  } catch (err) {
    next(err);
  }
};

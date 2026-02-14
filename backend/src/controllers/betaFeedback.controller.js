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

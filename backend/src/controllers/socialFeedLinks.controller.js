import { validationResult } from 'express-validator';
import User from '../models/User.model.js';
import SocialFeedLink from '../models/SocialFeedLink.model.js';

function safeInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/dashboard/social-feeds?agencyId=1&organizationId=&programId=
 * Returns active feeds for dashboard (agency-level + optional org/program scope).
 */
export const listForDashboard = async (req, res, next) => {
  try {
    // Social feeds UI and API restricted to super_admin until full release
    if (req.user.role !== 'super_admin') {
      return res.json({ feeds: [] });
    }

    const agencyId = safeInt(req.query.agencyId);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const organizationId = safeInt(req.query.organizationId) || null;
    const programId = safeInt(req.query.programId) || null;
    const feeds = await SocialFeedLink.listForDashboard(agencyId, organizationId, programId);

    res.json({
      feeds: feeds.map((f) => ({
        id: f.id,
        type: f.type,
        label: f.label,
        url: f.url,
        embedUrl: f.url,
        externalUrl: f.externalUrl || f.url,
        sortOrder: f.sortOrder
      }))
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/agencies/:agencyId/social-feeds
 * Admin: list all social feed links for an agency.
 */
export const listByAgency = async (req, res, next) => {
  try {
    const agencyId = safeInt(req.params.agencyId);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const activeOnly = req.query.activeOnly === 'true';
    const links = await SocialFeedLink.listByAgency(agencyId, { activeOnly });
    res.json({ feeds: links });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/agencies/:agencyId/social-feeds
 * Admin: create a social feed link.
 */
export const create = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = safeInt(req.params.agencyId);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }

    const rawLabel = req.body.label;
    const label = (typeof rawLabel === 'string' && rawLabel.trim()) ? rawLabel.trim() : 'Feed';

    const link = await SocialFeedLink.create({
      agencyId,
      organizationId: req.body.organizationId ? safeInt(req.body.organizationId) : null,
      programId: req.body.programId ? safeInt(req.body.programId) : null,
      type: req.body.type || 'link',
      label,
      url: req.body.url || null,
      externalUrl: req.body.externalUrl || null,
      sortOrder: req.body.sortOrder != null && req.body.sortOrder !== '' ? Number(req.body.sortOrder) : 0,
      isActive: req.body.isActive !== false
    });

    res.status(201).json({ feed: link });
  } catch (e) {
    next(e);
  }
};

/**
 * PUT /api/agencies/:agencyId/social-feeds/:id
 * Admin: update a social feed link.
 */
export const update = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = safeInt(req.params.agencyId);
    const id = safeInt(req.params.id);
    if (!agencyId || !id) {
      return res.status(400).json({ error: { message: 'agencyId and id are required' } });
    }

    const existing = await SocialFeedLink.findById(id);
    if (!existing || Number(existing.agencyId) !== Number(agencyId)) {
      return res.status(404).json({ error: { message: 'Social feed link not found' } });
    }

    const updates = {};
    if (req.body.organizationId !== undefined) updates.organizationId = req.body.organizationId ? safeInt(req.body.organizationId) : null;
    if (req.body.programId !== undefined) updates.programId = req.body.programId ? safeInt(req.body.programId) : null;
    if (req.body.type !== undefined) updates.type = req.body.type;
    if (req.body.label !== undefined) updates.label = req.body.label;
    if (req.body.url !== undefined) updates.url = req.body.url || null;
    if (req.body.externalUrl !== undefined) updates.externalUrl = req.body.externalUrl || null;
    if (req.body.sortOrder !== undefined) updates.sortOrder = Number(req.body.sortOrder);
    if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;

    const updated = await SocialFeedLink.update(id, updates);
    res.json({ feed: updated });
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /api/agencies/:agencyId/social-feeds/:id
 * Admin: delete a social feed link.
 */
export const remove = async (req, res, next) => {
  try {
    const agencyId = safeInt(req.params.agencyId);
    const id = safeInt(req.params.id);
    if (!agencyId || !id) {
      return res.status(400).json({ error: { message: 'agencyId and id are required' } });
    }

    const existing = await SocialFeedLink.findById(id);
    if (!existing || Number(existing.agencyId) !== Number(agencyId)) {
      return res.status(404).json({ error: { message: 'Social feed link not found' } });
    }

    await SocialFeedLink.delete(id);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
};

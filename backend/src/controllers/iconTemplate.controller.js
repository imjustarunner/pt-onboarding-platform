import { validationResult } from 'express-validator';
import IconTemplate from '../models/IconTemplate.model.js';
import User from '../models/User.model.js';

export const getIconTemplates = async (req, res, next) => {
  try {
    const { scope } = req.query;
    const isSuperAdmin = req.user?.role === 'super_admin';

    let agencyIds = [];
    if (!isSuperAdmin && req.user?.id) {
      const agencies = await User.getAgencies(req.user.id);
      agencyIds = (agencies || []).map(a => a.id);
    }

    const templates = await IconTemplate.findAccessible({
      scope: scope || undefined,
      agencyIds,
      isSuperAdmin
    });

    res.json(templates);
  } catch (error) {
    next(error);
  }
};

export const getIconTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await IconTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: { message: 'Icon template not found' } });
    }
    // Access control: reuse list logic (simple + safe)
    const isSuperAdmin = req.user?.role === 'super_admin';
    if (!isSuperAdmin) {
      const agencies = await User.getAgencies(req.user.id);
      const agencyIds = (agencies || []).map(a => a.id);
      const canSee = (template.agency_id && agencyIds.includes(template.agency_id)) || (!template.agency_id && template.is_shared);
      if (!canSee) {
        return res.status(403).json({ error: { message: 'Not authorized to view this icon template' } });
      }
    }
    res.json(template);
  } catch (error) {
    next(error);
  }
};

export const createIconTemplate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const {
      name,
      description,
      scope,
      agencyId,
      isShared,
      iconData
    } = req.body;

    const isSuperAdmin = req.user?.role === 'super_admin';
    const createdByUserId = req.user?.id;

    // Rules:
    // - Non-super-admins can only create agency-scoped templates for agencies they belong to
    // - Only super-admins can create global templates (agencyId null) or toggle isShared
    if (!isSuperAdmin) {
      if (scope !== 'agency') {
        return res.status(403).json({ error: { message: 'Only super admins can create platform icon templates' } });
      }
      if (!agencyId) {
        return res.status(403).json({ error: { message: 'Only super admins can create global shared icon templates' } });
      }
      const agencies = await User.getAgencies(req.user.id);
      const agencyIds = (agencies || []).map(a => a.id);
      if (!agencyIds.includes(parseInt(agencyId, 10))) {
        return res.status(403).json({ error: { message: 'Not authorized to create templates for this agency' } });
      }
    }

    const template = await IconTemplate.create({
      name,
      description,
      scope,
      agencyId: agencyId || null,
      createdByUserId,
      isShared: isSuperAdmin ? (isShared ?? true) : false,
      iconData: iconData || {}
    });

    res.status(201).json(template);
  } catch (error) {
    next(error);
  }
};

export const updateIconTemplate = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const existing = await IconTemplate.findById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Icon template not found' } });
    }

    const isSuperAdmin = req.user?.role === 'super_admin';
    if (!isSuperAdmin) {
      // Only allow editing templates tied to their agency (not global shared)
      if (!existing.agency_id || !req.user?.id) {
        return res.status(403).json({ error: { message: 'Not authorized to update this icon template' } });
      }
      const agencies = await User.getAgencies(req.user.id);
      const agencyIds = (agencies || []).map(a => a.id);
      if (!agencyIds.includes(existing.agency_id)) {
        return res.status(403).json({ error: { message: 'Not authorized to update this icon template' } });
      }
    }

    const { name, description, isShared, iconData } = req.body;
    const updated = await IconTemplate.update(id, {
      name,
      description,
      isShared: isSuperAdmin ? isShared : undefined,
      iconData
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

export const deleteIconTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await IconTemplate.findById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Icon template not found' } });
    }

    const isSuperAdmin = req.user?.role === 'super_admin';
    if (!isSuperAdmin) {
      // Only allow deleting templates tied to their agency (not global shared)
      if (!existing.agency_id || !req.user?.id) {
        return res.status(403).json({ error: { message: 'Not authorized to delete this icon template' } });
      }
      const agencies = await User.getAgencies(req.user.id);
      const agencyIds = (agencies || []).map(a => a.id);
      if (!agencyIds.includes(existing.agency_id)) {
        return res.status(403).json({ error: { message: 'Not authorized to delete this icon template' } });
      }
    }

    const ok = await IconTemplate.delete(id);
    res.json({ success: ok });
  } catch (error) {
    next(error);
  }
};


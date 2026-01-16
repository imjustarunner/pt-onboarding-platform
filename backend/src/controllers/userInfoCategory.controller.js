import UserInfoCategory from '../models/UserInfoCategory.model.js';
import User from '../models/User.model.js';
import { validationResult } from 'express-validator';

export const getAllCategories = async (req, res, next) => {
  try {
    const { isPlatformTemplate, agencyId } = req.query;
    const filters = {};

    if (isPlatformTemplate !== undefined) {
      filters.isPlatformTemplate = isPlatformTemplate === 'true';
    }
    if (agencyId !== undefined) {
      filters.agencyId = parseInt(agencyId);
    }

    if (req.user.role === 'super_admin') {
      const categories = await UserInfoCategory.findAll(filters);
      return res.json(categories);
    }

    if (req.user.role === 'admin' || req.user.role === 'support') {
      const platformTemplates = await UserInfoCategory.findPlatformTemplates();
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map((a) => a.id);

      const agencyCategories = [];
      for (const aId of agencyIds) {
        const cats = await UserInfoCategory.findAll({ agencyId: aId });
        agencyCategories.push(...cats);
      }

      // If an agencyId filter was provided, apply it client-side to this merged view
      const merged = [...platformTemplates, ...agencyCategories];
      if (filters.agencyId !== undefined) {
        return res.json(merged.filter((c) => c.agency_id === filters.agencyId || c.agency_id === null));
      }
      return res.json(merged);
    }

    return res.json([]);
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { categoryKey, categoryLabel, isPlatformTemplate, agencyId, orderIndex } = req.body;

    if (isPlatformTemplate && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can create platform templates' } });
    }

    if (agencyId && (req.user.role === 'admin' || req.user.role === 'support')) {
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some((a) => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You can only create categories for your agencies' } });
      }
    }

    const finalKey = categoryKey || UserInfoCategory.generateCategoryKey(categoryLabel);

    const category = await UserInfoCategory.create({
      categoryKey: finalKey,
      categoryLabel,
      isPlatformTemplate: isPlatformTemplate || false,
      agencyId: agencyId || null,
      orderIndex: orderIndex || 0,
      createdByUserId: req.user.id
    });

    res.status(201).json(category);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: { message: 'Category key already exists for this agency' } });
    }
    next(error);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const { id } = req.params;
    const existing = await UserInfoCategory.findById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Category not found' } });
    }

    if (existing.is_platform_template && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can modify platform templates' } });
    }

    if (existing.agency_id && (req.user.role === 'admin' || req.user.role === 'support')) {
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some((a) => a.id === existing.agency_id);
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const { categoryKey, categoryLabel, isPlatformTemplate, agencyId, orderIndex } = req.body;

    const updated = await UserInfoCategory.update(id, {
      categoryKey,
      categoryLabel,
      isPlatformTemplate,
      agencyId,
      orderIndex
    });

    res.json(updated);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: { message: 'Category key already exists for this agency' } });
    }
    next(error);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await UserInfoCategory.findById(id);
    if (!existing) {
      return res.status(404).json({ error: { message: 'Category not found' } });
    }

    if (existing.is_platform_template && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can delete platform templates' } });
    }

    if (existing.agency_id && (req.user.role === 'admin' || req.user.role === 'support')) {
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some((a) => a.id === existing.agency_id);
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }

    const deleted = await UserInfoCategory.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: { message: 'Category not found' } });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    next(error);
  }
};


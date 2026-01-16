import CustomChecklistItem from '../models/CustomChecklistItem.model.js';
import { validationResult } from 'express-validator';

export const getAllChecklistItems = async (req, res, next) => {
  try {
    const { isPlatformTemplate, agencyId } = req.query;
    const filters = {};
    
    if (isPlatformTemplate !== undefined) {
      filters.isPlatformTemplate = isPlatformTemplate === 'true';
    }
    if (agencyId !== undefined) {
      filters.agencyId = parseInt(agencyId);
    }
    
    // Super admins see all, agency admins/support see platform templates + their agency's items
    if (req.user.role === 'super_admin') {
      const items = await CustomChecklistItem.findAll(filters);
      return res.json(items);
    }
    
    if (req.user.role === 'admin' || req.user.role === 'support') {
      // Get platform templates
      const platformTemplates = await CustomChecklistItem.findPlatformTemplates();
      
      // Get user's agencies
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map(a => a.id);
      
      // Get agency-specific items
      const agencyItems = [];
      for (const agencyId of agencyIds) {
        const items = await CustomChecklistItem.findAll({ agencyId });
        agencyItems.push(...items);
      }
      
      return res.json([...platformTemplates, ...agencyItems]);
    }
    
    res.json([]);
  } catch (error) {
    next(error);
  }
};

export const getChecklistItemById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const item = await CustomChecklistItem.findById(id);
    
    if (!item) {
      return res.status(404).json({ error: { message: 'Checklist item not found' } });
    }
    
    res.json(item);
  } catch (error) {
    next(error);
  }
};

export const getPlatformTemplates = async (req, res, next) => {
  try {
    const templates = await CustomChecklistItem.findPlatformTemplates();
    res.json(templates);
  } catch (error) {
    next(error);
  }
};

export const getAgencyItems = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    
    // Verify access
    if (req.user.role === 'admin' || req.user.role === 'support') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    const AgencyChecklistEnabledItem = (await import('../models/AgencyChecklistEnabledItem.model.js')).default;
    
    // Get platform templates
    const platformTemplates = await CustomChecklistItem.findPlatformTemplates();
    
    // Get enabled status for each platform template
    const platformTemplatesWithStatus = await Promise.all(
      platformTemplates.map(async (template) => {
        const enabled = await AgencyChecklistEnabledItem.isEnabled(parseInt(agencyId), template.id);
        return {
          ...template,
          enabled: enabled
        };
      })
    );
    
    // Get agency-specific items
    const agencyItems = await CustomChecklistItem.findAll({ agencyId: parseInt(agencyId) });
    
    res.json({
      platformTemplates: platformTemplatesWithStatus,
      agencyItems: agencyItems
    });
  } catch (error) {
    next(error);
  }
};

export const getEnabledItemsForAgency = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    
    // Verify access
    if (req.user.role === 'admin' || req.user.role === 'support') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    const AgencyChecklistEnabledItem = (await import('../models/AgencyChecklistEnabledItem.model.js')).default;
    const enabledItems = await AgencyChecklistEnabledItem.findByAgencyId(parseInt(agencyId));
    
    res.json(enabledItems);
  } catch (error) {
    next(error);
  }
};

export const toggleItemForAgency = async (req, res, next) => {
  try {
    const { itemId, agencyId } = req.params;
    const { enabled } = req.body;
    
    // Verify access
    if (req.user.role === 'admin' || req.user.role === 'support') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    // Verify item is a platform template
    const item = await CustomChecklistItem.findById(itemId);
    if (!item) {
      return res.status(404).json({ error: { message: 'Checklist item not found' } });
    }
    
    if (!item.is_platform_template) {
      return res.status(400).json({ error: { message: 'Only platform templates can be toggled for agencies' } });
    }
    
    const AgencyChecklistEnabledItem = (await import('../models/AgencyChecklistEnabledItem.model.js')).default;
    // enabled can be true/false, default to true if not provided
    const enabledValue = enabled !== undefined ? enabled : true;
    const result = await AgencyChecklistEnabledItem.toggleItem(parseInt(agencyId), parseInt(itemId), enabledValue);
    
    res.json({ enabled: result });
  } catch (error) {
    next(error);
  }
};

export const createChecklistItem = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    
    const { itemKey, itemLabel, description, isPlatformTemplate, agencyId, parentItemId, trainingFocusId, moduleId, orderIndex, autoAssign } = req.body;
    
    // Only super admins can create platform templates
    if (isPlatformTemplate && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can create platform templates' } });
    }
    
    // Agency admins/support can create agency-specific items (for agencies they belong to)
    if (agencyId && (req.user.role === 'admin' || req.user.role === 'support')) {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You can only create items for your agencies' } });
      }
    }
    
    // Validate training focus/module access if nesting
    if (trainingFocusId || moduleId) {
      const TrainingTrack = (await import('../models/TrainingTrack.model.js')).default;
      const Module = (await import('../models/Module.model.js')).default;
      
      if (moduleId) {
        const module = await Module.findById(moduleId);
        if (!module) {
          return res.status(404).json({ error: { message: 'Module not found' } });
        }
        // If trainingFocusId is also provided, verify module belongs to it
        if (trainingFocusId && module.track_id !== parseInt(trainingFocusId)) {
          return res.status(400).json({ error: { message: 'Module does not belong to the specified training focus' } });
        }
      } else if (trainingFocusId) {
        const track = await TrainingTrack.findById(trainingFocusId);
        if (!track) {
          return res.status(404).json({ error: { message: 'Training focus not found' } });
        }
      }
    }
    
    // Generate item key if not provided
    const finalItemKey = itemKey || CustomChecklistItem.generateItemKey(itemLabel);
    
    const item = await CustomChecklistItem.create({
      itemKey: finalItemKey,
      itemLabel,
      description,
      isPlatformTemplate: isPlatformTemplate || false,
      agencyId: agencyId || null,
      parentItemId: parentItemId || null,
      trainingFocusId: trainingFocusId || null,
      moduleId: moduleId || null,
      orderIndex: orderIndex || 0,
      autoAssign: autoAssign || false,
      createdByUserId: req.user.id
    });
    
    res.status(201).json(item);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: { message: 'Item key already exists for this agency' } });
    }
    next(error);
  }
};

export const updateChecklistItem = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    
    const { id } = req.params;
    const { itemKey, itemLabel, description, isPlatformTemplate, agencyId, parentItemId, trainingFocusId, moduleId, orderIndex, autoAssign } = req.body;
    
    const existingItem = await CustomChecklistItem.findById(id);
    if (!existingItem) {
      return res.status(404).json({ error: { message: 'Checklist item not found' } });
    }
    
    // Only super admins can modify platform templates
    if (existingItem.is_platform_template && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can modify platform templates' } });
    }
    
    // Agency admins/support can only modify their agency's items
    if (existingItem.agency_id && (req.user.role === 'admin' || req.user.role === 'support')) {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === existingItem.agency_id);
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    // Validate training focus/module access if nesting
    if (trainingFocusId !== undefined || moduleId !== undefined) {
      const TrainingTrack = (await import('../models/TrainingTrack.model.js')).default;
      const Module = (await import('../models/Module.model.js')).default;
      
      if (moduleId !== null && moduleId !== undefined) {
        const module = await Module.findById(moduleId);
        if (!module) {
          return res.status(404).json({ error: { message: 'Module not found' } });
        }
        // If trainingFocusId is also provided, verify module belongs to it
        if (trainingFocusId !== null && trainingFocusId !== undefined && module.track_id !== parseInt(trainingFocusId)) {
          return res.status(400).json({ error: { message: 'Module does not belong to the specified training focus' } });
        }
      } else if (trainingFocusId !== null && trainingFocusId !== undefined) {
        const track = await TrainingTrack.findById(trainingFocusId);
        if (!track) {
          return res.status(404).json({ error: { message: 'Training focus not found' } });
        }
      }
    }
    
    const item = await CustomChecklistItem.update(id, {
      itemKey,
      itemLabel,
      description,
      isPlatformTemplate,
      agencyId,
      parentItemId,
      trainingFocusId,
      moduleId,
      orderIndex,
      autoAssign
    });
    
    res.json(item);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: { message: 'Item key already exists for this agency' } });
    }
    next(error);
  }
};

export const deleteChecklistItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const existingItem = await CustomChecklistItem.findById(id);
    if (!existingItem) {
      return res.status(404).json({ error: { message: 'Checklist item not found' } });
    }
    
    // Only super admins can delete platform templates
    if (existingItem.is_platform_template && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can delete platform templates' } });
    }
    
    // Agency admins/support can only delete their agency's items
    if (existingItem.agency_id && (req.user.role === 'admin' || req.user.role === 'support')) {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === existingItem.agency_id);
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    const deleted = await CustomChecklistItem.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: { message: 'Checklist item not found' } });
    }
    
    res.json({ message: 'Checklist item deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const pushToAgency = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { agencyId } = req.body;
    
    // Only super admins can push templates to agencies
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can push templates to agencies' } });
    }
    
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Agency ID is required' } });
    }
    
    const newItem = await CustomChecklistItem.pushToAgency(id, agencyId);
    res.status(201).json(newItem);
  } catch (error) {
    next(error);
  }
};


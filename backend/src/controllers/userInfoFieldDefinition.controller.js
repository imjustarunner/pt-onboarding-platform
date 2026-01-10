import UserInfoFieldDefinition from '../models/UserInfoFieldDefinition.model.js';
import { validationResult } from 'express-validator';

export const getAllFieldDefinitions = async (req, res, next) => {
  try {
    const { isPlatformTemplate, agencyId } = req.query;
    const filters = {};
    
    if (isPlatformTemplate !== undefined) {
      filters.isPlatformTemplate = isPlatformTemplate === 'true';
    }
    if (agencyId !== undefined) {
      filters.agencyId = parseInt(agencyId);
    }
    
    // Super admins see all, agency admins see platform templates + their agency's fields
    if (req.user.role === 'super_admin') {
      const fields = await UserInfoFieldDefinition.findAll(filters);
      return res.json(fields);
    }
    
    if (req.user.role === 'admin') {
      // Get platform templates
      const platformTemplates = await UserInfoFieldDefinition.findPlatformTemplates();
      
      // Get user's agencies
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map(a => a.id);
      
      // Get agency-specific fields
      const agencyFields = [];
      for (const agencyId of agencyIds) {
        const fields = await UserInfoFieldDefinition.findAll({ agencyId });
        agencyFields.push(...fields);
      }
      
      return res.json([...platformTemplates, ...agencyFields]);
    }
    
    res.json([]);
  } catch (error) {
    next(error);
  }
};

export const getFieldDefinitionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const field = await UserInfoFieldDefinition.findById(id);
    
    if (!field) {
      return res.status(404).json({ error: { message: 'Field definition not found' } });
    }
    
    // Parse JSON options
    if (field.options) {
      field.options = JSON.parse(field.options);
    }
    
    res.json(field);
  } catch (error) {
    next(error);
  }
};

export const getPlatformTemplates = async (req, res, next) => {
  try {
    const templates = await UserInfoFieldDefinition.findPlatformTemplates();
    
    // Parse JSON options
    const parsed = templates.map(t => ({
      ...t,
      options: t.options ? JSON.parse(t.options) : null
    }));
    
    res.json(parsed);
  } catch (error) {
    next(error);
  }
};

export const getAgencyFields = async (req, res, next) => {
  try {
    const { agencyId } = req.params;
    
    // Verify access
    if (req.user.role === 'admin') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    const result = await UserInfoFieldDefinition.findByAgency(parseInt(agencyId));
    
    // Parse JSON options
    const parseOptions = (fields) => fields.map(f => ({
      ...f,
      options: f.options ? JSON.parse(f.options) : null
    }));
    
    res.json({
      platformTemplates: parseOptions(result.platformTemplates),
      agencyFields: parseOptions(result.agencyFields),
      allFields: parseOptions(result.allFields)
    });
  } catch (error) {
    next(error);
  }
};

export const createFieldDefinition = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    
    const { fieldKey, fieldLabel, fieldType, options, isRequired, isPlatformTemplate, agencyId, parentFieldId, orderIndex } = req.body;
    
    // Only super admins can create platform templates
    if (isPlatformTemplate && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can create platform templates' } });
    }
    
    // Agency admins can create agency-specific fields
    if (agencyId && req.user.role === 'admin') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You can only create fields for your agencies' } });
      }
    }
    
    // Generate field key if not provided
    const finalFieldKey = fieldKey || UserInfoFieldDefinition.generateFieldKey(fieldLabel);
    
    const field = await UserInfoFieldDefinition.create({
      fieldKey: finalFieldKey,
      fieldLabel,
      fieldType,
      options: options || null,
      isRequired: isRequired || false,
      isPlatformTemplate: isPlatformTemplate || false,
      agencyId: agencyId || null,
      parentFieldId: parentFieldId || null,
      orderIndex: orderIndex || 0,
      createdByUserId: req.user.id
    });
    
    // Parse options for response
    if (field.options) {
      field.options = JSON.parse(field.options);
    }
    
    res.status(201).json(field);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: { message: 'Field key already exists for this agency' } });
    }
    next(error);
  }
};

export const updateFieldDefinition = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    
    const { id } = req.params;
    const { fieldKey, fieldLabel, fieldType, options, isRequired, isPlatformTemplate, agencyId, parentFieldId, orderIndex } = req.body;
    
    const existingField = await UserInfoFieldDefinition.findById(id);
    if (!existingField) {
      return res.status(404).json({ error: { message: 'Field definition not found' } });
    }
    
    // Only super admins can modify platform templates
    if (existingField.is_platform_template && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can modify platform templates' } });
    }
    
    // Agency admins can only modify their agency's fields
    if (existingField.agency_id && req.user.role === 'admin') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === existingField.agency_id);
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    const field = await UserInfoFieldDefinition.update(id, {
      fieldKey,
      fieldLabel,
      fieldType,
      options,
      isRequired,
      isPlatformTemplate,
      agencyId,
      parentFieldId,
      orderIndex
    });
    
    // Parse options for response
    if (field.options) {
      field.options = JSON.parse(field.options);
    }
    
    res.json(field);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: { message: 'Field key already exists for this agency' } });
    }
    next(error);
  }
};

export const deleteFieldDefinition = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const existingField = await UserInfoFieldDefinition.findById(id);
    if (!existingField) {
      return res.status(404).json({ error: { message: 'Field definition not found' } });
    }
    
    // Only super admins can delete platform templates
    if (existingField.is_platform_template && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can delete platform templates' } });
    }
    
    // Agency admins can only delete their agency's fields
    if (existingField.agency_id && req.user.role === 'admin') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === existingField.agency_id);
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    const deleted = await UserInfoFieldDefinition.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: { message: 'Field definition not found' } });
    }
    
    res.json({ message: 'Field definition deleted successfully' });
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
    
    const newField = await UserInfoFieldDefinition.pushToAgency(id, agencyId);
    
    // Parse options for response
    if (newField.options) {
      newField.options = JSON.parse(newField.options);
    }
    
    res.status(201).json(newField);
  } catch (error) {
    next(error);
  }
};


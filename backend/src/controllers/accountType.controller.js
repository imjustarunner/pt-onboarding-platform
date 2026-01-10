import AccountType from '../models/AccountType.model.js';
import { validationResult } from 'express-validator';

export const getAllAccountTypes = async (req, res, next) => {
  try {
    const { isPlatformTemplate, agencyId } = req.query;
    const filters = {};
    
    if (isPlatformTemplate !== undefined) {
      filters.isPlatformTemplate = isPlatformTemplate === 'true';
    }
    if (agencyId !== undefined) {
      filters.agencyId = parseInt(agencyId);
    }
    
    // Super admins see all, agency admins see platform templates + their agency's types
    if (req.user.role === 'super_admin') {
      const types = await AccountType.findAll(filters);
      return res.json(types);
    }
    
    if (req.user.role === 'admin') {
      // Get platform templates
      const platformTypes = await AccountType.findAll({ isPlatformTemplate: true });
      
      // Get user's agencies
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const agencyIds = userAgencies.map(a => a.id);
      
      // Get agency-specific types
      const agencyTypes = [];
      for (const agencyId of agencyIds) {
        const types = await AccountType.findAll({ agencyId });
        agencyTypes.push(...types);
      }
      
      return res.json([...platformTypes, ...agencyTypes]);
    }
    
    res.json([]);
  } catch (error) {
    next(error);
  }
};

export const getAccountTypeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const accountType = await AccountType.findById(id);
    
    if (!accountType) {
      return res.status(404).json({ error: { message: 'Account type not found' } });
    }
    
    res.json(accountType);
  } catch (error) {
    next(error);
  }
};

export const createAccountType = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    
    const { name, description, isPlatformTemplate, agencyId } = req.body;
    
    // Only super admins can create platform templates
    if (isPlatformTemplate && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can create platform templates' } });
    }
    
    // Agency admins can create agency-specific types
    if (agencyId && req.user.role === 'admin') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You can only create account types for your agencies' } });
      }
    }
    
    const accountType = await AccountType.create({
      name,
      description,
      isPlatformTemplate: isPlatformTemplate || false,
      agencyId: agencyId || null,
      createdByUserId: req.user.id
    });
    
    res.status(201).json(accountType);
  } catch (error) {
    next(error);
  }
};

export const updateAccountType = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    
    const { id } = req.params;
    const { name, description, isPlatformTemplate, agencyId } = req.body;
    
    const existingType = await AccountType.findById(id);
    if (!existingType) {
      return res.status(404).json({ error: { message: 'Account type not found' } });
    }
    
    // Only super admins can modify platform templates
    if (existingType.is_platform_template && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can modify platform templates' } });
    }
    
    // Agency admins can only modify their agency's types
    if (existingType.agency_id && req.user.role === 'admin') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === existingType.agency_id);
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    const accountType = await AccountType.update(id, { name, description, isPlatformTemplate, agencyId });
    res.json(accountType);
  } catch (error) {
    next(error);
  }
};

export const deleteAccountType = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const existingType = await AccountType.findById(id);
    if (!existingType) {
      return res.status(404).json({ error: { message: 'Account type not found' } });
    }
    
    // Only super admins can delete platform templates
    if (existingType.is_platform_template && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Only super admins can delete platform templates' } });
    }
    
    // Agency admins can only delete their agency's types
    if (existingType.agency_id && req.user.role === 'admin') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === existingType.agency_id);
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    const deleted = await AccountType.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: { message: 'Account type not found' } });
    }
    
    res.json({ message: 'Account type deleted successfully' });
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
    
    const newType = await AccountType.pushToAgency(id, agencyId);
    res.status(201).json(newType);
  } catch (error) {
    next(error);
  }
};


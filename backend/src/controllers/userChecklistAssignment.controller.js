import UserChecklistAssignment from '../models/UserChecklistAssignment.model.js';
import { validationResult } from 'express-validator';

export const getUnifiedChecklist = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    // Users can view their own checklist, admins/supervisors/CPAs can view their supervisees
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      // Check if supervisor/CPA has access to this user
      const User = (await import('../models/User.model.js')).default;
      const requestingUser = await User.findById(req.user.id);
      const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
      
      if (isSupervisor || req.user.role === 'clinical_practice_assistant') {
        const hasAccess = await User.supervisorHasAccess(req.user.id, parseInt(userId), null);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      } else {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    const checklist = await UserChecklistAssignment.getUnifiedChecklist(parseInt(userId));
    res.json(checklist);
  } catch (error) {
    next(error);
  }
};

export const getCustomChecklist = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { agencyId } = req.query;
    
    // Users can view their own checklist, admins/supervisors/CPAs can view their supervisees
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
      // Check if supervisor/CPA has access to this user
      const User = (await import('../models/User.model.js')).default;
      const requestingUser = await User.findById(req.user.id);
      const isSupervisor = requestingUser && User.isSupervisor(requestingUser);
      
      if (isSupervisor || req.user.role === 'clinical_practice_assistant') {
        const hasAccess = await User.supervisorHasAccess(req.user.id, parseInt(userId), agencyId ? parseInt(agencyId) : null);
        if (!hasAccess) {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      } else {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    }
    
    const items = await UserChecklistAssignment.findByUserId(
      parseInt(userId),
      agencyId ? parseInt(agencyId) : null
    );
    
    res.json(items);
  } catch (error) {
    next(error);
  }
};

export const assignItemToUser = async (req, res, next) => {
  try {
    const { userId, itemId } = req.params;
    
    // Only admins can assign items
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    const assignment = await UserChecklistAssignment.assignToUser(
      parseInt(userId),
      parseInt(itemId),
      req.user.id
    );
    
    res.status(201).json(assignment);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: { message: 'Item already assigned to user' } });
    }
    next(error);
  }
};

export const markItemComplete = async (req, res, next) => {
  try {
    const { userId, itemId } = req.params;
    
    // Users can mark their own items complete, admins can mark any
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'You can only update your own checklist' } });
    }
    
    const assignment = await UserChecklistAssignment.markComplete(parseInt(userId), parseInt(itemId));
    if (!assignment) {
      return res.status(404).json({ error: { message: 'Checklist assignment not found' } });
    }
    
    res.json(assignment);
  } catch (error) {
    next(error);
  }
};

export const markItemIncomplete = async (req, res, next) => {
  try {
    const { userId, itemId } = req.params;
    
    // Users can mark their own items incomplete, admins can mark any
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'You can only update your own checklist' } });
    }
    
    const assignment = await UserChecklistAssignment.markIncomplete(parseInt(userId), parseInt(itemId));
    if (!assignment) {
      return res.status(404).json({ error: { message: 'Checklist assignment not found' } });
    }
    
    res.json(assignment);
  } catch (error) {
    next(error);
  }
};


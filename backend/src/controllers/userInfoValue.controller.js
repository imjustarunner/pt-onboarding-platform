import UserInfoValue from '../models/UserInfoValue.model.js';
import { validationResult } from 'express-validator';

export const getUserInfo = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { agencyId } = req.query;
    
    // Users can view their own info, admins can view any
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const summary = await UserInfoValue.getUserInfoSummary(
      parseInt(userId),
      agencyId ? parseInt(agencyId) : null
    );
    
    res.json(summary);
  } catch (error) {
    next(error);
  }
};

export const updateUserInfo = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    
    const { userId } = req.params;
    const { values } = req.body; // Array of { fieldDefinitionId, value }
    
    // Users can update their own info, admins can update any
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    if (!Array.isArray(values)) {
      return res.status(400).json({ error: { message: 'Values must be an array' } });
    }
    
    const results = await UserInfoValue.bulkUpdate(parseInt(userId), values);
    
    res.json({ message: 'User information updated successfully', results });
  } catch (error) {
    next(error);
  }
};

export const updateUserInfoField = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    
    const { userId, fieldId } = req.params;
    const { value } = req.body;
    
    // Users can update their own info, admins can update any
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const result = await UserInfoValue.createOrUpdate(parseInt(userId), parseInt(fieldId), value);
    
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const deleteUserInfoField = async (req, res, next) => {
  try {
    const { userId, fieldId } = req.params;
    
    // Users can delete their own info, admins can delete any
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const deleted = await UserInfoValue.delete(parseInt(userId), parseInt(fieldId));
    if (!deleted) {
      return res.status(404).json({ error: { message: 'User info field not found' } });
    }
    
    res.json({ message: 'User info field deleted successfully' });
  } catch (error) {
    next(error);
  }
};


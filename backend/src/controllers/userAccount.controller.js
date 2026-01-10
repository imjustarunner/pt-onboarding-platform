import UserAccount from '../models/UserAccount.model.js';
import { validationResult } from 'express-validator';

export const getUserAccounts = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { agencyId } = req.query;
    
    // Users can view their own accounts, admins can view any
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const accounts = await UserAccount.findByUserId(userId, agencyId ? parseInt(agencyId) : null);
    res.json(accounts);
  } catch (error) {
    next(error);
  }
};

export const createUserAccount = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    
    const { userId } = req.params;
    const { accountName, accountTypeId, username, pin, temporaryPassword, temporaryLink, agencyId } = req.body;
    
    // Only admins/super_admins can create accounts for other users
    // Users can create their own accounts
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    // If agencyId is provided, verify access
    if (agencyId && req.user.role === 'admin') {
      const User = (await import('../models/User.model.js')).default;
      const userAgencies = await User.getAgencies(req.user.id);
      const hasAccess = userAgencies.some(a => a.id === parseInt(agencyId));
      if (!hasAccess) {
        return res.status(403).json({ error: { message: 'You can only add accounts for your agencies' } });
      }
    }
    
    const account = await UserAccount.create({
      userId: parseInt(userId),
      accountName,
      accountTypeId: accountTypeId || null,
      username: username || null,
      pin: pin || null,
      temporaryPassword: temporaryPassword || null,
      temporaryLink: temporaryLink || null,
      agencyId: agencyId || null
    });
    
    res.status(201).json(account);
  } catch (error) {
    next(error);
  }
};

export const updateUserAccount = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    
    const { userId, accountId } = req.params;
    const { accountName, accountTypeId, username, pin, temporaryPassword, temporaryLink, agencyId } = req.body;
    
    const existingAccount = await UserAccount.findById(accountId);
    if (!existingAccount) {
      return res.status(404).json({ error: { message: 'Account not found' } });
    }
    
    // Verify user owns the account or is admin
    if (parseInt(existingAccount.user_id) !== parseInt(userId)) {
      return res.status(400).json({ error: { message: 'Account does not belong to this user' } });
    }
    
    // Users can update their own accounts, admins can update any
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const account = await UserAccount.update(accountId, {
      accountName,
      accountTypeId,
      username,
      pin,
      temporaryPassword,
      temporaryLink,
      agencyId
    });
    
    res.json(account);
  } catch (error) {
    next(error);
  }
};

export const deleteUserAccount = async (req, res, next) => {
  try {
    const { userId, accountId } = req.params;
    
    const existingAccount = await UserAccount.findById(accountId);
    if (!existingAccount) {
      return res.status(404).json({ error: { message: 'Account not found' } });
    }
    
    // Verify user owns the account
    if (parseInt(existingAccount.user_id) !== parseInt(userId)) {
      return res.status(400).json({ error: { message: 'Account does not belong to this user' } });
    }
    
    // Users can delete their own accounts, admins can delete any
    if (parseInt(userId) !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    const deleted = await UserAccount.delete(accountId);
    if (!deleted) {
      return res.status(404).json({ error: { message: 'Account not found' } });
    }
    
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    next(error);
  }
};


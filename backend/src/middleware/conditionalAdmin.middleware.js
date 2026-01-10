import jwt from 'jsonwebtoken';
import User from '../models/User.model.js';
import config from '../config/config.js';

export const requireAdminOrFirstUser = async (req, res, next) => {
  try {
    // Check if any admin exists
    const users = await User.findAll();
    const hasAdmin = users.some(user => user.role === 'admin');
    
    // If no admin exists, allow registration
    if (!hasAdmin) {
      return next();
    }
    
    // Otherwise, require admin authentication
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: { message: 'No token provided' } });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwt.secret);
    
    if (decoded.role !== 'admin' && decoded.role !== 'super_admin' && decoded.role !== 'support') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: { message: 'Token expired' } });
    }
    return res.status(401).json({ error: { message: 'Invalid token' } });
  }
};


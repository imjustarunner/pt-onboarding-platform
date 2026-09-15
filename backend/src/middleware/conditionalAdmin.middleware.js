import jwt from 'jsonwebtoken';
import User from '../models/User.model.js';
import config from '../config/config.js';
import { getSessionSecurity, sessionRouteAllowed } from '../services/sessionSecurity.service.js';

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
    // Try cookie first (new method), then fall back to Authorization header (for backward compatibility)
    const token = req.cookies?.authToken || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);
    
    if (!token) {
      return res.status(401).json({ error: { message: 'No token provided' } });
    }
    
    const decoded = jwt.verify(token, config.jwt.secret);
    const security = await getSessionSecurity(decoded, token);
    if (!sessionRouteAllowed(security, req.method, String(req.originalUrl || req.path || '').split('?')[0])) {
      return res.status(security.state.phase === 'expired' ? 401 : 423).json({ error: { code: security.state.phase === 'expired' ? 'SESSION_EXPIRED' : 'SESSION_LOCKED', message: 'Unlock your session or sign in again.' }, session: security.state, policy: security.policy });
    }
    
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


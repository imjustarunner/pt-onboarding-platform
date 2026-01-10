import dotenv from 'dotenv';

dotenv.config();

// Determine CORS origin based on environment
const getCorsOrigin = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // In development, always allow localhost:5173
  if (nodeEnv === 'development') {
    return 'http://localhost:5173';
  }
  
  // In production/staging, require CORS_ORIGIN from environment
  // No fallback to localhost in production for security
  if (process.env.CORS_ORIGIN) {
    // Support multiple origins (comma-separated) or single origin
    const origins = process.env.CORS_ORIGIN.split(',').map(origin => origin.trim());
    return origins.length === 1 ? origins[0] : origins;
  }
  
  // In production/staging without CORS_ORIGIN, throw error
  throw new Error(
    'CORS_ORIGIN environment variable is required in production/staging environments. ' +
    'Please set CORS_ORIGIN to your frontend URL (e.g., https://yourdomain.com)'
  );
};

/**
 * Get cookie options for authentication cookies
 * Used consistently for setting and clearing auth cookies
 * 
 * IMPORTANT: These options must match exactly between res.cookie() and res.clearCookie()
 * to ensure cookies are properly cleared on logout.
 * 
 * @returns {Object} Cookie options object
 */
const getAuthCookieOptions = () => {
  return {
    httpOnly: true,        // Prevent XSS - JavaScript cannot access
    secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
    sameSite: 'strict',   // CSRF protection - strict mode (will be updated to 'none' for cross-origin)
    maxAge: 24 * 60 * 60 * 1000,  // 24 hours (match JWT expiration) - only used for setting, not clearing
    path: '/',
    // For Cloud Run behind proxy, domain should not be set (uses request domain)
  };
};

/**
 * Get cookie options for clearing authentication cookies
 * Must match getAuthCookieOptions() except maxAge (not needed for clearing)
 * 
 * @returns {Object} Cookie options for clearCookie()
 */
const getAuthCookieClearOptions = () => {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    // Note: maxAge is not needed for clearCookie
    // Note: domain should not be set (matches setting options)
  };
};

export default {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  cors: {
    origin: getCorsOrigin()
  },
  // Cookie options for authentication
  authCookie: {
    // Options for setting cookies (includes maxAge)
    set: getAuthCookieOptions,
    // Options for clearing cookies (excludes maxAge)
    clear: getAuthCookieClearOptions
  }
};


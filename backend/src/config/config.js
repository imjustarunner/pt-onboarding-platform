import dotenv from 'dotenv';

dotenv.config();

// Determine CORS origin based on environment
const getCorsOrigin = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // In development, always allow localhost:5173
  if (nodeEnv === 'development') {
    return 'http://localhost:5173';
  }
  
  // If the variable exists, use it
  if (process.env.CORS_ORIGIN) {
    const origins = process.env.CORS_ORIGIN.split(',').map(origin => origin.trim());
    return origins.length === 1 ? origins[0] : origins;
  }
  
  // FALLBACK (The Fix): If missing, use the known production URL instead of crashing
  console.warn('CORS_ORIGIN missing, using fallback.');
  return 'https://onboarding-frontend-378990906760.us-west3.run.app';
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
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,        // Prevent XSS - JavaScript cannot access
    secure: isProduction,  // HTTPS only in production (required for sameSite: 'none')
    sameSite: isProduction ? 'none' : 'strict',  // 'none' for cross-origin in production, 'strict' for same-origin in dev
    maxAge: 24 * 60 * 60 * 1000,  // 24 hours (match JWT expiration) - only used for setting, not clearing
    path: '/',
    // For Cloud Run behind proxy, domain should not be set (uses request domain)
    // Note: Mobile browsers require secure: true when using sameSite: 'none'
    // Some older mobile browsers may not support sameSite: 'none' properly
  };
};

/**
 * Get cookie options for clearing authentication cookies
 * Must match getAuthCookieOptions() except maxAge (not needed for clearing)
 * 
 * @returns {Object} Cookie options for clearCookie()
 */
const getAuthCookieClearOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,  // HTTPS only in production (required for sameSite: 'none')
    sameSite: isProduction ? 'none' : 'strict',  // Must match getAuthCookieOptions()
    path: '/',
    // Note: maxAge is not needed for clearCookie
    // Note: domain should not be set (matches setting options)
  };
};

export default {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  googleMaps: {
    apiKey: process.env.GOOGLE_MAPS_API_KEY || null
  },
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


import rateLimit from 'express-rate-limit';
import config from '../config/config.js';

// More lenient rate limiting in development
const isDevelopment = config.nodeEnv === 'development';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : 5, // 50 requests in dev, 5 in production
  message: { error: { message: 'Too many login attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
  // Use memory store (default) - resets on server restart
  store: undefined, // Default in-memory store
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: { message: 'Too many requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});


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

export const noteAidLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDevelopment ? 60 : 12, // higher in dev; conservative in prod
  message: { error: { message: 'Too many Note Aid requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `note-aid:${req.user?.id || req.ip}`,
});

export const agentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isDevelopment ? 60 : 10, // keep relatively low in prod (LLMs are expensive)
  message: { error: { message: 'Too many assistant requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `agent:${req.user?.id || req.ip}`,
});

export const publicIntakeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 120 : 30,
  message: { error: { message: 'Too many intake requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `public-intake:${req.ip}`,
});
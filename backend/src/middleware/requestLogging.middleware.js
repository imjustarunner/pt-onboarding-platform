import { sanitizeRequestBody } from '../utils/sanitizeRequest.js';
import config from '../config/config.js';

/**
 * Request logging middleware with automatic body sanitization
 * 
 * Sanitizes request bodies before logging to prevent sensitive data leakage.
 * Redacts fields: token, jwt, sessionToken, authToken, password, authorization, code
 * 
 * IMPORTANT: Sensitive values are NEVER logged, even if truncated.
 * All sensitive fields are completely replaced with '[REDACTED]'.
 * 
 * Usage:
 *   app.use(requestLoggingMiddleware);
 * 
 * This middleware adds a sanitized version of req.body to req.sanitizedBody
 * for safe logging throughout the application.
 * 
 * @example
 * // BEFORE (INSECURE - DO NOT USE):
 * console.log('Request body:', req.body);
 * // Output: { email: 'user@example.com', password: 'secret123', token: 'abc123' }
 * // ❌ SECURITY RISK: Sensitive data exposed in logs
 * 
 * // AFTER (SECURE - USE THIS):
 * console.log('Request body:', req.sanitizedBody);
 * // Output: { email: 'user@example.com', password: '[REDACTED]', token: '[REDACTED]' }
 * // ✅ SECURE: Sensitive data redacted
 * 
 * @example
 * // Example log output with sensitive data:
 * // Input request body:
 * //   { email: 'user@example.com', password: 'secret123', token: 'abc123def456' }
 * // 
 * // Logged output (req.sanitizedBody):
 * //   { email: 'user@example.com', password: '[REDACTED]', token: '[REDACTED]' }
 * //
 * // Note: The token value 'abc123def456' is completely redacted, not truncated.
 * // Even if someone tries to log req.body.token.substring(0, 3), it won't work
 * // because the middleware ensures sensitive fields are never in req.sanitizedBody.
 */
export const requestLoggingMiddleware = (req, res, next) => {
  // Only sanitize if body exists and is an object
  if (req.body && typeof req.body === 'object') {
    // Create sanitized copy and attach to request
    // This allows controllers to use req.sanitizedBody for safe logging
    req.sanitizedBody = sanitizeRequestBody(req.body);
  } else {
    req.sanitizedBody = req.body;
  }

  // In development, optionally log sanitized request body
  // In production, this should be disabled or use a proper logger
  const skipLogPaths = new Set(['/api/presence/heartbeat', '/presence/heartbeat']);
  if (
    config.nodeEnv === 'development' &&
    req.body &&
    Object.keys(req.body).length > 0 &&
    !skipLogPaths.has(req.path)
  ) {
    console.log(`[Request] ${req.method} ${req.path}`, {
      body: req.sanitizedBody,
      query: req.query,
      params: req.params
    });
  }

  next();
};

/**
 * Safe request body logger helper
 * Always uses sanitization - never logs sensitive values
 * 
 * @param {Object} req - Express request object
 * @param {string} context - Optional context string for log message
 * 
 * @example
 * // In controller:
 * safeLogRequestBody(req, 'User registration');
 * // Output: [User registration] Request body: { email: 'user@example.com', password: '[REDACTED]' }
 */
export function safeLogRequestBody(req, context = '') {
  const sanitized = req.sanitizedBody || sanitizeRequestBody(req.body || {});
  const prefix = context ? `[${context}]` : '';
  console.log(`${prefix} Request body:`, sanitized);
}

export default requestLoggingMiddleware;

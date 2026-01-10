/**
 * Sanitize request body by redacting sensitive fields
 * 
 * Ensures sensitive values are NEVER logged, even if truncated.
 * All sensitive fields are completely replaced with '[REDACTED]'.
 * 
 * Redacts the following fields:
 * - token, jwt, sessionToken, authToken
 * - password, authorization, code
 * - Plus additional common sensitive fields (see implementation)
 * 
 * @param {Object|Array} body - Request body object or array
 * @returns {Object|Array} Sanitized copy with sensitive fields redacted
 * 
 * @example
 * // Input:
 * const input = {
 *   email: 'user@example.com',
 *   password: 'secret123',
 *   token: 'abc123def456ghi789',
 *   jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
 *   code: '123456'
 * };
 * 
 * // Output:
 * const output = sanitizeRequestBody(input);
 * // {
 * //   email: 'user@example.com',
 * //   password: '[REDACTED]',
 * //   token: '[REDACTED]',
 * //   jwt: '[REDACTED]',
 * //   code: '[REDACTED]'
 * // }
 * 
 * // IMPORTANT: Sensitive values are completely redacted, not truncated.
 * // Even if you try to log token.substring(0, 3), it won't work because
 * // the value is '[REDACTED]', not the original token.
 * 
 * @example
 * // Log example:
 * console.log('Request body:', sanitizeRequestBody(req.body));
 * // Before: { email: 'user@example.com', password: 'secret123', token: 'abc123' }
 * // After:  { email: 'user@example.com', password: '[REDACTED]', token: '[REDACTED]' }
 * // ✅ Safe to log - no sensitive data exposed
 */
export function sanitizeRequestBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }

  // Handle arrays
  if (Array.isArray(body)) {
    return body.map(item => sanitizeRequestBody(item));
  }

  // Create a shallow copy to avoid mutating original
  const sanitized = { ...body };

  // List of sensitive fields to redact (never log these values, even truncated)
  // These fields are commonly used for authentication and authorization
  const sensitiveFields = [
    'token',              // General tokens (passwordless, invitation, etc.)
    'jwt',                // JWT tokens
    'jwtToken',           // JWT token variants
    'sessionToken',       // Session tokens
    'authToken',          // Authentication tokens
    'password',           // User passwords
    'authorization',      // Authorization codes/tokens
    'code',               // Authorization codes, verification codes
    // Additional common sensitive fields
    'passwordHash',
    'password_hash',
    'passwordless_token',
    'passwordlessToken',
    'invitation_token',
    'invitationToken',
    'resetToken',
    'reset_token',
    'auth_token',
    'session_token',
    'apiKey',
    'api_key',
    'secret',
    'secretKey',
    'secret_key',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'verificationCode',
    'verification_code',
    'otp',
    'oneTimePassword'
  ];

  // Redact sensitive fields - replace with [REDACTED] (never log actual values)
  sensitiveFields.forEach(field => {
    if (sanitized.hasOwnProperty(field)) {
      sanitized[field] = '[REDACTED]';
    }
  });

  // Recursively sanitize nested objects
  Object.keys(sanitized).forEach(key => {
    if (sanitized[key] && typeof sanitized[key] === 'object' && !Array.isArray(sanitized[key])) {
      sanitized[key] = sanitizeRequestBody(sanitized[key]);
    }
  });

  return sanitized;
}

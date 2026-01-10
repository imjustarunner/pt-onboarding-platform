import { sanitizeRequestBody } from '../sanitizeRequest.js';

/**
 * Unit tests for request body sanitization
 * 
 * These tests verify that sensitive fields are properly redacted
 * and never logged, even if truncated.
 * 
 * Run with: node --experimental-vm-modules node_modules/.bin/jest sanitizeRequest.test.js
 * Or use: npm test (if configured)
 */

describe('sanitizeRequestBody', () => {
  test('should redact token field', () => {
    const input = { email: 'user@example.com', token: 'abc123def456' };
    const output = sanitizeRequestBody(input);
    
    expect(output.token).toBe('[REDACTED]');
    expect(output.email).toBe('user@example.com');
    expect(output).not.toHaveProperty('token', 'abc123def456');
  });

  test('should redact jwt field', () => {
    const input = { jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' };
    const output = sanitizeRequestBody(input);
    
    expect(output.jwt).toBe('[REDACTED]');
  });

  test('should redact sessionToken field', () => {
    const input = { sessionToken: 'session_abc123' };
    const output = sanitizeRequestBody(input);
    
    expect(output.sessionToken).toBe('[REDACTED]');
  });

  test('should redact authToken field', () => {
    const input = { authToken: 'auth_xyz789' };
    const output = sanitizeRequestBody(input);
    
    expect(output.authToken).toBe('[REDACTED]');
  });

  test('should redact password field', () => {
    const input = { email: 'user@example.com', password: 'secret123' };
    const output = sanitizeRequestBody(input);
    
    expect(output.password).toBe('[REDACTED]');
    expect(output.email).toBe('user@example.com');
  });

  test('should redact authorization field', () => {
    const input = { authorization: 'Bearer abc123' };
    const output = sanitizeRequestBody(input);
    
    expect(output.authorization).toBe('[REDACTED]');
  });

  test('should redact code field', () => {
    const input = { code: '123456' };
    const output = sanitizeRequestBody(input);
    
    expect(output.code).toBe('[REDACTED]');
  });

  test('should redact multiple sensitive fields', () => {
    const input = {
      email: 'user@example.com',
      token: 'abc123',
      password: 'secret',
      jwt: 'jwt_token',
      sessionToken: 'session_token',
      authToken: 'auth_token',
      authorization: 'Bearer token',
      code: '123456'
    };
    const output = sanitizeRequestBody(input);
    
    expect(output.email).toBe('user@example.com');
    expect(output.token).toBe('[REDACTED]');
    expect(output.password).toBe('[REDACTED]');
    expect(output.jwt).toBe('[REDACTED]');
    expect(output.sessionToken).toBe('[REDACTED]');
    expect(output.authToken).toBe('[REDACTED]');
    expect(output.authorization).toBe('[REDACTED]');
    expect(output.code).toBe('[REDACTED]');
  });

  test('should handle nested objects', () => {
    const input = {
      user: {
        email: 'user@example.com',
        password: 'secret123',
        token: 'abc123'
      }
    };
    const output = sanitizeRequestBody(input);
    
    expect(output.user.email).toBe('user@example.com');
    expect(output.user.password).toBe('[REDACTED]');
    expect(output.user.token).toBe('[REDACTED]');
  });

  test('should handle arrays', () => {
    const input = [
      { email: 'user1@example.com', token: 'token1' },
      { email: 'user2@example.com', password: 'secret' }
    ];
    const output = sanitizeRequestBody(input);
    
    expect(output[0].email).toBe('user1@example.com');
    expect(output[0].token).toBe('[REDACTED]');
    expect(output[1].email).toBe('user2@example.com');
    expect(output[1].password).toBe('[REDACTED]');
  });

  test('should not mutate original object', () => {
    const input = { email: 'user@example.com', token: 'abc123' };
    const output = sanitizeRequestBody(input);
    
    expect(input.token).toBe('abc123'); // Original unchanged
    expect(output.token).toBe('[REDACTED]'); // Copy is sanitized
  });

  test('should handle null and undefined', () => {
    expect(sanitizeRequestBody(null)).toBe(null);
    expect(sanitizeRequestBody(undefined)).toBe(undefined);
    expect(sanitizeRequestBody({})).toEqual({});
  });

  test('should handle non-object values', () => {
    expect(sanitizeRequestBody('string')).toBe('string');
    expect(sanitizeRequestBody(123)).toBe(123);
    expect(sanitizeRequestBody(true)).toBe(true);
  });

  test('should never log sensitive values, even truncated', () => {
    const input = { token: 'abc123def456ghi789' };
    const output = sanitizeRequestBody(input);
    
    // Verify the value is completely redacted, not just truncated
    expect(output.token).toBe('[REDACTED]');
    expect(output.token).not.toContain('abc');
    expect(output.token).not.toContain('123');
    expect(output.token.length).toBe(11); // '[REDACTED]'.length
  });
});

/**
 * Example log output demonstration
 * 
 * BEFORE sanitization:
 *   console.log('Request body:', { email: 'user@example.com', password: 'secret123', token: 'abc123' });
 *   // Output: Request body: { email: 'user@example.com', password: 'secret123', token: 'abc123' }
 *   // ❌ SECURITY RISK: Sensitive data exposed in logs
 * 
 * AFTER sanitization:
 *   console.log('Request body:', sanitizeRequestBody({ email: 'user@example.com', password: 'secret123', token: 'abc123' }));
 *   // Output: Request body: { email: 'user@example.com', password: '[REDACTED]', token: '[REDACTED]' }
 *   // ✅ SECURE: Sensitive data redacted
 * 
 * In middleware:
 *   // req.sanitizedBody is automatically available after requestLoggingMiddleware
 *   console.log('Request body:', req.sanitizedBody);
 *   // Always safe - sensitive fields are redacted
 */

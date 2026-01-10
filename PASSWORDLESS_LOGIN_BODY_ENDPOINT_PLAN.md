# Alternate Passwordless Login Endpoint with Body Sanitization

## Overview

Add a new endpoint `POST /api/auth/passwordless-login` that accepts `{ token }` in JSON body instead of URL params, while keeping the existing `POST /api/auth/passwordless-login/:token` route for backward compatibility. Also implement request body sanitization to prevent sensitive data from being logged.

## Implementation

### 1. Create Request Body Sanitization Utility

**File:** `backend/src/utils/sanitizeRequest.js` (new file)

**Purpose:** Utility function to remove sensitive fields from request bodies before logging.

**Implementation:**
```javascript
/**
 * Sanitize request body by removing sensitive fields
 * @param {Object} body - Request body object
 * @returns {Object} Sanitized copy of request body
 */
export function sanitizeRequestBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }

  // Create a shallow copy to avoid mutating original
  const sanitized = { ...body };

  // List of sensitive fields to remove
  const sensitiveFields = [
    'token',
    'password',
    'passwordHash',
    'password_hash',
    'passwordless_token',
    'passwordlessToken',
    'invitation_token',
    'invitationToken',
    'resetToken',
    'reset_token',
    'authToken',
    'auth_token',
    'jwt',
    'jwtToken',
    'sessionToken',
    'session_token',
    'apiKey',
    'api_key',
    'secret',
    'secretKey',
    'secret_key',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token'
  ];

  // Remove sensitive fields
  sensitiveFields.forEach(field => {
    if (sanitized.hasOwnProperty(field)) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
}
```

### 2. Create New Controller Function for Body-Based Login

**File:** `backend/src/controllers/auth.controller.js`

**Location:** After `passwordlessTokenLogin` function (after line 587)

**Implementation:**
```javascript
/**
 * Passwordless login using token from request body
 * Alternative to URL param-based login for better security (tokens not in URLs)
 */
export const passwordlessTokenLoginFromBody = async (req, res, next) => {
  try {
    const { token, lastName } = req.body; // Token and optional last name from body

    console.log('[passwordlessTokenLoginFromBody] Received token:', token ? `${token.substring(0, 20)}...` : 'null', 'Length:', token?.length);

    if (!token) {
      return res.status(400).json({ error: { message: 'Token is required in request body' } });
    }

    // Reuse the same validation logic as URL param version
    // Validate token
    let user = await User.validatePasswordlessToken(token);
    if (!user) {
      console.log('[passwordlessTokenLoginFromBody] Token validation failed, checking if token exists in DB...');
      // Check if token exists but expired
      const pool = (await import('../config/database.js')).default;
      const [tokenRows] = await pool.execute(
        'SELECT id, passwordless_token, passwordless_token_expires_at, status FROM users WHERE passwordless_token = ?',
        [token.trim()]
      );
      
      if (tokenRows.length > 0) {
        const tokenUser = tokenRows[0];
        console.log('[passwordlessTokenLoginFromBody] Token found in DB:', {
          userId: tokenUser.id,
          status: tokenUser.status,
          expiresAt: tokenUser.passwordless_token_expires_at,
          tokenMatch: tokenUser.passwordless_token === token.trim()
        });
        
        if (tokenUser.passwordless_token_expires_at) {
          const expiresAt = new Date(tokenUser.passwordless_token_expires_at);
          const now = new Date();
          if (expiresAt < now) {
            console.log('[passwordlessTokenLoginFromBody] Token expired. Expires:', expiresAt.toISOString(), 'Now:', now.toISOString());
            return res.status(401).json({ 
              error: { 
                message: 'Token has expired. Please request a new login link.',
                code: 'TOKEN_EXPIRED',
                expiredAt: tokenUser.passwordless_token_expires_at
              } 
            });
          } else {
            console.log('[passwordlessTokenLoginFromBody] Token not expired but validation failed. Possible causes: access locked or other validation issue.');
          }
        }
      } else {
        console.log('[passwordlessTokenLoginFromBody] Token not found in database at all');
        // Check if this token belongs to a different user
        const [allTokenRows] = await pool.execute(
          'SELECT id, first_name, last_name, status, passwordless_token_expires_at FROM users WHERE passwordless_token = ?',
          [token.trim()]
        );
        if (allTokenRows.length > 0) {
          const tokenUser = allTokenRows[0];
          console.log('[passwordlessTokenLoginFromBody] Token belongs to different user:', tokenUser.id, tokenUser.first_name, tokenUser.last_name);
          return res.status(401).json({ 
            error: { 
              message: 'This login link belongs to a different user. Please use the correct link for your account.',
              code: 'TOKEN_USER_MISMATCH'
            } 
          });
        }
      }
      
      return res.status(401).json({ error: { message: 'Invalid or expired token' } });
    }
    
    console.log('[passwordlessTokenLoginFromBody] Token validated, user:', user.id, 'status:', user.status);

    // For pending users, ALWAYS require last name verification for security
    if (user.status === 'pending') {
      if (!lastName) {
        return res.status(400).json({ 
          error: { 
            message: 'Last name verification required',
            requiresIdentityVerification: true
          } 
        });
      }
      
      // Validate last name
      user = await User.validatePendingIdentity(token, lastName);
      if (!user) {
        return res.status(401).json({ error: { message: 'Last name does not match' } });
      }
      
      // Mark as verified if not already
      if (!user.pending_identity_verified) {
        const pool = (await import('../config/database.js')).default;
        await pool.execute(
          'UPDATE users SET pending_identity_verified = TRUE WHERE id = ?',
          [user.id]
        );
      }
    }

    // Check if user is inactive (but allow pending users)
    const fullUser = await User.findById(user.id);
    if (!fullUser) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }
    
    // For non-pending users, check if inactive
    if (fullUser.status !== 'pending' && fullUser.status !== 'ready_for_review' && (fullUser.is_active === false || fullUser.is_active === 0)) {
      return res.status(403).json({ error: { message: 'Account is inactive' } });
    }

    // Generate JWT token for session
    try {
      const jwtToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role, status: user.status },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      // Set secure HttpOnly cookie for authentication
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict', // Will be updated to 'none' in CSRF fix
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/',
      };
      res.cookie('authToken', jwtToken, cookieOptions);

      // Get user agencies
      const userAgencies = await User.getAgencies(user.id);

      // Log login activity using centralized service
      ActivityLogService.logActivity({
        actionType: 'login',
        userId: user.id,
        metadata: {
          email: user.email,
          role: user.role,
          loginType: 'passwordless',
          isPending: user.status === 'pending',
          method: 'body' // Indicate this was body-based login
        }
      }, req);

      console.log('[passwordlessTokenLoginFromBody] Login successful for user:', user.id, user.first_name, user.last_name);
      
      const response = {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          status: user.status
        },
        agencies: userAgencies,
        requiresPasswordChange: user.status !== 'pending',
        message: user.status === 'pending' 
          ? 'Login successful. Complete your pre-hire checklist.' 
          : 'Login successful. Please change your password.'
      };

      // Only include token in response if feature flag is enabled
      if (config.exposeTokenInResponse) {
        response.token = jwtToken;
      }

      res.json(response);
    } catch (jwtError) {
      console.error('[passwordlessTokenLoginFromBody] Error generating JWT:', jwtError);
      return res.status(500).json({ 
        error: { 
          message: 'Failed to create session. Please try again.',
          code: 'JWT_ERROR'
        } 
      });
    }
  } catch (error) {
    next(error);
  }
};
```

### 3. Add Route for New Endpoint

**File:** `backend/src/routes/auth.routes.js`

**Location:** After line 118 (after existing passwordless-login route)

**Change:**
```javascript
import { login, register, approvedEmployeeLogin, logout, logActivity, passwordlessTokenLogin, passwordlessTokenLoginFromBody, verifyPendingIdentity } from '../controllers/auth.controller.js';
```

**Add route:**
```javascript
// Old route: token in URL (kept for backward compatibility)
router.post('/passwordless-login/:token', passwordlessTokenLogin);

// New route: token in request body (preferred, more secure)
router.post('/passwordless-login', [
  body('token').notEmpty().withMessage('Token is required'),
  body('lastName').optional().trim()
], passwordlessTokenLoginFromBody);
```

### 4. Update Request Body Logging to Use Sanitization

**File:** `backend/src/controllers/auth.controller.js`

**Location:** Line 634 (in `register` function)

**Add import at top:**
```javascript
import { sanitizeRequestBody } from '../utils/sanitizeRequest.js';
```

**Change:**
```javascript
// Before:
console.error('Request body:', req.body);

// After:
const { sanitizeRequestBody } = await import('../utils/sanitizeRequest.js');
console.error('Request body:', sanitizeRequestBody(req.body));
```

**Alternative (if import at top):**
```javascript
console.error('Request body:', sanitizeRequestBody(req.body));
```

### 5. Add Validation for New Endpoint

**File:** `backend/src/routes/auth.routes.js`

**Location:** Add validation middleware for new route

**Implementation:**
```javascript
const validatePasswordlessLoginBody = [
  body('token')
    .notEmpty()
    .withMessage('Token is required')
    .isString()
    .withMessage('Token must be a string')
    .trim(),
  body('lastName')
    .optional()
    .trim()
    .isString()
    .withMessage('Last name must be a string')
];

// New route with validation
router.post('/passwordless-login', validatePasswordlessLoginBody, passwordlessTokenLoginFromBody);
```

## Files to Create/Modify

1. **New File:** `backend/src/utils/sanitizeRequest.js` - Sanitization utility
2. **Modify:** `backend/src/controllers/auth.controller.js`:
   - Add import for `sanitizeRequestBody`
   - Add new `passwordlessTokenLoginFromBody` function
   - Update request body logging (line 634)
3. **Modify:** `backend/src/routes/auth.routes.js`:
   - Add import for `passwordlessTokenLoginFromBody`
   - Add validation middleware
   - Add new route `POST /passwordless-login`

## API Usage

### Old Endpoint (Backward Compatible)
```bash
POST /api/auth/passwordless-login/:token
Body: { "lastName": "Smith" }  # Optional
```

### New Endpoint (Preferred)
```bash
POST /api/auth/passwordless-login
Body: { 
  "token": "abc123...",
  "lastName": "Smith"  # Optional, required for pending users
}
```

## Security Benefits

1. **Tokens Not in URLs:**
   - Tokens not exposed in browser history
   - Tokens not in server access logs (URL params)
   - Tokens not in referrer headers

2. **Request Body Sanitization:**
   - Sensitive fields removed from logs
   - Prevents accidental token leakage
   - Protects passwords, tokens, secrets

3. **Backward Compatibility:**
   - Old endpoint still works
   - Gradual migration possible
   - No breaking changes

## Testing

### Test New Endpoint
```bash
curl -X POST http://localhost:3000/api/auth/passwordless-login \
  -H "Content-Type: application/json" \
  -d '{"token": "your-token-here", "lastName": "Smith"}'
```

### Test Old Endpoint (Still Works)
```bash
curl -X POST http://localhost:3000/api/auth/passwordless-login/your-token-here \
  -H "Content-Type: application/json" \
  -d '{"lastName": "Smith"}'
```

### Verify Sanitization
- Check server logs after making requests
- Verify sensitive fields show as `[REDACTED]`
- Verify tokens not in logs

## Migration Path

1. **Phase 1:** Deploy both endpoints (current)
2. **Phase 2:** Update frontend to use new endpoint
3. **Phase 3:** Monitor usage of old endpoint
4. **Phase 4:** Deprecate old endpoint (add deprecation warning)
5. **Phase 5:** Remove old endpoint (after sufficient migration period)

# Token Response Security Plan

## Executive Summary

This plan addresses security concerns with JWT tokens being returned in API responses. Tokens should be stored in HttpOnly cookies only, not exposed in response bodies.

---

## Current State Analysis

### Endpoints Returning JWT Tokens in Responses

#### 1. **`POST /api/auth/approved-employee-login`**
- **File:** `backend/src/controllers/auth.controller.js:159-169`
- **Current:** Returns `token: sessionToken` in response
- **Cookie:** ✅ Sets `authToken` cookie (HttpOnly)
- **Issue:** Token exposed in response body

```javascript
res.json({
  token: sessionToken,  // ❌ EXPOSED
  user: { ... },
  sessionId,
  agencies: agencyIds
});
```

#### 2. **`POST /api/auth/login`**
- **File:** `backend/src/controllers/auth.controller.js:339-352`
- **Current:** Returns `token` in response
- **Cookie:** ✅ Sets `authToken` cookie (HttpOnly)
- **Issue:** Token exposed in response body

```javascript
const responseData = {
  token,  // ❌ EXPOSED
  user: { ... },
  sessionId
};
res.json(responseData);
```

#### 3. **`POST /api/auth/passwordless-login/:token`**
- **File:** `backend/src/controllers/auth.controller.js:559-574`
- **Current:** Returns `token: jwtToken` in response
- **Cookie:** ❌ **MISSING** - Does not set cookie (critical bug)
- **Issue:** Token exposed in response body AND not set in cookie

```javascript
res.json({
  token: jwtToken,  // ❌ EXPOSED
  user: { ... },
  agencies: userAgencies,
  // ...
});
```

#### 4. **`GET /api/users/:id/generate-invitation-token`** (Non-JWT)
- **File:** `backend/src/controllers/user.controller.js:794-808`
- **Current:** Returns `token` (passwordless invitation token, not JWT)
- **Purpose:** Admin generates invitation link for user
- **Note:** This is a passwordless token (not JWT), but still sensitive
- **Recommendation:** Consider if this needs to be in response or just in email

---

### Token Logging Analysis

#### ✅ **Safe Logging Practices Found:**

1. **Truncated token logging** (`auth.controller.js:430`):
   ```javascript
   console.log('[passwordlessTokenLogin] Received token:', token ? `${token.substring(0, 20)}...` : 'null', 'Length:', token?.length);
   ```
   ✅ Only logs first 20 characters (safe)

2. **No full token logging** in:
   - `approvedEmployeeLogin`
   - `login`
   - `passwordlessTokenLogin` (JWT generation)
   - `logout`

3. **Safe logging** in `auth.controller.js:351`:
   ```javascript
   console.log('Login successful for user:', user.email, 'Session ID:', sessionId);
   ```
   ✅ Logs email and sessionId, not token

#### ⚠️ **Potential Concerns:**

1. **Error logging** (`auth.controller.js:576`):
   ```javascript
   console.error('[passwordlessTokenLogin] Error generating JWT:', jwtError);
   ```
   ✅ Safe - only logs error object, not token

2. **Request body logging** (`auth.controller.js:634`):
   ```javascript
   console.error('Request body:', req.body);
   ```
   ⚠️ **RISK** - If request body contains tokens, they could be logged
   - **Mitigation:** Ensure no endpoints accept tokens in request body (they should be in cookies/headers)

---

## Implementation Plan

### Phase 1: Add Feature Flag Configuration

**File:** `backend/src/config/config.js`

Add feature flag to control token exposure:

```javascript
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
  // NEW: Feature flag for token exposure in responses
  // In production: false (tokens only in cookies)
  // In development: true (for backward compatibility/testing)
  exposeTokenInResponse: process.env.EXPOSE_TOKEN_IN_RESPONSE === 'true' || process.env.NODE_ENV === 'development'
};
```

**Environment Variables:**
- **Production:** `EXPOSE_TOKEN_IN_RESPONSE=false` (or omit, defaults to false)
- **Development:** `EXPOSE_TOKEN_IN_RESPONSE=true` (or omit, defaults to true in dev)

---

### Phase 2: Update Authentication Endpoints

#### 2.1 Update `approvedEmployeeLogin`

**File:** `backend/src/controllers/auth.controller.js:159-169`

**Before:**
```javascript
res.json({
  token: sessionToken,
  user: { ... },
  sessionId,
  agencies: agencyIds
});
```

**After:**
```javascript
const response = {
  user: {
    email: matchedEmployee.email,
    role: 'approved_employee',
    type: 'approved_employee',
    agencyIds: agencyIds
  },
  sessionId,
  agencies: agencyIds
};

// Only include token in response if feature flag is enabled (dev/backward compatibility)
if (config.exposeTokenInResponse) {
  response.token = sessionToken;
}

res.json(response);
```

---

#### 2.2 Update `login`

**File:** `backend/src/controllers/auth.controller.js:339-352`

**Before:**
```javascript
const responseData = {
  token,
  user: { ... },
  sessionId
};
res.json(responseData);
```

**After:**
```javascript
const responseData = {
  user: {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.first_name,
    lastName: user.last_name
  },
  sessionId
};

// Only include token in response if feature flag is enabled (dev/backward compatibility)
if (config.exposeTokenInResponse) {
  responseData.token = token;
}

console.log('Login successful for user:', user.email, 'Session ID:', sessionId);
res.json(responseData);
```

---

#### 2.3 Update `passwordlessTokenLogin` (CRITICAL: Also Fix Missing Cookie)

**File:** `backend/src/controllers/auth.controller.js:534-574`

**Before:**
```javascript
const jwtToken = jwt.sign(
  { id: user.id, email: user.email, role: user.role, status: user.status },
  config.jwt.secret,
  { expiresIn: config.jwt.expiresIn }
);

// ... activity logging ...

res.json({
  token: jwtToken,  // ❌ EXPOSED + ❌ NOT IN COOKIE
  user: { ... },
  agencies: userAgencies,
  // ...
});
```

**After:**
```javascript
const jwtToken = jwt.sign(
  { id: user.id, email: user.email, role: user.role, status: user.status },
  config.jwt.secret,
  { expiresIn: config.jwt.expiresIn }
);

// Set secure HttpOnly cookie for authentication (FIX: Was missing!)
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'none',  // Required for cross-origin (will be updated in CSRF fix)
  maxAge: 24 * 60 * 60 * 1000,  // 24 hours
  path: '/',
};
res.cookie('authToken', jwtToken, cookieOptions);

// ... activity logging ...

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

// Only include token in response if feature flag is enabled (dev/backward compatibility)
if (config.exposeTokenInResponse) {
  response.token = jwtToken;
}

res.json(response);
```

---

#### 2.4 Update `generateInvitationToken` (Optional - Non-JWT)

**File:** `backend/src/controllers/user.controller.js:794-808`

**Decision:** This returns a passwordless invitation token (not JWT), used by admins to generate invitation links.

**Options:**
1. **Keep as-is** - Admin needs token to create invitation link
2. **Remove from response** - Token only sent via email (if email sending is implemented)
3. **Feature flag** - Only return in dev, require email in production

**Recommendation:** Keep as-is for now (admin-only endpoint, token is for invitation links, not authentication). Consider moving to email-only in future.

---

### Phase 3: Update Frontend

**Issue Found:** Frontend checks for `token` in response but doesn't use it (already passes `null` to `setAuth`).

**File:** `frontend/src/store/auth.js:70-82`

**Current:**
```javascript
console.log('Login response received:', { 
  hasToken: !!response.data.token,  // ⚠️ Checks for token
  hasUser: !!response.data.user,
  hasSessionId: !!response.data.sessionId,
  hasAgencies: !!response.data.agencies
});

if (!response.data.token || !response.data.user) {  // ❌ Requires token in response
  console.error('Invalid login response:', response.data);
  return { 
    success: false, 
    error: 'Invalid response from server. Please try again.' 
  };
}

// Token is in HttpOnly cookie (set by backend), so pass null
setAuth(null, response.data.user, response.data.sessionId);  // ✅ Already uses null
```

**Fix:**
```javascript
console.log('Login response received:', { 
  hasUser: !!response.data.user,
  hasSessionId: !!response.data.sessionId,
  hasAgencies: !!response.data.agencies
});

// Token is in HttpOnly cookie, so we only check for user
if (!response.data.user) {
  console.error('Invalid login response:', response.data);
  return { 
    success: false, 
    error: 'Invalid response from server. Please try again.' 
  };
}

// Token is in HttpOnly cookie (set by backend), so pass null
setAuth(null, response.data.user, response.data.sessionId);
```

**Files to Update:**
- ✅ `frontend/src/store/auth.js` - Remove token check from validation

---

### Phase 4: Secure Logging Improvements

**File:** `backend/src/controllers/auth.controller.js:634`

**Current:**
```javascript
console.error('Request body:', req.body);
```

**Risk:** If any endpoint accepts tokens in request body, they could be logged.

**Fix:**
```javascript
// Sanitize request body before logging (remove sensitive fields)
const sanitizedBody = { ...req.body };
delete sanitizedBody.token;
delete sanitizedBody.password;
delete sanitizedBody.passwordless_token;
console.error('Request body:', sanitizedBody);
```

**Or:** Only log request body in development:
```javascript
if (config.nodeEnv === 'development') {
  const sanitizedBody = { ...req.body };
  delete sanitizedBody.token;
  delete sanitizedBody.password;
  delete sanitizedBody.passwordless_token;
  console.error('Request body:', sanitizedBody);
}
```

---

## Testing Plan

### 1. Development Testing (Feature Flag Enabled)

- ✅ Verify tokens still returned in responses (backward compatibility)
- ✅ Verify cookies are set correctly
- ✅ Verify frontend can authenticate using cookies

### 2. Production Testing (Feature Flag Disabled)

- ✅ Verify tokens NOT returned in responses
- ✅ Verify cookies are set correctly
- ✅ Verify frontend can authenticate using cookies only
- ✅ Verify no breaking changes in API consumers

### 3. Security Testing

- ✅ Verify tokens not in response bodies (production)
- ✅ Verify tokens not logged server-side
- ✅ Verify cookies are HttpOnly and Secure
- ✅ Verify `passwordlessTokenLogin` sets cookie (critical fix)

---

## Deployment Checklist

### Pre-Deployment

- [ ] Add `EXPOSE_TOKEN_IN_RESPONSE` to environment variables
- [ ] Update all three authentication endpoints
- [ ] Fix missing cookie in `passwordlessTokenLogin`
- [ ] Add request body sanitization for logging
- [ ] Test in development with flag enabled
- [ ] Test in development with flag disabled

### Production Deployment

- [ ] Set `EXPOSE_TOKEN_IN_RESPONSE=false` in production
- [ ] Verify tokens not in responses (check network tab)
- [ ] Verify cookies are set correctly
- [ ] Verify authentication still works
- [ ] Monitor for any breaking changes

### Rollback Plan

- If issues occur, set `EXPOSE_TOKEN_IN_RESPONSE=true` temporarily
- Tokens will be returned in responses again (backward compatible)
- Fix issues and redeploy

---

## Security Benefits

1. **Reduced Token Exposure:**
   - Tokens no longer in response bodies (production)
   - Tokens only in HttpOnly cookies (XSS protection)
   - Tokens not in browser history/network logs

2. **Improved Logging Security:**
   - Request bodies sanitized before logging
   - No risk of token leakage in logs

3. **Backward Compatibility:**
   - Feature flag allows gradual migration
   - Development/testing can still access tokens if needed

---

## Summary

### Endpoints Returning Tokens

**JWT Authentication Tokens (Must Fix):**
1. ✅ `POST /api/auth/approved-employee-login` - Remove token from response
2. ✅ `POST /api/auth/login` - Remove token from response
3. ✅ `POST /api/auth/passwordless-login/:token` - Remove token from response + **FIX: Add missing cookie**

**Non-JWT Tokens (Consider):**
4. ⚠️ `GET /api/users/:id/generate-invitation-token` - Returns passwordless invitation token (admin-only, consider email-only)

### Token Logging Status

**✅ CONFIRMED: No Full Token Logging**

**Safe Logging Practices:**
- ✅ Truncated token logging: `token.substring(0, 20)...` (first 20 chars only)
- ✅ No full JWT tokens logged in:
  - `approvedEmployeeLogin`
  - `login`
  - `passwordlessTokenLogin`
  - `logout`
- ✅ Only logs email, sessionId, user IDs (safe)

**⚠️ Potential Risk:**
- Request body logging (`auth.controller.js:634`) could expose tokens if endpoints accept tokens in body
- **Mitigation:** Sanitize request body before logging (remove `token`, `password`, `passwordless_token`)

**Recommendation:** Add request body sanitization to prevent accidental token logging.

### Feature Flag Configuration

**Environment Variable:**
- `EXPOSE_TOKEN_IN_RESPONSE=true` (dev) / `false` (production)

**Defaults:**
- Development: `true` (backward compatibility)
- Production: `false` (secure by default)

**Implementation:**
```javascript
exposeTokenInResponse: process.env.EXPOSE_TOKEN_IN_RESPONSE === 'true' || process.env.NODE_ENV === 'development'
```

### Frontend Updates Required

**File:** `frontend/src/store/auth.js`
- Remove `hasToken` check from response validation
- Remove `response.data.token` from validation condition
- Frontend already uses `setAuth(null, ...)` (token in cookie), so no functional changes needed

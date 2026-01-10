# Implement EXPOSE_TOKEN_IN_RESPONSE Feature Flag

## Overview

Add a feature flag `EXPOSE_TOKEN_IN_RESPONSE` that controls whether JWT tokens are included in authentication response bodies. When `false` (default), tokens are only set in HttpOnly cookies. When `true`, tokens are included in both cookies and response bodies for backward compatibility.

## Requirements

- Default: `false` (tokens NOT in responses, secure by default)
- When `false`: Remove `token` field from all three authentication endpoints
- When `true`: Keep existing behavior (tokens in responses)
- Cookies must ALWAYS be set regardless of flag value
- No breaking changes to cookie-based authentication

## Implementation

### 1. Add Feature Flag to Config

**File:** `backend/src/config/config.js`

**Location:** Add to exported config object (after line 39)

**Change:**
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
  // Feature flag: Control whether tokens are exposed in response bodies
  // Default: false (tokens only in HttpOnly cookies, secure by default)
  // Set to true for backward compatibility (tokens in both cookies and responses)
  exposeTokenInResponse: process.env.EXPOSE_TOKEN_IN_RESPONSE === 'true'
};
```

**Environment Variable:**
- `EXPOSE_TOKEN_IN_RESPONSE=false` (default, secure)
- `EXPOSE_TOKEN_IN_RESPONSE=true` (backward compatibility)

### 2. Update `approvedEmployeeLogin` Endpoint

**File:** `backend/src/controllers/auth.controller.js`

**Location:** Lines 159-169 (response object)

**Current:**
```javascript
res.json({
  token: sessionToken,
  user: {
    email: matchedEmployee.email,
    role: 'approved_employee',
    type: 'approved_employee',
    agencyIds: agencyIds
  },
  sessionId,
  agencies: agencyIds
});
```

**Change to:**
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

// Only include token in response if feature flag is enabled
if (config.exposeTokenInResponse) {
  response.token = sessionToken;
}

res.json(response);
```

**Note:** Cookie is already set at line 140, no changes needed there.

### 3. Update `login` Endpoint

**File:** `backend/src/controllers/auth.controller.js`

**Location:** Lines 339-352 (responseData object)

**Current:**
```javascript
const responseData = {
  token,
  user: {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.first_name,
    lastName: user.last_name
  },
  sessionId
};

console.log('Login successful for user:', user.email, 'Session ID:', sessionId);
res.json(responseData);
```

**Change to:**
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

// Only include token in response if feature flag is enabled
if (config.exposeTokenInResponse) {
  responseData.token = token;
}

console.log('Login successful for user:', user.email, 'Session ID:', sessionId);
res.json(responseData);
```

**Note:** Cookie is already set at line 280, no changes needed there.

### 4. Update `passwordlessTokenLogin` Endpoint

**File:** `backend/src/controllers/auth.controller.js`

**Location:** Lines 559-574 (response object)

**Current:**
```javascript
res.json({
  token: jwtToken,
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
});
```

**Change to:**
```javascript
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
```

**Note:** Cookie should be set after JWT generation (this is part of the previous plan fix). Ensure cookie is set regardless of flag value.

### 5. Update Frontend (Remove Token Validation)

**File:** `frontend/src/store/auth.js`

**Location:** Lines 69-82 (login response validation)

**Current:**
```javascript
console.log('Login response received:', { 
  hasToken: !!response.data.token, 
  hasUser: !!response.data.user,
  hasSessionId: !!response.data.sessionId,
  hasAgencies: !!response.data.agencies
});

if (!response.data.token || !response.data.user) {
  console.error('Invalid login response:', response.data);
  return { 
    success: false, 
    error: 'Invalid response from server. Please try again.' 
  };
}
```

**Change to:**
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
```

**Rationale:** Frontend already uses cookies (`setAuth(null, ...)`), so token validation is unnecessary and will break when flag is `false`.

## Testing Plan

### Test Case 1: Flag = false (Default, Secure)

**Setup:**
```bash
# Don't set EXPOSE_TOKEN_IN_RESPONSE, or set to false
export EXPOSE_TOKEN_IN_RESPONSE=false
# or omit the variable (defaults to false)
```

**Expected Behavior:**
- ✅ Cookies are set in all three endpoints
- ✅ No `token` field in response bodies
- ✅ Frontend authentication works (uses cookies)
- ✅ Subsequent API calls succeed (cookies sent automatically)

**Test Steps:**
1. Login via `POST /api/auth/login`
   - Check response: No `token` field
   - Check Set-Cookie header: `authToken` present
2. Login via `POST /api/auth/approved-employee-login`
   - Check response: No `token` field
   - Check Set-Cookie header: `authToken` present
3. Login via `POST /api/auth/passwordless-login/:token`
   - Check response: No `token` field
   - Check Set-Cookie header: `authToken` present
4. Make authenticated request: `GET /api/users/me`
   - Should succeed (cookie sent automatically)

### Test Case 2: Flag = true (Backward Compatibility)

**Setup:**
```bash
export EXPOSE_TOKEN_IN_RESPONSE=true
```

**Expected Behavior:**
- ✅ Cookies are set in all three endpoints
- ✅ `token` field present in response bodies
- ✅ Frontend authentication works (uses cookies, ignores response token)
- ✅ Backward compatible with clients that read tokens from responses

**Test Steps:**
1. Login via all three endpoints
   - Check response: `token` field present
   - Check Set-Cookie header: `authToken` present
2. Verify both cookie and response token work for authentication

## Files to Modify

1. `backend/src/config/config.js` - Add `exposeTokenInResponse` config (line ~40)
2. `backend/src/controllers/auth.controller.js` - Update three endpoints:
   - `approvedEmployeeLogin` (line ~159)
   - `login` (line ~339)
   - `passwordlessTokenLogin` (line ~559)
3. `frontend/src/store/auth.js` - Remove token validation (line ~69)

## Environment Variables

**Production (Secure):**
```bash
# Don't set, or explicitly set to false
EXPOSE_TOKEN_IN_RESPONSE=false
```

**Development (Backward Compatibility, if needed):**
```bash
EXPOSE_TOKEN_IN_RESPONSE=true
```

**Docker/Cloud Run:**
- Add to environment variables in deployment config
- Default: not set = `false` (secure)

## Verification Checklist

- [ ] Config exports `exposeTokenInResponse` (defaults to `false`)
- [ ] `approvedEmployeeLogin` conditionally includes token
- [ ] `login` conditionally includes token
- [ ] `passwordlessTokenLogin` conditionally includes token
- [ ] Cookies are ALWAYS set regardless of flag value
- [ ] Frontend no longer validates token in response
- [ ] Test with flag `false`: No tokens in responses, cookies work
- [ ] Test with flag `true`: Tokens in responses, backward compatible
- [ ] No breaking changes to authentication flow

## Security Benefits

1. **Default Secure:** Tokens not exposed in responses by default
2. **Cookie-Only Auth:** Tokens only in HttpOnly cookies (XSS protection)
3. **Backward Compatible:** Flag allows gradual migration
4. **No Token Leakage:** Tokens not in browser history, network logs, or response bodies (when flag is false)

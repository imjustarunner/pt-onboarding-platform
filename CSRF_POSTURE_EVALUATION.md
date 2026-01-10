# CSRF Posture Evaluation

## Current State Analysis

### ⚠️ **Critical Finding: Not Using Cookie-Based Auth Yet**

**Current Implementation:**
- **Authentication Method:** JWT tokens in `Authorization` header (Bearer tokens)
- **Token Storage:** `localStorage` in frontend
- **Token Transmission:** Via `Authorization: Bearer <token>` header
- **No Cookies:** No authentication cookies are being set or used

**Implication:** The system is **NOT currently vulnerable to CSRF attacks** because:
- JWT tokens in `Authorization` headers are **NOT automatically sent** by browsers
- CSRF attacks rely on browsers automatically including cookies in cross-origin requests
- Since no cookies are used for auth, CSRF is not a current threat

**However:** If you migrate to cookie-based auth (as planned), CSRF protection becomes **critical**.

---

## CORS Configuration Analysis

### ✅ **CORS Configuration is Secure**

**Current Configuration** (`backend/src/server.js:50-53`):
```javascript
app.use(cors({
  origin: config.cors.origin,  // ✅ NOT using '*'
  credentials: true            // ✅ Allows cookies (when implemented)
}));
```

**Origin Resolution** (`backend/src/config/config.js:6-27`):
- **Development:** `http://localhost:5173` (specific origin)
- **Production:** `process.env.CORS_ORIGIN` (specific origin, required)
- **Multiple Origins:** Supported via comma-separated list
- **No Wildcard:** Never uses `'*'` origin

**Security Status:** ✅ **SECURE**
- ✅ Not using `Access-Control-Allow-Origin: *` with `credentials: true`
- ✅ Specific origin(s) are configured
- ✅ `credentials: true` is set (necessary for cookies, but safe with specific origins)

---

## CSRF Risk Assessment

### Current State (JWT in Headers): **LOW RISK**

| Attack Vector | Risk | Explanation |
|---------------|------|-------------|
| CSRF via Form Submission | ❌ **Not Possible** | Browsers don't auto-send `Authorization` headers |
| CSRF via Image/Link | ❌ **Not Possible** | Browsers don't auto-send `Authorization` headers |
| CSRF via AJAX/Fetch | ⚠️ **Possible but Unlikely** | Requires JavaScript execution (XSS would be needed) |
| CSRF via Same-Origin | ❌ **Not Applicable** | Same-origin requests are not CSRF |

**Conclusion:** Current JWT-in-header approach is **CSRF-resistant by design**.

### Future State (Cookie-Based Auth): **HIGH RISK**

If you migrate to cookie-based auth, CSRF becomes a **critical vulnerability**:

| Attack Vector | Risk | Explanation |
|---------------|------|-------------|
| CSRF via Form Submission | 🔴 **HIGH** | Browsers auto-send cookies in cross-origin POST requests |
| CSRF via Image/Link | 🟡 **MEDIUM** | Browsers auto-send cookies in GET requests (if cookies allow) |
| CSRF via AJAX/Fetch | 🔴 **HIGH** | Browsers auto-send cookies in CORS requests with `credentials: true` |
| CSRF via Same-Origin | ❌ **Not Applicable** | Same-origin requests are not CSRF |

**Conclusion:** Cookie-based auth **requires** CSRF protection.

---

## Same-Origin vs Cross-Origin Analysis

### Current Deployment Model

**Assumption:** Frontend and backend are on **different origins** (e.g., `https://app.example.com` and `https://api.example.com`)

**CORS Configuration Impact:**
- ✅ `credentials: true` allows cookies in cross-origin requests
- ✅ Specific origin prevents unauthorized origins from accessing API
- ⚠️ Cross-origin requests with cookies are vulnerable to CSRF

### Same-Origin Configuration (Recommended)

**If frontend and backend are on the same origin** (e.g., both on `https://app.example.com`):
- ✅ No CORS needed (same-origin requests)
- ✅ Cookies work automatically
- ✅ **CSRF protection via SameSite cookies is sufficient**
- ✅ No need for CSRF tokens

**If frontend and backend are on different origins** (e.g., `https://app.example.com` and `https://api.example.com`):
- ⚠️ CORS required
- ⚠️ Cookies work with `credentials: true`
- ⚠️ **CSRF tokens required** (SameSite alone is not sufficient for cross-origin)

---

## Cookie Security Recommendations

### For Same-Origin Deployment (Recommended)

**Configuration:**
```javascript
// Backend: Set authentication cookie
res.cookie('authToken', token, {
  httpOnly: true,        // ✅ Prevents XSS access
  secure: true,          // ✅ HTTPS only (production)
  sameSite: 'strict',    // ✅ CSRF protection (same-origin only)
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: '/api'           // ✅ Limit cookie scope
});
```

**CSRF Protection:** ✅ **SameSite='strict' is sufficient** for same-origin

**CORS:** Not needed (same-origin requests)

### For Cross-Origin Deployment

**Configuration:**
```javascript
// Backend: Set authentication cookie
res.cookie('authToken', token, {
  httpOnly: true,        // ✅ Prevents XSS access
  secure: true,          // ✅ HTTPS only (production)
  sameSite: 'lax',       // ⚠️ Allows cross-origin GET (needed for redirects)
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: '/api'           // ✅ Limit cookie scope
});
```

**CSRF Protection:** ⚠️ **SameSite='lax' is NOT sufficient** - requires CSRF tokens

**CORS:** Required with specific origin

---

## CSRF Protection Strategies

### Strategy 1: SameSite='strict' (Same-Origin Only)

**Best For:** Same-origin deployments (frontend and backend on same domain)

**Implementation:**
```javascript
res.cookie('authToken', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',  // ✅ Blocks all cross-origin requests
  maxAge: 24 * 60 * 60 * 1000
});
```

**CSRF Protection Level:** ✅ **Strong** (browser blocks cross-origin cookie transmission)

**Limitations:**
- ❌ Does NOT work for cross-origin deployments
- ❌ Blocks legitimate cross-origin redirects (e.g., OAuth callbacks)

### Strategy 2: SameSite='lax' + CSRF Tokens (Cross-Origin)

**Best For:** Cross-origin deployments (frontend and backend on different domains)

**Implementation:**

**Backend:**
```javascript
import csrf from 'csurf';
import cookieParser from 'cookie-parser';

// Parse cookies
app.use(cookieParser());

// CSRF protection middleware
const csrfProtection = csrf({ 
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict'  // CSRF token cookie is same-origin only
  }
});

// Generate CSRF token endpoint (GET only, no CSRF check)
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Apply CSRF protection to state-changing requests
app.use('/api', (req, res, next) => {
  // Skip CSRF for GET, HEAD, OPTIONS (safe methods)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  // Apply CSRF to POST, PUT, DELETE, PATCH
  csrfProtection(req, res, next);
});
```

**Frontend:**
```javascript
// Fetch CSRF token on app load
let csrfToken = null;

async function getCsrfToken() {
  const response = await api.get('/csrf-token');
  csrfToken = response.data.csrfToken;
  return csrfToken;
}

// Include CSRF token in state-changing requests
api.interceptors.request.use((config) => {
  if (csrfToken && ['post', 'put', 'delete', 'patch'].includes(config.method)) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});
```

**CSRF Protection Level:** ✅ **Strong** (double-submit cookie pattern)

**Requirements:**
- ✅ CSRF token cookie (HttpOnly, Secure, SameSite='strict')
- ✅ CSRF token in request header (X-CSRF-Token)
- ✅ Server validates token matches cookie

### Strategy 3: Double-Submit Cookie Pattern (Custom)

**Best For:** Cross-origin deployments without `csurf` library

**Implementation:**

**Backend:**
```javascript
import crypto from 'crypto';

// Generate CSRF token
function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Set CSRF token cookie
app.use((req, res, next) => {
  if (!req.cookies.csrfToken) {
    const token = generateCsrfToken();
    res.cookie('csrfToken', token, {
      httpOnly: false,  // ⚠️ Must be readable by JavaScript
      secure: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });
  }
  next();
});

// Validate CSRF token
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  const cookieToken = req.cookies.csrfToken;
  const headerToken = req.headers['x-csrf-token'];
  
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: { message: 'Invalid CSRF token' } });
  }
  
  next();
});
```

**Frontend:**
```javascript
// Read CSRF token from cookie (must be httpOnly: false)
function getCsrfToken() {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith('csrfToken='))
    ?.split('=')[1];
}

// Include in requests
api.interceptors.request.use((config) => {
  if (['post', 'put', 'delete', 'patch'].includes(config.method)) {
    const token = getCsrfToken();
    if (token) {
      config.headers['X-CSRF-Token'] = token;
    }
  }
  return config;
});
```

**CSRF Protection Level:** ✅ **Strong** (double-submit cookie pattern)

**Trade-offs:**
- ⚠️ CSRF token cookie must be readable by JavaScript (`httpOnly: false`)
- ✅ Simpler than `csurf` (no server-side session storage needed)

---

## Recommended Configuration

### Option A: Same-Origin Deployment (BEST)

**Deployment:**
- Frontend: `https://app.example.com`
- Backend: `https://app.example.com/api` (or `/api` path on same domain)

**Configuration:**
```javascript
// Backend: No CORS needed (same-origin)
// Remove CORS middleware or set to same origin only

// Cookie settings
res.cookie('authToken', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',  // ✅ CSRF protection
  maxAge: 24 * 60 * 60 * 1000,
  path: '/api'
});
```

**CSRF Protection:** ✅ **SameSite='strict' is sufficient**

**Benefits:**
- ✅ No CSRF tokens needed
- ✅ No CORS complexity
- ✅ Strongest security posture
- ✅ Simplest implementation

### Option B: Cross-Origin Deployment (REQUIRES CSRF TOKENS)

**Deployment:**
- Frontend: `https://app.example.com`
- Backend: `https://api.example.com`

**Configuration:**
```javascript
// Backend: CORS with specific origin
app.use(cors({
  origin: 'https://app.example.com',  // ✅ Specific origin
  credentials: true
}));

// Cookie settings
res.cookie('authToken', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',  // ⚠️ Allows cross-origin GET
  maxAge: 24 * 60 * 60 * 1000,
  path: '/api'
});

// CSRF protection (use Strategy 2 or 3 above)
```

**CSRF Protection:** ⚠️ **CSRF tokens required** (SameSite='lax' is not sufficient)

**Requirements:**
- ✅ CSRF token generation endpoint
- ✅ CSRF token validation middleware
- ✅ Frontend CSRF token handling

---

## Implementation Checklist

### For Same-Origin Deployment

- [ ] Remove or restrict CORS middleware (same-origin only)
- [ ] Install `cookie-parser`: `npm install cookie-parser`
- [ ] Set cookies with `SameSite='strict'`
- [ ] Update authentication middleware to read from cookies
- [ ] Remove `Authorization` header logic from frontend
- [ ] Test cookie-based authentication

### For Cross-Origin Deployment

- [ ] Keep CORS with specific origin (not `*`)
- [ ] Install `cookie-parser`: `npm install cookie-parser`
- [ ] Install `csurf` or implement double-submit cookie pattern
- [ ] Set cookies with `SameSite='lax'`
- [ ] Implement CSRF token generation endpoint
- [ ] Implement CSRF token validation middleware
- [ ] Update frontend to fetch and send CSRF tokens
- [ ] Update authentication middleware to read from cookies
- [ ] Remove `Authorization` header logic from frontend
- [ ] Test cookie-based authentication with CSRF protection

---

## Security Best Practices

### Cookie Settings

1. **HttpOnly:** ✅ Always `true` (prevents XSS access)
2. **Secure:** ✅ Always `true` in production (HTTPS only)
3. **SameSite:**
   - ✅ `'strict'` for same-origin (best security)
   - ⚠️ `'lax'` for cross-origin (requires CSRF tokens)
   - ❌ Never `'none'` (allows all cross-origin requests)
4. **Path:** ✅ Limit to `/api` (reduces exposure)
5. **Domain:** ✅ Don't set (limits to exact domain)

### CORS Settings

1. **Origin:** ✅ Never use `'*'` with `credentials: true`
2. **Credentials:** ✅ `true` only with specific origins
3. **Methods:** ✅ Limit to needed methods (GET, POST, PUT, DELETE)
4. **Headers:** ✅ Limit to needed headers

### CSRF Token Settings

1. **Generation:** ✅ Use cryptographically secure random tokens
2. **Storage:** ✅ HttpOnly cookie (if using `csurf`) or JavaScript-readable cookie (if double-submit)
3. **Validation:** ✅ Validate on all state-changing requests (POST, PUT, DELETE, PATCH)
4. **Expiration:** ✅ Match authentication cookie expiration

---

## Current Vulnerabilities (If Using Cookies)

**If you migrate to cookies without CSRF protection:**

1. 🔴 **CSRF Attack:** Malicious site can trigger authenticated requests
2. 🔴 **Account Takeover:** Attacker can change passwords, update profiles
3. 🔴 **Data Exfiltration:** Attacker can access user data
4. 🔴 **Privilege Escalation:** Attacker can perform admin actions (if user is admin)

**Example Attack:**
```html
<!-- Malicious site: evil.com -->
<form action="https://api.example.com/api/users/123" method="POST">
  <input type="hidden" name="role" value="super_admin">
  <input type="submit" value="Click for free prize!">
</form>
<script>document.forms[0].submit();</script>
```

If user is logged into `app.example.com`, browser automatically sends cookies to `api.example.com`, and the attack succeeds.

---

## Conclusion

### Current State: ✅ **Secure (No CSRF Risk)**
- Using JWT in `Authorization` headers
- No cookies = No CSRF vulnerability
- CORS is properly configured

### Future State (Cookie Migration): ⚠️ **Requires CSRF Protection**

**Same-Origin Deployment:**
- ✅ Use `SameSite='strict'` cookies
- ✅ No CSRF tokens needed
- ✅ Strongest security posture

**Cross-Origin Deployment:**
- ⚠️ Use `SameSite='lax'` cookies
- ✅ **REQUIRE CSRF tokens** (double-submit cookie pattern)
- ✅ Implement CSRF token generation and validation

**Recommendation:** Prefer same-origin deployment for strongest security with simplest implementation.

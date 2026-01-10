# Abuse Protection Audit: Rate Limiting & Email Throttling

## Executive Summary

**Critical Finding:** Most authentication and email-related endpoints lack rate limiting, making the system vulnerable to brute force attacks and email spamming.

**Current Coverage:**
- ✅ Login endpoint: Has rate limiting (5 requests/15 min)
- ❌ Passwordless token login: NO rate limiting
- ❌ Approved employee login: NO rate limiting
- ❌ Token verification: NO rate limiting
- ❌ Email generation/sending: NO rate limiting
- ❌ Password change: NO rate limiting

**Additional Issues:**
- ⚠️ Rate limiting uses in-memory store (resets on server restart)
- ⚠️ No per-email throttling (only per-IP)
- ⚠️ No progressive delays or account lockout
- ⚠️ No distinction between failed vs successful requests

---

## Current Rate Limiting Implementation

### Existing Rate Limiters

**Location:** `backend/src/middleware/rateLimiter.middleware.js`

**1. `authLimiter` (Login Only)**
```javascript
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : 5, // 50 requests in dev, 5 in production
  message: { error: { message: 'Too many login attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
  store: undefined, // Default in-memory store
});
```

**Applied To:**
- ✅ `POST /api/auth/login` (line 110 in `auth.routes.js`)

**Not Applied To:**
- ❌ `POST /api/auth/passwordless-login/:token`
- ❌ `POST /api/auth/approved-employee-login`
- ❌ `POST /api/auth/pending/verify-identity/:token`

**2. `apiLimiter` (General API)**
```javascript
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: { message: 'Too many requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});
```

**Applied To:** ❌ **NOT USED ANYWHERE**

---

## Vulnerability Analysis

### 1. Passwordless Token Login - NO Rate Limiting 🔴 **HIGH RISK**

**Endpoint:** `POST /api/auth/passwordless-login/:token`

**Current State:**
- ❌ No rate limiting applied
- ❌ No per-IP throttling
- ❌ No per-token throttling
- ❌ No brute force protection

**Attack Scenarios:**
1. **Token Enumeration:** Attacker can brute force token values (64-character hex = 2^256 possibilities, but still vulnerable to timing attacks)
2. **Token Replay:** Attacker can repeatedly attempt to use intercepted tokens
3. **Distributed Attacks:** Multiple IPs can attempt same token without detection

**Impact:** High - Allows brute force token guessing and replay attacks

**Fix Required:** Add rate limiting with per-IP and per-token tracking

---

### 2. Approved Employee Login - NO Rate Limiting 🔴 **HIGH RISK**

**Endpoint:** `POST /api/auth/approved-employee-login`

**Current State:**
- ❌ No rate limiting applied
- ❌ No per-IP throttling
- ❌ No per-email throttling

**Attack Scenarios:**
1. **Brute Force:** Attacker can attempt unlimited password guesses
2. **Email Enumeration:** Attacker can determine which emails are registered
3. **Distributed Attacks:** Multiple IPs can target same email

**Impact:** High - Allows brute force password attacks

**Fix Required:** Add rate limiting with per-IP and per-email tracking

---

### 3. Token Verification - NO Rate Limiting ⚠️ **MEDIUM RISK**

**Endpoint:** `POST /api/auth/pending/verify-identity/:token`

**Current State:**
- ❌ No rate limiting applied
- ❌ No per-IP throttling
- ❌ No per-token throttling

**Attack Scenarios:**
1. **Last Name Brute Force:** Attacker can guess last names for pending users
2. **Token Replay:** Repeated verification attempts

**Impact:** Medium - Allows identity verification bypass attempts

**Fix Required:** Add rate limiting with per-IP and per-token tracking

---

### 4. Email Generation/Sending - NO Rate Limiting 🔴 **HIGH RISK**

**Endpoints That Generate Emails:**
- `POST /api/auth/register` - Generates welcome email
- `POST /api/users/:id/move-to-active` - Generates credentials email
- `POST /api/users/:id/generate-temp-password` - Generates password email
- `POST /api/users/:id/reset-passwordless-token` - Generates token email
- `POST /api/approved-employees/:id/send-verification` - Generates verification email
- `POST /api/users/:userId/communications/:id/regenerate` - Regenerates email

**Current State:**
- ❌ No rate limiting on any email generation endpoint
- ❌ No per-email throttling
- ❌ No per-IP throttling
- ⚠️ **Note:** Emails are generated but not actually sent via SMTP (returned in API response)

**Attack Scenarios:**
1. **Email Spamming:** Attacker can generate unlimited emails to same recipient
2. **Email Bombing:** Attacker can generate emails to multiple recipients
3. **Resource Exhaustion:** Email generation consumes server resources

**Impact:** High - Allows email spamming and resource exhaustion

**Fix Required:** Add per-email and per-IP throttling on all email generation endpoints

---

### 5. Password Change - NO Rate Limiting ⚠️ **MEDIUM RISK**

**Endpoint:** `POST /api/users/change-password` and `POST /api/users/:id/change-password`

**Current State:**
- ❌ No rate limiting applied
- ❌ No per-user throttling

**Attack Scenarios:**
1. **Brute Force:** Attacker can attempt unlimited password changes
2. **Account Takeover:** Attacker can change victim's password with valid session

**Impact:** Medium - Allows brute force password changes

**Fix Required:** Add rate limiting with per-user tracking

---

## Rate Limiting Gaps Summary

| Endpoint | Method | Rate Limiting | Per-IP | Per-Email | Per-User | Risk Level |
|----------|--------|---------------|--------|-----------|----------|------------|
| `/api/auth/login` | POST | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ✅ Low |
| `/api/auth/passwordless-login/:token` | POST | ❌ **NO** | ❌ No | ❌ No | ❌ No | 🔴 **HIGH** |
| `/api/auth/approved-employee-login` | POST | ❌ **NO** | ❌ No | ❌ No | ❌ No | 🔴 **HIGH** |
| `/api/auth/pending/verify-identity/:token` | POST | ❌ **NO** | ❌ No | ❌ No | ❌ No | ⚠️ **MEDIUM** |
| `/api/auth/register` | POST | ❌ **NO** | ❌ No | ❌ No | ❌ No | ⚠️ **MEDIUM** |
| `/api/users/change-password` | POST | ❌ **NO** | ❌ No | ❌ No | ❌ No | ⚠️ **MEDIUM** |
| `/api/users/:id/change-password` | POST | ❌ **NO** | ❌ No | ❌ No | ❌ No | ⚠️ **MEDIUM** |
| `/api/users/:id/move-to-active` | POST | ❌ **NO** | ❌ No | ❌ No | ❌ No | ⚠️ **MEDIUM** |
| `/api/users/:id/generate-temp-password` | POST | ❌ **NO** | ❌ No | ❌ No | ❌ No | ⚠️ **MEDIUM** |
| `/api/users/:id/reset-passwordless-token` | POST | ❌ **NO** | ❌ No | ❌ No | ❌ No | ⚠️ **MEDIUM** |
| `/api/approved-employees/:id/send-verification` | POST | ❌ **NO** | ❌ No | ❌ No | ❌ No | ⚠️ **MEDIUM** |
| `/api/users/:userId/communications/:id/regenerate` | POST | ❌ **NO** | ❌ No | ❌ No | ❌ No | ⚠️ **MEDIUM** |

---

## Recommended Rate Limiting Strategy

### Strategy 1: Per-IP Rate Limiting (Basic Protection)

**Use Case:** Prevent single IP from making too many requests

**Implementation:**
```javascript
// Default key generator uses req.ip
export const perIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per IP per window
  message: { error: { message: 'Too many requests from this IP, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use X-Forwarded-For if behind proxy (trust proxy is set)
    return req.ip || req.connection.remoteAddress;
  }
});
```

**Limitations:**
- ❌ Doesn't prevent distributed attacks (multiple IPs)
- ❌ Doesn't prevent targeted attacks on specific emails/users
- ❌ Can block legitimate users behind shared IP (NAT, corporate proxy)

---

### Strategy 2: Per-Email Rate Limiting (Email Spam Prevention)

**Use Case:** Prevent email spamming to specific recipients

**Implementation:**
```javascript
export const perEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 emails per email address per hour
  message: { error: { message: 'Too many emails sent to this address. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Extract email from body or params
    const email = req.body?.email || 
                  req.body?.targetEmail || 
                  req.params?.email ||
                  req.user?.email;
    
    if (!email) {
      // Fallback to IP if no email found
      return req.ip;
    }
    
    return `email:${email.toLowerCase().trim()}`;
  },
  skip: (req) => {
    // Skip rate limiting for admin users
    return req.user?.role === 'admin' || req.user?.role === 'super_admin';
  }
});
```

**Benefits:**
- ✅ Prevents email spamming to specific recipients
- ✅ Works across multiple IPs
- ✅ Protects individual users from email bombing

---

### Strategy 3: Per-User Rate Limiting (Account Protection)

**Use Case:** Prevent brute force attacks on specific user accounts

**Implementation:**
```javascript
export const perUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per user per window
  message: { error: { message: 'Too many attempts for this account. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // For authenticated requests, use user ID
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    
    // For login attempts, use email from body
    const email = req.body?.email;
    if (email) {
      return `email:${email.toLowerCase().trim()}`;
    }
    
    // Fallback to IP
    return req.ip;
  }
});
```

**Benefits:**
- ✅ Prevents brute force on specific accounts
- ✅ Works across multiple IPs
- ✅ Protects individual user accounts

---

### Strategy 4: Per-Token Rate Limiting (Token Protection)

**Use Case:** Prevent brute force token guessing and replay attacks

**Implementation:**
```javascript
export const perTokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per token per window
  message: { error: { message: 'Too many attempts with this token. Please request a new link.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Extract token from params or body
    const token = req.params?.token || req.body?.token;
    if (token) {
      return `token:${token.trim()}`;
    }
    
    // Fallback to IP
    return req.ip;
  }
});
```

**Benefits:**
- ✅ Prevents token brute force
- ✅ Prevents token replay attacks
- ✅ Limits attempts per token

---

### Strategy 5: Progressive Rate Limiting (Account Lockout)

**Use Case:** Progressive delays after failed attempts

**Implementation:**
```javascript
import rateLimit from 'express-rate-limit';

// Track failed attempts in database or Redis
const getFailedAttempts = async (key) => {
  // Query database or Redis for failed attempts in last hour
  // Return count
};

const calculateDelay = (failedAttempts) => {
  if (failedAttempts === 0) return 0;
  if (failedAttempts < 3) return 1000; // 1 second
  if (failedAttempts < 5) return 5000; // 5 seconds
  if (failedAttempts < 10) return 30000; // 30 seconds
  return 300000; // 5 minutes
};

export const progressiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: async (req) => {
    const key = req.body?.email || req.user?.id || req.ip;
    const failedAttempts = await getFailedAttempts(key);
    const delay = calculateDelay(failedAttempts);
    
    // Add delay before processing
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    // Allow more attempts if no recent failures
    return failedAttempts === 0 ? 10 : 3;
  },
  message: { error: { message: 'Too many failed attempts. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false
});
```

**Benefits:**
- ✅ Progressive delays discourage brute force
- ✅ Account lockout after threshold
- ✅ Automatic unlock after cooldown period

---

## Concrete Rate Limiting Recommendations

### Priority 1: Critical Endpoints (Immediate)

#### 1. Passwordless Token Login

**Location:** `backend/src/routes/auth.routes.js:118`

**Recommended Limits:**
- **Per-IP:** 10 attempts per 15 minutes
- **Per-Token:** 5 attempts per 15 minutes
- **Progressive Delay:** 1 second after 3 failures, 5 seconds after 5 failures

**Implementation:**
```javascript
// backend/src/middleware/rateLimiter.middleware.js

export const passwordlessLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP per window
  message: { error: { message: 'Too many login attempts. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Combine IP and token for more granular tracking
    const token = req.params?.token;
    const ip = req.ip || req.connection.remoteAddress;
    
    if (token) {
      return `passwordless:${ip}:${token.substring(0, 16)}`; // First 16 chars of token
    }
    
    return `passwordless:${ip}`;
  }
});

// Apply in routes
router.post('/passwordless-login/:token', passwordlessLoginLimiter, passwordlessTokenLogin);
```

#### 2. Approved Employee Login

**Location:** `backend/src/routes/auth.routes.js:111`

**Recommended Limits:**
- **Per-IP:** 5 attempts per 15 minutes
- **Per-Email:** 5 attempts per 15 minutes
- **Progressive Delay:** 1 second after 2 failures, 5 seconds after 4 failures

**Implementation:**
```javascript
export const approvedEmployeeLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: { message: 'Too many login attempts. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Track by both IP and email
    const email = req.body?.email?.toLowerCase()?.trim();
    const ip = req.ip || req.connection.remoteAddress;
    
    if (email) {
      return `approved-login:${ip}:${email}`;
    }
    
    return `approved-login:${ip}`;
  }
});

// Apply in routes
router.post('/approved-employee-login', approvedEmployeeLoginLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
], approvedEmployeeLogin);
```

#### 3. Email Generation Endpoints

**Recommended Limits:**
- **Per-Email:** 3 emails per hour per recipient
- **Per-IP:** 10 email generations per hour
- **Per-User (Admin):** 50 email generations per hour

**Implementation:**
```javascript
export const emailGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 emails per recipient per hour
  message: { error: { message: 'Too many emails sent to this address. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Extract target email from various sources
    const targetEmail = req.body?.email || 
                        req.body?.targetEmail ||
                        req.params?.email ||
                        (req.body?.userId ? null : null); // Will need to fetch user email
    
    if (targetEmail) {
      return `email:${targetEmail.toLowerCase().trim()}`;
    }
    
    // Fallback to IP
    return `email-ip:${req.ip}`;
  },
  skip: (req) => {
    // Allow admins to send more emails
    return req.user?.role === 'admin' || req.user?.role === 'super_admin';
  }
});

// Per-IP limiter for email generation
export const emailGenerationIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 email generations per IP per hour
  message: { error: { message: 'Too many email generation requests. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `email-ip:${req.ip}`
});
```

### Priority 2: High Priority Endpoints (This Week)

#### 4. Token Verification

**Location:** `backend/src/routes/auth.routes.js:119`

**Recommended Limits:**
- **Per-IP:** 10 attempts per 15 minutes
- **Per-Token:** 5 attempts per 15 minutes

**Implementation:**
```javascript
export const tokenVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per token per window
  message: { error: { message: 'Too many verification attempts. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const token = req.params?.token;
    const ip = req.ip;
    
    if (token) {
      return `verify:${ip}:${token.substring(0, 16)}`;
    }
    
    return `verify:${ip}`;
  }
});

// Apply in routes
router.post('/pending/verify-identity/:token', tokenVerificationLimiter, verifyPendingIdentity);
```

#### 5. Password Change

**Location:** `backend/src/routes/user.routes.js:22-23`

**Recommended Limits:**
- **Per-User:** 5 attempts per 15 minutes
- **Per-IP:** 10 attempts per 15 minutes

**Implementation:**
```javascript
export const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per user per window
  message: { error: { message: 'Too many password change attempts. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise use email or IP
    if (req.user?.id) {
      return `password-change:user:${req.user.id}`;
    }
    
    const email = req.body?.email;
    if (email) {
      return `password-change:email:${email.toLowerCase().trim()}`;
    }
    
    return `password-change:ip:${req.ip}`;
  }
});

// Apply in routes
router.post('/change-password', authenticate, passwordChangeLimiter, changePassword);
router.post('/:id/change-password', authenticate, passwordChangeLimiter, changePassword);
```

#### 6. User Registration

**Location:** `backend/src/routes/auth.routes.js:117`

**Recommended Limits:**
- **Per-IP:** 5 registrations per hour
- **Per-Email:** 1 registration per hour (if email provided)

**Implementation:**
```javascript
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per IP per hour
  message: { error: { message: 'Too many registration attempts. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase()?.trim();
    const ip = req.ip;
    
    if (email) {
      return `register:${ip}:${email}`;
    }
    
    return `register:${ip}`;
  }
});

// Apply in routes
router.post('/register', registrationLimiter, requireAdminOrFirstUser, validateRegister, register);
```

---

## Implementation Plan

### Step 1: Create Enhanced Rate Limiters

**File:** `backend/src/middleware/rateLimiter.middleware.js`

```javascript
import rateLimit from 'express-rate-limit';
import config from '../config/config.js';

const isDevelopment = config.nodeEnv === 'development';

// Existing limiters
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 50 : 5,
  message: { error: { message: 'Too many login attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: { message: 'Too many requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

// NEW: Passwordless login limiter
export const passwordlessLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : 10, // 10 attempts per IP per window
  message: { error: { message: 'Too many login attempts. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const token = req.params?.token;
    const ip = req.ip || req.connection.remoteAddress;
    
    // Track by both IP and token (first 16 chars) for granular control
    if (token && token.length >= 16) {
      return `passwordless:${ip}:${token.substring(0, 16)}`;
    }
    
    return `passwordless:${ip}`;
  }
});

// NEW: Approved employee login limiter
export const approvedEmployeeLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : 5, // 5 attempts per window
  message: { error: { message: 'Too many login attempts. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase()?.trim();
    const ip = req.ip || req.connection.remoteAddress;
    
    // Track by both IP and email
    if (email) {
      return `approved-login:${ip}:${email}`;
    }
    
    return `approved-login:${ip}`;
  }
});

// NEW: Token verification limiter
export const tokenVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : 5, // 5 attempts per token per window
  message: { error: { message: 'Too many verification attempts. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const token = req.params?.token;
    const ip = req.ip || req.connection.remoteAddress;
    
    if (token && token.length >= 16) {
      return `verify:${ip}:${token.substring(0, 16)}`;
    }
    
    return `verify:${ip}`;
  }
});

// NEW: Email generation limiter (per-email)
export const emailGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 100 : 3, // 3 emails per recipient per hour
  message: { error: { message: 'Too many emails sent to this address. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: async (req) => {
    // Extract target email from various sources
    let targetEmail = req.body?.email || 
                      req.body?.targetEmail ||
                      req.params?.email;
    
    // If userId provided, fetch user email
    if (!targetEmail && req.params?.userId) {
      try {
        const User = (await import('../models/User.model.js')).default;
        const user = await User.findById(parseInt(req.params.userId));
        targetEmail = user?.email;
      } catch (err) {
        // Fallback to IP if can't fetch user
      }
    }
    
    if (targetEmail) {
      return `email:${targetEmail.toLowerCase().trim()}`;
    }
    
    // Fallback to IP
    return `email-ip:${req.ip || req.connection.remoteAddress}`;
  },
  skip: (req) => {
    // Allow admins to send more emails
    return req.user?.role === 'admin' || req.user?.role === 'super_admin';
  }
});

// NEW: Email generation limiter (per-IP)
export const emailGenerationIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 200 : 10, // 10 email generations per IP per hour
  message: { error: { message: 'Too many email generation requests. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `email-ip:${req.ip || req.connection.remoteAddress}`
});

// NEW: Password change limiter
export const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 50 : 5, // 5 attempts per user per window
  message: { error: { message: 'Too many password change attempts. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID if authenticated
    if (req.user?.id) {
      return `password-change:user:${req.user.id}`;
    }
    
    // Fallback to IP
    return `password-change:ip:${req.ip || req.connection.remoteAddress}`;
  }
});

// NEW: Registration limiter
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 100 : 5, // 5 registrations per IP per hour
  message: { error: { message: 'Too many registration attempts. Please try again later.' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase()?.trim();
    const ip = req.ip || req.connection.remoteAddress;
    
    if (email) {
      return `register:${ip}:${email}`;
    }
    
    return `register:${ip}`;
  }
});
```

### Step 2: Apply Rate Limiters to Routes

**File:** `backend/src/routes/auth.routes.js`

```javascript
import { 
  authLimiter, 
  passwordlessLoginLimiter, 
  approvedEmployeeLoginLimiter,
  tokenVerificationLimiter,
  registrationLimiter
} from '../middleware/rateLimiter.middleware.js';

// Apply rate limiters
router.post('/login', authLimiter, validateLogin, login);
router.post('/approved-employee-login', approvedEmployeeLoginLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
], approvedEmployeeLogin);
router.post('/passwordless-login/:token', passwordlessLoginLimiter, passwordlessTokenLogin);
router.post('/pending/verify-identity/:token', tokenVerificationLimiter, verifyPendingIdentity);
router.post('/register', registrationLimiter, requireAdminOrFirstUser, validateRegister, register);
```

**File:** `backend/src/routes/user.routes.js`

```javascript
import { passwordChangeLimiter, emailGenerationLimiter, emailGenerationIpLimiter } from '../middleware/rateLimiter.middleware.js';

// Apply rate limiters
router.post('/change-password', authenticate, passwordChangeLimiter, changePassword);
router.post('/:id/change-password', authenticate, passwordChangeLimiter, changePassword);
router.post('/:id/move-to-active', authenticate, requireAdmin, emailGenerationLimiter, emailGenerationIpLimiter, movePendingToActive);
router.post('/:id/generate-temp-password', authenticate, requireAdmin, emailGenerationLimiter, emailGenerationIpLimiter, generateTemporaryPassword);
router.post('/:id/reset-passwordless-token', authenticate, emailGenerationLimiter, emailGenerationIpLimiter, resetPasswordlessToken);
```

**File:** `backend/src/routes/approvedEmployee.routes.js`

```javascript
import { emailGenerationLimiter, emailGenerationIpLimiter } from '../middleware/rateLimiter.middleware.js';

router.post('/:id/send-verification', authenticate, requireAdmin, emailGenerationLimiter, emailGenerationIpLimiter, sendVerificationEmail);
```

**File:** `backend/src/routes/userCommunication.routes.js`

```javascript
import { emailGenerationLimiter, emailGenerationIpLimiter } from '../middleware/rateLimiter.middleware.js';

router.post('/users/:userId/communications/:id/regenerate', authenticate, emailGenerationLimiter, emailGenerationIpLimiter, regenerateEmail);
```

---

## Recommended Rate Limits (Production)

| Endpoint | Per-IP | Per-Email | Per-User | Per-Token | Window | Rationale |
|----------|--------|-----------|----------|-----------|--------|-----------|
| Login | 5 | 5 | 5 | N/A | 15 min | Prevent brute force |
| Passwordless Login | 10 | N/A | N/A | 5 | 15 min | Prevent token brute force |
| Approved Employee Login | 5 | 5 | N/A | N/A | 15 min | Prevent brute force |
| Token Verification | 10 | N/A | N/A | 5 | 15 min | Prevent identity bypass |
| Password Change | 10 | N/A | 5 | N/A | 15 min | Prevent brute force |
| Email Generation | 10 | 3 | 50 (admin) | N/A | 1 hour | Prevent email spamming |
| User Registration | 5 | 1 | N/A | N/A | 1 hour | Prevent account creation spam |

---

## Advanced: Redis-Based Rate Limiting (Recommended for Production)

**Current Limitation:** In-memory store resets on server restart and doesn't work across multiple server instances.

**Solution:** Use Redis for distributed rate limiting.

**Implementation:**
```javascript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  // Use connection pooling for Cloud Run
  maxRetriesPerRequest: 3,
  enableReadyCheck: false
});

export const authLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:auth:'
  }),
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: { message: 'Too many login attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});
```

**Benefits:**
- ✅ Persists across server restarts
- ✅ Works across multiple server instances
- ✅ Better performance for high-traffic applications
- ✅ Can implement more complex rate limiting logic

---

## Testing Recommendations

1. **Test Rate Limiting:**
   - Send requests exceeding limits
   - Verify 429 status code returned
   - Verify rate limit headers present
   - Test per-IP, per-email, per-user limits separately

2. **Test Edge Cases:**
   - Multiple IPs targeting same email
   - Same IP with different emails
   - Rate limit reset after window expires
   - Admin bypass functionality

3. **Test Distributed Attacks:**
   - Multiple server instances
   - Redis-based rate limiting (if implemented)
   - Load balancer IP handling

---

## Conclusion

The current abuse protection is **insufficient**. Only the login endpoint has rate limiting, leaving most authentication and email endpoints vulnerable to brute force and spamming attacks.

**Immediate Actions Required:**
1. Add rate limiting to passwordless login endpoint
2. Add rate limiting to approved employee login endpoint
3. Add rate limiting to all email generation endpoints
4. Add rate limiting to password change endpoint
5. Consider Redis-based rate limiting for production

**Recommended Limits:**
- Login/Password Change: 5 attempts per 15 minutes (per-IP and per-email)
- Passwordless Login: 10 attempts per 15 minutes (per-IP), 5 per token
- Email Generation: 3 emails per hour (per-email), 10 per hour (per-IP)
- Token Verification: 5 attempts per 15 minutes (per-token)

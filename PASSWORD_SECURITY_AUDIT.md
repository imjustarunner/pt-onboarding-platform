# Password Security Audit: Pending User Password Setting

## Executive Summary

**Current Flow:** Pending users are moved to `active` status with a temporary password, then use the `changePassword` endpoint to set their permanent password. The system uses passwordless tokens for initial access, not traditional password reset tokens.

**Critical Findings:**
1. 🔴 **User Enumeration Vulnerability** - Login endpoint reveals if email exists
2. ⚠️ **Weak Password Requirements** - Only 6 characters minimum
3. ⚠️ **No Rate Limiting on Password Change** - Vulnerable to brute force
4. ⚠️ **Passwordless Tokens Not Single-Use** - Can be reused until expiration
5. ✅ **Password Hashing** - Using bcrypt (10 rounds) correctly

---

## Security Controls Analysis

### 1. Password Hashing ✅ **SECURE**

**Implementation:**
- **Algorithm:** bcrypt with 10 rounds
- **Location:** `backend/src/models/User.model.js:692-702`, `backend/src/controllers/user.controller.js:1971-1972`

**Code:**
```javascript
const bcrypt = (await import('bcrypt')).default;
const passwordHash = await bcrypt.hash(newPassword, 10);
```

**Status:** ✅ **SECURE**
- Using bcrypt (industry standard)
- 10 rounds is appropriate (balance of security and performance)
- Passwords are hashed before storage
- No plaintext passwords stored

**Recommendation:** Consider increasing to 12 rounds for production (if performance allows), but 10 is acceptable.

---

### 2. Reset Tokens ⚠️ **PARTIALLY SECURE**

**Current Implementation:**
- **Token Type:** Passwordless tokens (not traditional password reset tokens)
- **Generation:** `crypto.randomBytes(32).toString('hex')` (64-character hex)
- **Storage:** Plain text in database (NOT hashed) - **CRITICAL VULNERABILITY**
- **Expiration:** 48 hours (active users) or 7 days (pending users)
- **Single-Use:** ❌ **NOT ENFORCED** - Tokens can be reused until expiration

**Location:** `backend/src/models/User.model.js:670-682`

**Issues:**
1. 🔴 **Tokens stored in plain text** - If database is compromised, tokens are immediately usable
2. ⚠️ **Not single-use** - Tokens remain valid after successful login
3. ⚠️ **No token invalidation** - Tokens not cleared after password change

**Code:**
```javascript
static async generatePasswordlessToken(userId, expiresInHours = 48) {
  const token = crypto.randomBytes(32).toString('hex'); // ✅ Cryptographically secure
  // ...
  await pool.execute(
    'UPDATE users SET passwordless_token = ?, passwordless_token_expires_at = ? WHERE id = ?',
    [token, expiresAt, userId]  // ❌ Stored as plain text
  );
  return { token, expiresAt };
}
```

**Fix Required:**
1. Hash tokens before storage (bcrypt or HMAC-SHA256)
2. Invalidate tokens after successful password change
3. Make tokens single-use (clear after first use)

---

### 3. Rate Limiting / Lockouts ⚠️ **INSUFFICIENT**

**Current Implementation:**

**Login Endpoint:**
- **Rate Limiter:** `authLimiter` applied
- **Limit:** 5 requests per 15 minutes (production), 50 (development)
- **Location:** `backend/src/routes/auth.routes.js:110`

**Password Change Endpoint:**
- **Rate Limiter:** ❌ **NONE**
- **Location:** `backend/src/routes/user.routes.js:22-23`
- **Vulnerability:** No protection against brute force password guessing

**Code:**
```javascript
// Login - HAS rate limiting
router.post('/login', authLimiter, validateLogin, login);

// Password change - NO rate limiting
router.post('/change-password', authenticate, changePassword);
router.post('/:id/change-password', authenticate, changePassword);
```

**Issues:**
1. ⚠️ **No rate limiting on password change** - Attacker can brute force password changes
2. ⚠️ **No account lockout** - No progressive delays or account locking after failed attempts
3. ⚠️ **No per-user rate limiting** - Rate limiter is global, not per user

**Fix Required:**
1. Add rate limiting to password change endpoint
2. Implement account lockout after N failed password attempts
3. Consider progressive delays (exponential backoff)

---

### 4. Password Strength Requirements ⚠️ **WEAK**

**Current Implementation:**
- **Minimum Length:** 6 characters
- **Location:** `backend/src/controllers/user.controller.js:1956-1958`

**Code:**
```javascript
if (!newPassword || newPassword.length < 6) {
  return res.status(400).json({ 
    error: { message: 'New password must be at least 6 characters' } 
  });
}
```

**Issues:**
1. ⚠️ **Only length requirement** - No complexity requirements
2. ⚠️ **6 characters is too short** - Industry standard is 8-12 characters
3. ⚠️ **No password strength meter** - Users don't know if password is weak
4. ⚠️ **No common password checking** - Allows "password123", "123456", etc.

**NIST 800-63B Recommendations:**
- Minimum 8 characters (preferably 12+)
- Check against common password lists
- No complexity requirements (length is more important)
- Allow all character types

**Fix Required:**
1. Increase minimum length to 8 characters (preferably 12)
2. Check against common password lists (Have I Been Pwned, etc.)
3. Add password strength meter in frontend
4. Consider zxcvbn library for password strength estimation

---

### 5. User Enumeration 🔴 **VULNERABLE**

**Current Implementation:**

**Login Endpoint** (`backend/src/controllers/auth.controller.js:164-231`):
```javascript
const user = await User.findByEmail(email);
if (!user) {
  // ❌ VULNERABLE: Different message for non-existent user
  return res.status(401).json({ 
    error: { 
      message: 'User not found. Contact PO@ITSCO.health if this is an error or if you require your credentials.' 
    } 
  });
}

// ... password check ...

if (!isValidPassword) {
  // ❌ VULNERABLE: Different message for wrong password
  return res.status(401).json({ error: { message: 'Invalid email or password' } });
}
```

**Issues:**
1. 🔴 **Different error messages** - "User not found" vs "Invalid email or password"
2. 🔴 **Timing attacks possible** - Database lookup for non-existent user may be faster
3. 🔴 **Email enumeration** - Attacker can determine which emails are registered

**Fix Required:**
1. Use **same error message** for both cases: "Invalid email or password"
2. Always perform password hash comparison (even for non-existent users)
3. Use constant-time comparison to prevent timing attacks

**Secure Implementation:**
```javascript
// Always perform password check (even if user doesn't exist)
const dummyHash = '$2b$10$dummyhashfordummycomparison1234567890123456789012';
const user = await User.findByEmail(email);
const storedHash = user?.password_hash || dummyHash;

// Constant-time comparison
const isValidPassword = await bcrypt.compare(password, storedHash);

// Always return same message
if (!user || !isValidPassword) {
  return res.status(401).json({ 
    error: { message: 'Invalid email or password' } 
  });
}
```

---

## Password Change Flow Analysis

### Current Flow for Pending Users

1. **Pending User Created:**
   - No password set (`passwordHash: null`)
   - Passwordless token generated (7 days expiration)
   - User receives passwordless login link

2. **User Logs In via Passwordless Token:**
   - Token validated (not expired, not locked)
   - User redirected to dashboard (pending) or password change page (active)

3. **User Moves to Active:**
   - Admin calls `movePendingToActive`
   - Temporary password generated
   - Password hash set in database
   - Passwordless token regenerated (48 hours)

4. **User Sets Permanent Password:**
   - User calls `POST /api/users/change-password`
   - Current password verified (temporary password accepted)
   - New password validated (minimum 6 characters)
   - Password hashed with bcrypt
   - Password change logged

### Security Issues in Flow

1. ⚠️ **No rate limiting on password change** - Can brute force password guesses
2. ⚠️ **Weak password validation** - Only 6 characters required
3. ⚠️ **No password history** - User can reuse old passwords
4. ⚠️ **No password expiration** - Passwords never expire
5. ⚠️ **Temporary password in plain text** - Sent via email (security risk)

---

## Vulnerabilities Summary

| Vulnerability | Severity | Location | Impact |
|---------------|----------|----------|--------|
| User Enumeration | 🔴 **HIGH** | `auth.controller.js:173-180` | Attacker can determine registered emails |
| Weak Password Requirements | ⚠️ **MEDIUM** | `user.controller.js:1956` | Weak passwords easily cracked |
| No Rate Limiting on Password Change | ⚠️ **MEDIUM** | `user.routes.js:22-23` | Brute force password changes possible |
| Tokens Not Single-Use | ⚠️ **MEDIUM** | `User.model.js:670-682` | Tokens can be reused if intercepted |
| Tokens Stored in Plain Text | 🔴 **HIGH** | `User.model.js:677` | Database compromise = immediate token access |
| No Account Lockout | ⚠️ **MEDIUM** | N/A | No protection against brute force |
| No Password History | ⚠️ **LOW** | N/A | Users can reuse old passwords |
| Temporary Passwords in Email | ⚠️ **MEDIUM** | `user.controller.js:1915` | Email compromise = password compromise |

---

## Recommendations

### Priority 1: Critical Fixes (Immediate)

1. **Fix User Enumeration**
   - Use same error message for all login failures
   - Always perform password hash comparison (even for non-existent users)
   - Use constant-time comparison

2. **Hash Passwordless Tokens**
   - Store token hash (bcrypt or HMAC-SHA256) instead of plain text
   - Compare hashes on validation

3. **Make Tokens Single-Use**
   - Invalidate token immediately after successful password change
   - Clear `passwordless_token` from database after use

### Priority 2: High Priority Fixes (This Week)

4. **Add Rate Limiting to Password Change**
   - Apply `authLimiter` or create dedicated `passwordChangeLimiter`
   - Limit to 5 attempts per 15 minutes per user

5. **Strengthen Password Requirements**
   - Increase minimum length to 8 characters (preferably 12)
   - Add common password checking (Have I Been Pwned API)
   - Add password strength meter in frontend

6. **Implement Account Lockout**
   - Lock account after 5 failed password attempts
   - Progressive delays (1 min, 5 min, 15 min, 30 min)
   - Admin unlock capability

### Priority 3: Medium Priority Fixes (Next Sprint)

7. **Add Password History**
   - Prevent reuse of last 5 passwords
   - Store password hashes in history table

8. **Secure Temporary Password Delivery**
   - Use passwordless token link instead of emailing password
   - Or use secure password sharing (encrypted email, secure portal)

9. **Add Password Expiration** (Optional)
   - Require password change every 90 days
   - Warn users 7 days before expiration

---

## Implementation Examples

### Fix 1: User Enumeration Prevention

```javascript
// backend/src/controllers/auth.controller.js

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Always perform password check (even if user doesn't exist)
    const user = await User.findByEmail(email);
    
    // Use dummy hash for non-existent users (constant-time comparison)
    const dummyHash = '$2b$10$dummyhashfordummycomparison1234567890123456789012';
    const storedHash = user?.password_hash || dummyHash;
    
    // Constant-time password comparison
    const isValidPassword = await bcrypt.compare(password, storedHash);
    
    // Always return same error message (prevent enumeration)
    if (!user || !isValidPassword) {
      return res.status(401).json({ 
        error: { message: 'Invalid email or password' } 
      });
    }
    
    // ... rest of login logic ...
  } catch (error) {
    next(error);
  }
};
```

### Fix 2: Rate Limiting on Password Change

```javascript
// backend/src/middleware/rateLimiter.middleware.js

export const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: { message: 'Too many password change attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit per user (not per IP)
    return req.user?.id?.toString() || req.ip;
  }
});

// backend/src/routes/user.routes.js
router.post('/change-password', authenticate, passwordChangeLimiter, changePassword);
router.post('/:id/change-password', authenticate, passwordChangeLimiter, changePassword);
```

### Fix 3: Stronger Password Validation

```javascript
// backend/src/middleware/passwordValidator.middleware.js

import { body, validationResult } from 'express-validator';

// Common weak passwords (expand this list)
const COMMON_PASSWORDS = [
  'password', 'password123', '123456', '12345678', 'qwerty',
  'abc123', 'monkey', '1234567', 'letmein', 'trustno1',
  'dragon', 'baseball', 'iloveyou', 'master', 'sunshine'
];

export const validatePassword = [
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .isLength({ max: 128 })
    .withMessage('Password must be less than 128 characters')
    .custom((value) => {
      // Check against common passwords
      const lowerValue = value.toLowerCase();
      if (COMMON_PASSWORDS.some(p => lowerValue.includes(p.toLowerCase()))) {
        throw new Error('Password is too common. Please choose a more unique password.');
      }
      return true;
    })
    .matches(/^[\x20-\x7E]+$/)
    .withMessage('Password contains invalid characters')
];

// Usage in routes
router.post('/change-password', authenticate, passwordChangeLimiter, validatePassword, changePassword);
```

### Fix 4: Account Lockout

```javascript
// backend/src/middleware/accountLockout.middleware.js

import pool from '../config/database.js';

export const checkAccountLockout = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.body.userId;
    
    if (!userId) {
      return next();
    }
    
    // Check failed attempts in last 15 minutes
    const [attempts] = await pool.execute(
      `SELECT COUNT(*) as count FROM failed_password_attempts 
       WHERE user_id = ? AND attempted_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
      [userId]
    );
    
    const failedAttempts = attempts[0]?.count || 0;
    
    if (failedAttempts >= 5) {
      return res.status(429).json({ 
        error: { 
          message: 'Account temporarily locked due to too many failed attempts. Please try again in 15 minutes.',
          retryAfter: 900 // seconds
        } 
      });
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

// Record failed attempt
export const recordFailedAttempt = async (userId, ipAddress) => {
  await pool.execute(
    'INSERT INTO failed_password_attempts (user_id, ip_address, attempted_at) VALUES (?, ?, NOW())',
    [userId, ipAddress]
  );
};

// Clear failed attempts on success
export const clearFailedAttempts = async (userId) => {
  await pool.execute(
    'DELETE FROM failed_password_attempts WHERE user_id = ?',
    [userId]
  );
};
```

---

## Testing Checklist

- [ ] Test user enumeration prevention (same error for non-existent vs wrong password)
- [ ] Test rate limiting on password change (5 attempts max)
- [ ] Test account lockout after 5 failed attempts
- [ ] Test password strength requirements (8+ characters)
- [ ] Test common password rejection
- [ ] Test token single-use enforcement
- [ ] Test token invalidation after password change
- [ ] Test timing attack prevention (constant-time comparison)

---

## Conclusion

The password security implementation has **critical vulnerabilities** in user enumeration and token storage. While password hashing is secure (bcrypt), the overall security posture needs improvement:

**Critical Issues:**
- User enumeration allows attackers to determine registered emails
- Passwordless tokens stored in plain text (database compromise risk)
- No rate limiting on password change (brute force vulnerability)

**Recommended Priority:**
1. Fix user enumeration (immediate)
2. Hash passwordless tokens (immediate)
3. Add rate limiting to password change (this week)
4. Strengthen password requirements (this week)
5. Implement account lockout (next sprint)

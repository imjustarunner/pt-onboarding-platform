# Secrets Management Security Audit

## Executive Summary

**CRITICAL FINDINGS:**
- 🔴 **Default Secret Values:** JWT_SECRET and database credentials have insecure default fallback values
- 🔴 **Secrets in Logs:** Database credentials are logged in `runMigrations.js`
- ⚠️ **Missing Validation:** No validation that required secrets are set in production

**Current State:**
- ✅ `.env` files are properly gitignored
- ✅ Cloud Run uses Secret Manager correctly for sensitive values
- ✅ No secrets found in frontend build files
- ✅ `VITE_API_URL` is safe (public API URL, not a secret)
- ⚠️ Default fallback values allow application to run without secrets

**Vulnerabilities:**
- 🔴 **Insecure Defaults:** Application can run with known default secrets
- 🔴 **Credential Logging:** Database credentials logged to console
- ⚠️ **No Production Validation:** No check to prevent running with defaults in production

---

## Secret Inventory

### Backend Secrets

| Secret | Location | Current Status | Risk Level |
|--------|----------|----------------|------------|
| **JWT_SECRET** | `backend/src/config/config.js:34` | ⚠️ Has default fallback | 🔴 **HIGH** |
| **DB_PASSWORD** | `backend/src/config/database.js:12` | ⚠️ Has default fallback | 🔴 **HIGH** |
| **DB_USER** | `backend/src/config/database.js:11` | ⚠️ Has default fallback | ⚠️ **MEDIUM** |
| **DB_HOST** | `backend/src/config/database.js:9` | ⚠️ Has default fallback | ⚠️ **LOW** |
| **DB_NAME** | `backend/src/config/database.js:13` | ⚠️ Has default fallback | ⚠️ **LOW** |
| **PTONBOARDFILES** | `backend/src/services/storage.service.js:65` | ✅ No default (throws error) | ✅ **GOOD** |
| **GCS_PROJECT_ID** | `backend/src/services/storage.service.js:52` | ⚠️ Optional (may be inferred) | ⚠️ **LOW** |
| **GCS_CREDENTIALS** | Not found in code | ✅ Uses Cloud Run IAM | ✅ **GOOD** |

### Frontend Secrets

| Secret | Location | Current Status | Risk Level |
|--------|----------|----------------|------------|
| **VITE_API_URL** | `frontend/src/services/api.js:4` | ✅ Public API URL (not secret) | ✅ **SAFE** |

**Note:** `VITE_*` variables are embedded in frontend builds at build time. Only public, non-sensitive values should use this prefix.

---

## Detailed Analysis

### 1. JWT Secret Management

**Location:** `backend/src/config/config.js:34`

**Current Implementation:**
```javascript
jwt: {
  secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  expiresIn: process.env.JWT_EXPIRES_IN || '24h'
}
```

**Issues:**
- ❌ **Insecure Default:** Default value is well-known and documented
- ❌ **No Production Check:** Application can run with default in production
- ⚠️ **Documentation Exposure:** Default value appears in README.md

**Risk:**
- If `JWT_SECRET` is not set, application uses known default
- Attacker can forge JWT tokens using the default secret
- All authentication can be bypassed

**Recommendation:**
```javascript
jwt: {
  secret: (() => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET environment variable is required in production');
      }
      console.warn('⚠️  WARNING: Using default JWT_SECRET. This is insecure and should only be used in development.');
      return 'your-super-secret-jwt-key-change-in-production';
    }
    return secret;
  })(),
  expiresIn: process.env.JWT_EXPIRES_IN || '24h'
}
```

---

### 2. Database Credentials Management

**Location:** `backend/src/config/database.js:9-13`

**Current Implementation:**
```javascript
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'onboarding_user',
  password: process.env.DB_PASSWORD || 'onboarding_pass',
  database: process.env.DB_NAME || 'onboarding_db',
  // ...
});
```

**Issues:**
- ❌ **Insecure Defaults:** Default password `onboarding_pass` is weak and predictable
- ❌ **No Production Check:** Application can run with defaults in production
- ⚠️ **Documentation Exposure:** Default values appear in README.md

**Risk:**
- If `DB_PASSWORD` is not set, application uses known default
- Attacker can connect to database using default credentials
- All data can be accessed or modified

**Recommendation:**
```javascript
const pool = mysql.createPool({
  host: (() => {
    const host = process.env.DB_HOST;
    if (!host && process.env.NODE_ENV === 'production') {
      throw new Error('DB_HOST environment variable is required in production');
    }
    return host || 'localhost';
  })(),
  port: parseInt(process.env.DB_PORT) || 3307,
  user: (() => {
    const user = process.env.DB_USER;
    if (!user && process.env.NODE_ENV === 'production') {
      throw new Error('DB_USER environment variable is required in production');
    }
    return user || 'onboarding_user';
  })(),
  password: (() => {
    const password = process.env.DB_PASSWORD;
    if (!password) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('DB_PASSWORD environment variable is required in production');
      }
      console.warn('⚠️  WARNING: Using default DB_PASSWORD. This is insecure and should only be used in development.');
      return 'onboarding_pass';
    }
    return password;
  })(),
  database: (() => {
    const database = process.env.DB_NAME;
    if (!database && process.env.NODE_ENV === 'production') {
      throw new Error('DB_NAME environment variable is required in production');
    }
    return database || 'onboarding_db';
  })(),
  // ...
});
```

---

### 3. Credential Logging

**Location:** `backend/src/scripts/runMigrations.js:11-15`

**Current Implementation:**
```javascript
console.log('📊 Database connection configuration:');
console.log(`   DB_HOST: ${process.env.DB_HOST || 'localhost (default)'}`);
console.log(`   DB_PORT: ${process.env.DB_PORT || '3307 (default)'}`);
console.log(`   DB_NAME: ${process.env.DB_NAME || 'onboarding_db (default)'}`);
console.log(`   DB_USER: ${process.env.DB_USER || 'onboarding_user (default)'}`);
```

**Issues:**
- ⚠️ **Logs DB_USER:** Database username is logged (low risk, but not ideal)
- ✅ **Does NOT log password:** Password is not logged (good)
- ⚠️ **Logs in production:** These logs may appear in Cloud Logging

**Risk:**
- Database username exposed in logs (low risk, but unnecessary)
- If logs are leaked, username is known (password still protected)

**Recommendation:**
```javascript
// Only log non-sensitive connection info
console.log('📊 Database connection configuration:');
console.log(`   DB_HOST: ${process.env.DB_HOST ? maskValue(process.env.DB_HOST) : 'localhost (default)'}`);
console.log(`   DB_PORT: ${process.env.DB_PORT || '3307 (default)'}`);
console.log(`   DB_NAME: ${process.env.DB_NAME || 'onboarding_db (default)'}`);
console.log(`   DB_USER: ${process.env.DB_USER ? maskValue(process.env.DB_USER) : 'onboarding_user (default)'}`);
// Never log password

function maskValue(value) {
  if (!value || value.length <= 4) return '****';
  return value.substring(0, 2) + '****' + value.substring(value.length - 2);
}
```

**Better Recommendation:** Remove credential logging entirely in production:
```javascript
if (process.env.NODE_ENV !== 'production') {
  console.log('📊 Database connection configuration:');
  console.log(`   DB_HOST: ${process.env.DB_HOST || 'localhost (default)'}`);
  console.log(`   DB_PORT: ${process.env.DB_PORT || '3307 (default)'}`);
  console.log(`   DB_NAME: ${process.env.DB_NAME || 'onboarding_db (default)'}`);
  console.log(`   DB_USER: ${process.env.DB_USER || 'onboarding_user (default)'}`);
}
```

---

### 4. Repository Secret Exposure

**✅ Good:**
- `.env` files are properly gitignored (`.gitignore:7-11`)
- `.env.example` files exist but contain no real secrets
- No hardcoded secrets found in source code

**Files Checked:**
- ✅ `.gitignore` properly excludes `.env` files
- ✅ No `.env` files found in repository
- ✅ `.env.example` files contain placeholder values only

---

### 5. Frontend Build Secret Exposure

**Location:** `frontend/dist/` (build output)

**Analysis:**
- ✅ **No secrets found:** Searched for `secret`, `password`, `token`, `api` in build files
- ✅ **VITE_API_URL is safe:** Only contains public API URL (not a secret)
- ✅ **No backend secrets:** No JWT secrets, database credentials, or other backend secrets

**VITE_ Variables:**
- `VITE_API_URL` - Public API URL (safe to expose)
- No other `VITE_*` variables found

**Note:** All `VITE_*` variables are embedded in frontend builds at build time. Only use for public, non-sensitive values.

---

### 6. Cloud Run / Secret Manager Configuration

**Location:** `.github/workflows/deploy-backend.yml:57`, `cloudbuild-backend.yaml:34`

**Current Implementation:**
```yaml
--set-secrets="JWT_SECRET=JWT_SECRET:latest,DB_PASSWORD=DB_PASSWORD:latest,DB_USER=DB_USER:latest,GCS_CREDENTIALS=GCS_CREDENTIALS:latest"
```

**✅ Good:**
- Sensitive secrets are stored in Secret Manager
- Secrets are referenced by name (not values)
- Uses `:latest` version (appropriate for most cases)

**⚠️ Considerations:**
- `GCS_CREDENTIALS` may not be needed if using Cloud Run IAM (current implementation uses IAM)
- Consider using specific secret versions (`:1`, `:2`) for better control

**Recommendation:**
1. Verify `GCS_CREDENTIALS` is actually needed (current code uses IAM)
2. Consider using specific secret versions for production:
   ```yaml
   --set-secrets="JWT_SECRET=JWT_SECRET:1,DB_PASSWORD=DB_PASSWORD:1,DB_USER=DB_USER:1"
   ```

---

### 7. Environment Variable Exposure in Logs

**Current Logging:**
- ✅ **No password logging:** Passwords are never logged
- ⚠️ **Username logging:** Database username is logged in `runMigrations.js`
- ⚠️ **Host/Port logging:** Database host and port are logged (low risk)

**Recommendation:**
- Remove or mask credential logging in production
- Use environment-based logging levels
- Never log sensitive values (passwords, tokens, keys)

---

### 8. HMAC Secret

**Status:** ✅ **Not Found** (not needed)

**Analysis:**
- No HMAC secret usage found in codebase
- JWT uses symmetric signing (JWT_SECRET)
- No HMAC-based token generation found

**Conclusion:** No HMAC secret needed. Current implementation uses JWT_SECRET for token signing.

---

## Attack Scenarios

### Scenario 1: Default JWT Secret

**Attack:**
```
1. Attacker discovers application is running with default JWT_SECRET
2. Attacker uses known default: 'your-super-secret-jwt-key-change-in-production'
3. Attacker forges JWT tokens with any user ID and role
4. Attacker gains admin access
```

**Impact:** 🔴 **CRITICAL** - Complete authentication bypass

**Mitigation:** Require JWT_SECRET in production, fail fast if not set

---

### Scenario 2: Default Database Password

**Attack:**
```
1. Attacker discovers application is running with default DB_PASSWORD
2. Attacker connects to database using:
   - Host: localhost (or discovered host)
   - User: onboarding_user
   - Password: onboarding_pass
3. Attacker accesses all data, modifies records, deletes data
```

**Impact:** 🔴 **CRITICAL** - Complete database compromise

**Mitigation:** Require DB_PASSWORD in production, fail fast if not set

---

### Scenario 3: Secret Leakage via Logs

**Attack:**
```
1. Attacker gains access to Cloud Logging
2. Attacker finds database username in logs
3. Attacker uses username for brute force attacks
4. Attacker may discover password through other means
```

**Impact:** ⚠️ **MEDIUM** - Information disclosure (username only)

**Mitigation:** Remove or mask credential logging in production

---

## Recommendations

### Priority 1: Remove Default Secrets (CRITICAL)

**1. JWT_SECRET:**
```javascript
// backend/src/config/config.js
jwt: {
  secret: (() => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET environment variable is required in production');
      }
      console.warn('⚠️  WARNING: Using default JWT_SECRET in development only');
      return 'your-super-secret-jwt-key-change-in-production';
    }
    if (secret === 'your-super-secret-jwt-key-change-in-production' && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET cannot be the default value in production');
    }
    return secret;
  })(),
  expiresIn: process.env.JWT_EXPIRES_IN || '24h'
}
```

**2. Database Credentials:**
```javascript
// backend/src/config/database.js
const requiredInProduction = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

if (process.env.NODE_ENV === 'production') {
  for (const varName of requiredInProduction) {
    if (!process.env[varName]) {
      throw new Error(`${varName} environment variable is required in production`);
    }
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'onboarding_user',
  password: process.env.DB_PASSWORD || 'onboarding_pass',
  database: process.env.DB_NAME || 'onboarding_db',
  // ...
});
```

---

### Priority 2: Remove Credential Logging

**Update `backend/src/scripts/runMigrations.js`:**
```javascript
// Only log in development
if (process.env.NODE_ENV !== 'production') {
  console.log('📊 Database connection configuration:');
  console.log(`   DB_HOST: ${process.env.DB_HOST || 'localhost (default)'}`);
  console.log(`   DB_PORT: ${process.env.DB_PORT || '3307 (default)'}`);
  console.log(`   DB_NAME: ${process.env.DB_NAME || 'onboarding_db (default)'}`);
  console.log(`   DB_USER: ${process.env.DB_USER || 'onboarding_user (default)'}`);
} else {
  // In production, only log non-sensitive info
  console.log('📊 Database connection: Configured (credentials not logged)');
}
```

---

### Priority 3: Add Secret Validation on Startup

**Create `backend/src/config/validateSecrets.js`:**
```javascript
export function validateSecrets() {
  const requiredSecrets = {
    JWT_SECRET: process.env.JWT_SECRET,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_USER: process.env.DB_USER,
    DB_HOST: process.env.DB_HOST,
    DB_NAME: process.env.DB_NAME,
    PTONBOARDFILES: process.env.PTONBOARDFILES
  };

  if (process.env.NODE_ENV === 'production') {
    const missing = Object.entries(requiredSecrets)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables in production: ${missing.join(', ')}`
      );
    }

    // Check for default values
    const defaults = {
      JWT_SECRET: 'your-super-secret-jwt-key-change-in-production',
      DB_PASSWORD: 'onboarding_pass',
      DB_USER: 'onboarding_user',
      DB_HOST: 'localhost',
      DB_NAME: 'onboarding_db'
    };

    const usingDefaults = Object.entries(defaults)
      .filter(([key, defaultValue]) => requiredSecrets[key] === defaultValue)
      .map(([key]) => key);

    if (usingDefaults.length > 0) {
      throw new Error(
        `Cannot use default values in production: ${usingDefaults.join(', ')}`
      );
    }
  }
}
```

**Call in `backend/src/server.js`:**
```javascript
import { validateSecrets } from './config/validateSecrets.js';

// Validate secrets before starting server
try {
  validateSecrets();
} catch (error) {
  console.error('❌ Secret validation failed:', error.message);
  process.exit(1);
}
```

---

### Priority 4: Review GCS Credentials

**Current Implementation:**
- Uses Cloud Run IAM (no JSON key needed)
- `GCS_CREDENTIALS` secret may not be needed

**Recommendation:**
1. Verify if `GCS_CREDENTIALS` is actually used
2. If not used, remove from Secret Manager configuration
3. Document that GCS uses Cloud Run IAM

---

## Implementation Checklist

### Immediate (Priority 1)
- [ ] Remove default JWT_SECRET fallback in production
- [ ] Remove default DB_PASSWORD fallback in production
- [ ] Add validation to fail fast if secrets are missing in production
- [ ] Add check to prevent using default values in production

### Short-term (Priority 2)
- [ ] Remove credential logging in production
- [ ] Add secret validation on startup
- [ ] Review and remove unused GCS_CREDENTIALS secret

### Long-term (Priority 3)
- [ ] Add secret rotation documentation
- [ ] Implement secret versioning strategy
- [ ] Add monitoring/alerting for secret access

---

## Testing Recommendations

**1. Test Missing Secrets:**
```bash
# Should fail in production
NODE_ENV=production node src/server.js
# Expected: Error about missing JWT_SECRET
```

**2. Test Default Values:**
```bash
# Should fail in production
NODE_ENV=production JWT_SECRET=your-super-secret-jwt-key-change-in-production node src/server.js
# Expected: Error about using default value
```

**3. Test Development Mode:**
```bash
# Should work in development (with warnings)
NODE_ENV=development node src/server.js
# Expected: Warnings but application starts
```

**4. Test Secret Manager:**
```bash
# Verify secrets are loaded from Secret Manager in Cloud Run
gcloud run services describe onboarding-backend --region=us-central1 --format="value(spec.template.spec.containers[0].env)"
```

---

## Summary

**Critical Vulnerabilities:**
1. 🔴 Default JWT_SECRET allows authentication bypass
2. 🔴 Default DB_PASSWORD allows database access
3. ⚠️ Credential logging exposes usernames

**Current Security Posture:**
- ✅ Secrets are properly stored in Secret Manager
- ✅ `.env` files are gitignored
- ✅ No secrets in frontend builds
- ✅ No secrets in repository
- ❌ Default fallback values allow insecure operation
- ❌ No validation prevents using defaults in production

**Recommended Actions:**
1. **IMMEDIATE:** Remove default secret fallbacks in production
2. **IMMEDIATE:** Add validation to fail fast if secrets are missing
3. **SHORT-TERM:** Remove credential logging in production
4. **LONG-TERM:** Implement secret rotation and monitoring

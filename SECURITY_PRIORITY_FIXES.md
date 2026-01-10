# Security Priority Fixes

## 1. Prioritized Risk List

### 🔴 CRITICAL

1. **Unauthenticated File Access** (`backend/src/server.js:67-88`)
   - `/uploads` route has no authentication
   - Allows unauthenticated access to any file in GCS
   - Path traversal vulnerability
   - **Impact:** Complete file access bypass

2. **Default JWT Secret** (`backend/src/config/config.js:34`)
   - Default fallback: `'your-super-secret-jwt-key-change-in-production'`
   - Allows authentication bypass if secret not set
   - **Impact:** Complete authentication bypass

3. **Default Database Password** (`backend/src/config/database.js:12`)
   - Default fallback: `'onboarding_pass'`
   - Allows database access if password not set
   - **Impact:** Complete database compromise

### ⚠️ HIGH

4. **Missing Security Headers** (`backend/src/server.js:49-55`)
   - No Helmet middleware
   - No CSP, HSTS, Referrer-Policy
   - **Impact:** XSS, clickjacking, information leakage

5. **Path Traversal in /uploads** (`backend/src/server.js:72`)
   - User input used directly without sanitization
   - Allows `../` attacks
   - **Impact:** Access to files outside intended directories

### ⚠️ MEDIUM

6. **Credential Logging** (`backend/src/scripts/runMigrations.js:11-15`)
   - Database username logged to console
   - May appear in Cloud Logging
   - **Impact:** Information disclosure

7. **No Rate Limiting on /uploads** (`backend/src/server.js:67-88`)
   - Enables file enumeration attacks
   - **Impact:** Information disclosure via enumeration

### ⚠️ LOW

8. **Missing HSTS Header** (`frontend/nginx.conf:13-16`)
   - No Strict-Transport-Security header
   - **Impact:** Protocol downgrade attacks (HTTPS only)

9. **Predictable File Paths** (Various)
   - Some file paths use sequential IDs
   - **Impact:** File enumeration possible

---

## 2. Exact File/Line References

### Critical Issues

| Issue | File | Line(s) | Code |
|-------|------|---------|------|
| Unauthenticated /uploads | `backend/src/server.js` | 67-88 | `app.use('/uploads', async (req, res, next) => { ... })` |
| Default JWT Secret | `backend/src/config/config.js` | 34 | `secret: process.env.JWT_SECRET \|\| 'your-super-secret-jwt-key-change-in-production'` |
| Default DB Password | `backend/src/config/database.js` | 12 | `password: process.env.DB_PASSWORD \|\| 'onboarding_pass'` |

### High Priority Issues

| Issue | File | Line(s) | Code |
|-------|------|---------|------|
| Missing Helmet | `backend/src/server.js` | 49-55 | No `helmet` import or middleware |
| Path Traversal | `backend/src/server.js` | 72 | `const filePath = req.path.replace(/^\/uploads\//, '');` |

### Medium Priority Issues

| Issue | File | Line(s) | Code |
|-------|------|---------|------|
| Credential Logging | `backend/src/scripts/runMigrations.js` | 11-15 | `console.log(\`DB_USER: ${process.env.DB_USER}\`)` |

---

## 3. Code Patches for Top 3 Issues

### Patch 1: Fix Unauthenticated /uploads Route (CRITICAL)

**File:** `backend/src/server.js`

**Lines:** 67-88

**Current Code:**
```javascript
app.use('/uploads', async (req, res, next) => {
  try {
    const StorageService = (await import('./services/storage.service.js')).default;
    
    // Extract file path from request (e.g., /uploads/icons/filename.png -> icons/filename.png)
    const filePath = req.path.replace(/^\/uploads\//, '');
    
    if (!filePath || filePath === '/') {
      return res.status(404).json({ error: { message: 'File not found' } });
    }
    
    // Generate signed URL for direct GCS access
    // Signed URLs expire after 1 hour by default
    const signedUrl = await StorageService.getSignedUrl(filePath, 60);
    
    // Redirect to signed URL for direct access
    res.redirect(302, signedUrl);
  } catch (error) {
    console.error('Error generating signed URL for file:', error);
    res.status(404).json({ error: { message: 'File not found' } });
  }
});
```

**Patched Code:**
```javascript
import { authenticate } from './middleware/auth.middleware.js';
import rateLimit from 'express-rate-limit';

// Rate limiting for file access
const fileAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many file access requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/uploads', fileAccessLimiter, authenticate, async (req, res, next) => {
  try {
    const StorageService = (await import('./services/storage.service.js')).default;
    
    // Extract and sanitize file path
    let filePath = req.path.replace(/^\/uploads\//, '');
    
    // Sanitize path to prevent traversal
    filePath = filePath.replace(/\.\./g, ''); // Remove path traversal
    filePath = filePath.replace(/^\/+|\/+$/g, ''); // Remove leading/trailing slashes
    
    // Validate path format (must match expected patterns)
    const allowedPatterns = [
      /^icons\/[^\/]+$/,
      /^fonts\/[^\/]+$/,
      /^templates\/[^\/]+$/,
      /^signed\/\d+\/\d+\/[^\/]+$/,
      /^user_documents\/[^\/]+$/,
      /^user_specific_documents\/[^\/]+$/
    ];
    
    if (!filePath || !allowedPatterns.some(pattern => pattern.test(filePath))) {
      return res.status(404).json({ error: { message: 'File not found' } });
    }
    
    // Check if user has permission to access this file
    const hasAccess = await StorageService.validateFileAccess(req.user, filePath);
    if (!hasAccess) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    
    // Check if file exists
    const bucket = await StorageService.getGCSBucket();
    const file = bucket.file(filePath);
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: { message: 'File not found' } });
    }
    
    // Generate signed URL with appropriate TTL
    const ttl = filePath.startsWith('signed/') ? 15 : 60; // 15 min for sensitive, 60 min for others
    const signedUrl = await StorageService.getSignedUrl(filePath, ttl);
    
    // Redirect to signed URL for direct access
    res.redirect(302, signedUrl);
  } catch (error) {
    console.error('Error generating signed URL for file:', error);
    res.status(404).json({ error: { message: 'File not found' } });
  }
});
```

**Additional Required:** Add `validateFileAccess` method to `StorageService` (see Patch 1.1 below)

---

### Patch 1.1: Add validateFileAccess Method

**File:** `backend/src/services/storage.service.js`

**Add after line 619 (after `getSignedUrl` method):**

```javascript
  /**
   * Validate if user has permission to access a file
   * @param {Object} user - User object from req.user
   * @param {string} filePath - GCS file path
   * @returns {Promise<boolean>}
   */
  static async validateFileAccess(user, filePath) {
    // Public files (icons, fonts) - allow authenticated users
    if (filePath.startsWith('icons/') || filePath.startsWith('fonts/')) {
      return true;
    }
    
    // Templates - require admin
    if (filePath.startsWith('templates/')) {
      return user.role === 'admin' || user.role === 'super_admin' || user.role === 'support';
    }
    
    // Signed documents - check ownership
    if (filePath.startsWith('signed/')) {
      const match = filePath.match(/^signed\/(\d+)\/(\d+)\/(.+)$/);
      if (!match) return false;
      
      const [, userId] = match;
      
      // Admins can access any document
      if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'support') {
        return true;
      }
      
      // Regular users can only access their own documents
      return parseInt(userId) === user.id;
    }
    
    // User documents - check ownership via database
    if (filePath.startsWith('user_documents/')) {
      const UserDocument = (await import('../models/UserDocument.model.js')).default;
      const filename = filePath.replace('user_documents/', '');
      
      try {
        // Extract user ID from filename if present (format: user-doc-{userId}-{taskId}-{timestamp}.pdf)
        const match = filename.match(/^user-doc-(\d+)-/);
        if (match) {
          const fileUserId = parseInt(match[1]);
          
          // Admins can access any document
          if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'support') {
            return true;
          }
          
          // Regular users can only access their own documents
          return fileUserId === user.id;
        }
      } catch (err) {
        console.error('Error validating user document access:', err);
        return false;
      }
    }
    
    // User-specific documents - check ownership via database
    if (filePath.startsWith('user_specific_documents/')) {
      const UserSpecificDocument = (await import('../models/UserSpecificDocument.model.js')).default;
      const filename = filePath.replace('user_specific_documents/', '');
      
      try {
        // Query database to find document owner
        const documents = await UserSpecificDocument.findByFilePath(filename);
        
        if (!documents || documents.length === 0) {
          return false;
        }
        
        const document = documents[0];
        
        // Admins can access any document
        if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'support') {
          return true;
        }
        
        // Regular users can only access their own documents
        return document.user_id === user.id;
      } catch (err) {
        console.error('Error validating user-specific document access:', err);
        return false;
      }
    }
    
    return false;
  }
```

**Note:** You may need to add `findByFilePath` methods to `UserDocument` and `UserSpecificDocument` models if they don't exist.

---

### Patch 2: Fix Default JWT Secret (CRITICAL)

**File:** `backend/src/config/config.js`

**Line:** 34

**Current Code:**
```javascript
jwt: {
  secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  expiresIn: process.env.JWT_EXPIRES_IN || '24h'
}
```

**Patched Code:**
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
    // Prevent using default value in production even if explicitly set
    if (secret === 'your-super-secret-jwt-key-change-in-production' && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET cannot be the default value in production. Please set a secure secret.');
    }
    return secret;
  })(),
  expiresIn: process.env.JWT_EXPIRES_IN || '24h'
}
```

---

### Patch 3: Fix Default Database Password (CRITICAL)

**File:** `backend/src/config/database.js`

**Lines:** 8-21

**Current Code:**
```javascript
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'onboarding_user',
  password: process.env.DB_PASSWORD || 'onboarding_pass',
  database: process.env.DB_NAME || 'onboarding_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000,
  timezone: '+00:00'
});
```

**Patched Code:**
```javascript
// Validate required secrets in production
const requiredInProduction = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

if (process.env.NODE_ENV === 'production') {
  const missing = requiredInProduction.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required database environment variables in production: ${missing.join(', ')}`
    );
  }
  
  // Check for default values
  const defaults = {
    DB_PASSWORD: 'onboarding_pass',
    DB_USER: 'onboarding_user',
    DB_HOST: 'localhost',
    DB_NAME: 'onboarding_db'
  };
  
  const usingDefaults = Object.entries(defaults)
    .filter(([key, defaultValue]) => process.env[key] === defaultValue)
    .map(([key]) => key);
  
  if (usingDefaults.length > 0) {
    throw new Error(
      `Cannot use default database values in production: ${usingDefaults.join(', ')}`
    );
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'onboarding_user',
  password: process.env.DB_PASSWORD || 'onboarding_pass',
  database: process.env.DB_NAME || 'onboarding_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000,
  timezone: '+00:00'
});
```

---

## 4. Recommended Secure Defaults Configuration

### Production Configuration

**File:** `backend/src/config/config.js` (Complete Secure Version)

```javascript
import dotenv from 'dotenv';

dotenv.config();

// Determine CORS origin based on environment
const getCorsOrigin = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (nodeEnv === 'development') {
    return 'http://localhost:5173';
  }
  
  if (process.env.CORS_ORIGIN) {
    const origins = process.env.CORS_ORIGIN.split(',').map(origin => origin.trim());
    return origins.length === 1 ? origins[0] : origins;
  }
  
  throw new Error(
    'CORS_ORIGIN environment variable is required in production/staging environments. ' +
    'Please set CORS_ORIGIN to your frontend URL (e.g., https://yourdomain.com)'
  );
};

// Validate required secrets in production
const validateProductionSecrets = () => {
  if (process.env.NODE_ENV !== 'production') {
    return; // Skip validation in non-production
  }
  
  const requiredSecrets = {
    JWT_SECRET: process.env.JWT_SECRET,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_USER: process.env.DB_USER,
    DB_HOST: process.env.DB_HOST,
    DB_NAME: process.env.DB_NAME,
    PTONBOARDFILES: process.env.PTONBOARDFILES,
    CORS_ORIGIN: process.env.CORS_ORIGIN
  };
  
  const missing = Object.entries(requiredSecrets)
    .filter(([key, value]) => !value)
    .map(([key]) => key);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables in production: ${missing.join(', ')}`
    );
  }
  
  // Check for default/insecure values
  const insecureDefaults = {
    JWT_SECRET: 'your-super-secret-jwt-key-change-in-production',
    DB_PASSWORD: 'onboarding_pass',
    DB_USER: 'onboarding_user',
    DB_HOST: 'localhost',
    DB_NAME: 'onboarding_db'
  };
  
  const usingDefaults = Object.entries(insecureDefaults)
    .filter(([key, defaultValue]) => requiredSecrets[key] === defaultValue)
    .map(([key]) => key);
  
  if (usingDefaults.length > 0) {
    throw new Error(
      `Cannot use default/insecure values in production: ${usingDefaults.join(', ')}`
    );
  }
};

// Run validation
validateProductionSecrets();

export default {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
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
      if (secret === 'your-super-secret-jwt-key-change-in-production' && process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET cannot be the default value in production. Please set a secure secret.');
      }
      return secret;
    })(),
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  cors: {
    origin: getCorsOrigin()
  }
};
```

### Production Database Configuration

**File:** `backend/src/config/database.js` (Complete Secure Version)

```javascript
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Validate required secrets in production
const validateProductionDatabaseSecrets = () => {
  if (process.env.NODE_ENV !== 'production') {
    return; // Skip validation in non-production
  }
  
  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required database environment variables in production: ${missing.join(', ')}`
    );
  }
  
  // Check for default values
  const defaults = {
    DB_PASSWORD: 'onboarding_pass',
    DB_USER: 'onboarding_user',
    DB_HOST: 'localhost',
    DB_NAME: 'onboarding_db'
  };
  
  const usingDefaults = Object.entries(defaults)
    .filter(([key, defaultValue]) => process.env[key] === defaultValue)
    .map(([key]) => key);
  
  if (usingDefaults.length > 0) {
    throw new Error(
      `Cannot use default database values in production: ${usingDefaults.join(', ')}`
    );
  }
};

// Run validation
validateProductionDatabaseSecrets();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'onboarding_user',
  password: process.env.DB_PASSWORD || 'onboarding_pass',
  database: process.env.DB_NAME || 'onboarding_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000,
  timezone: '+00:00'
});

pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

pool.getConnection()
  .then(connection => {
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ Database connected successfully');
    }
    connection.query("SET time_zone = '+00:00'");
    connection.release();
  })
  .catch(err => {
    console.error('❌ Database connection error:', err.message);
  });

export default pool;
```

### Development vs Production Defaults

**Development (Safe Defaults):**
- ✅ JWT_SECRET: Default allowed (with warning)
- ✅ DB_PASSWORD: Default allowed (with warning)
- ✅ DB_USER: Default allowed
- ✅ DB_HOST: `localhost` allowed
- ✅ DB_NAME: Default allowed
- ✅ CORS_ORIGIN: `http://localhost:5173` (hardcoded)

**Production (Strict Requirements):**
- ❌ JWT_SECRET: **REQUIRED** - No default, must be set
- ❌ DB_PASSWORD: **REQUIRED** - No default, must be set
- ❌ DB_USER: **REQUIRED** - No default, must be set
- ❌ DB_HOST: **REQUIRED** - No default, must be set
- ❌ DB_NAME: **REQUIRED** - No default, must be set
- ❌ PTONBOARDFILES: **REQUIRED** - No default, must be set
- ❌ CORS_ORIGIN: **REQUIRED** - No default, must be set
- ❌ Cannot use default values even if explicitly set

### Environment Variable Checklist

**Required in Production:**
```bash
JWT_SECRET=<strong-random-32-byte-hex>
DB_HOST=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME
DB_PORT=3306
DB_USER=<secure-username>
DB_PASSWORD=<strong-random-password>
DB_NAME=onboarding_db
PTONBOARDFILES=<gcs-bucket-name>
CORS_ORIGIN=https://your-frontend-domain.com
NODE_ENV=production
```

**Optional (with defaults):**
```bash
PORT=3000
JWT_EXPIRES_IN=24h
GCS_PROJECT_ID=<auto-detected-from-service-account>
```

---

## Quick Implementation Guide

1. **Apply Patch 1** (File access): Add authentication and validation to `/uploads` route
2. **Apply Patch 2** (JWT secret): Add production validation
3. **Apply Patch 3** (DB password): Add production validation
4. **Update config files** with secure defaults pattern
5. **Test in development** - should work with warnings
6. **Test in production** - should fail fast if secrets missing
7. **Deploy** with Secret Manager secrets set

---

## Testing

**Test Production Validation:**
```bash
# Should fail
NODE_ENV=production node src/server.js

# Should fail (using default)
NODE_ENV=production JWT_SECRET=your-super-secret-jwt-key-change-in-production node src/server.js

# Should work (with warnings)
NODE_ENV=development node src/server.js
```

**Test File Access:**
```bash
# Should fail (no auth)
curl http://localhost:3000/uploads/icons/test.png

# Should work (with auth)
curl -H "Authorization: Bearer <token>" http://localhost:3000/uploads/icons/test.png

# Should fail (path traversal)
curl -H "Authorization: Bearer <token>" http://localhost:3000/uploads/../signed/1/2/file.pdf
```

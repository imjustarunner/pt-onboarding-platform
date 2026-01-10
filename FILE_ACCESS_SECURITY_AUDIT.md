# File/Document Access Security Audit

## Executive Summary

**CRITICAL VULNERABILITY FOUND:** The `/uploads` route in `backend/src/server.js` generates signed URLs **without authentication or authorization checks**, allowing unauthenticated users to access any file in GCS by guessing or enumerating paths.

**Current State:**
- 🔴 **`/uploads` Route:** No authentication, no authorization, path traversal vulnerable
- ✅ **Document Controllers:** Proper authentication and authorization checks
- ✅ **Signed URL TTL:** 60 minutes (reasonable)
- ⚠️ **Signed URL Scope:** Read-only (good), but no IP restrictions
- ⚠️ **Path Traversal:** `sanitizeFilename` exists but not used in `/uploads` route

**Vulnerabilities:**
- 🔴 **Unauthenticated File Access:** `/uploads` route has no auth middleware
- 🔴 **Path Traversal:** User input used directly without sanitization
- 🔴 **No Authorization Checks:** No validation that user has permission to access file
- ⚠️ **Predictable URLs:** File paths stored in database may be guessable
- ⚠️ **No Rate Limiting:** Signed URL generation not rate-limited

---

## Critical Finding: `/uploads` Route Vulnerability

### Location: `backend/src/server.js:67-88`

**Current Implementation:**
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

### Security Issues

**1. No Authentication (CRITICAL)**
- ❌ Route has no `authenticate` middleware
- ❌ Any unauthenticated user can access files
- ❌ No JWT token validation

**2. No Authorization (CRITICAL)**
- ❌ No check if user has permission to access the file
- ❌ No validation that file belongs to user's agency
- ❌ No check if file is private (signed documents, user documents)

**3. Path Traversal Vulnerability (CRITICAL)**
- ❌ User input (`req.path`) used directly without sanitization
- ❌ Attacker can use `../` to access files outside intended directories
- ❌ Example: `/uploads/../signed/1/2/private-document.pdf`
- ❌ `sanitizeFilename()` exists but is NOT used here

**4. No File Existence Check**
- ❌ Generates signed URL even if file doesn't exist
- ❌ Wastes resources and reveals file structure

**5. No Rate Limiting**
- ❌ Attacker can enumerate files by brute-forcing paths
- ❌ No protection against path enumeration attacks

---

## Signed URL Configuration Analysis

### Location: `backend/src/services/storage.service.js:609-619`

**Current Implementation:**
```javascript
static async getSignedUrl(key, expirationMinutes = 60) {
  const bucket = await this.getGCSBucket();
  const file = bucket.file(key);
  
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + (expirationMinutes * 60 * 1000)
  });
  
  return url;
}
```

### Analysis

**✅ Good:**
- `action: 'read'` - Only allows reading, not writing/deleting
- Default TTL: 60 minutes (reasonable for most use cases)

**⚠️ Missing:**
- No IP address restrictions
- No content-type restrictions
- No response header restrictions
- TTL is hardcoded (should be configurable per file type)

**Recommendations:**
1. Add IP restrictions for sensitive files (signed documents)
2. Make TTL configurable (shorter for sensitive files)
3. Add content-type validation
4. Consider using V4 signed URLs with more granular permissions

---

## Path Traversal Analysis

### Location: `backend/src/services/storage.service.js:220-235`

**Current Implementation:**
```javascript
static sanitizeFilename(filename) {
  // Remove path separators and dangerous characters
  let sanitized = filename.replace(/[\/\\\?\*\|"<>:]/g, '_');
  
  // Remove leading/trailing dots and spaces
  sanitized = sanitized.replace(/^[\s\.]+|[\s\.]+$/g, '');
  
  // Limit length
  if (sanitized.length > 255) {
    const ext = path.extname(sanitized);
    const name = path.basename(sanitized, ext);
    sanitized = name.substring(0, 255 - ext.length) + ext;
  }
  
  return sanitized || `file-${Date.now()}.pdf`;
}
```

**✅ Good:**
- Removes path separators (`/`, `\`)
- Removes dangerous characters
- Limits filename length
- Provides fallback

**❌ Problem:**
- This function is **NOT used** in the `/uploads` route
- The `/uploads` route uses `req.path` directly without sanitization

**Path Traversal Attack Example:**
```
GET /uploads/../signed/1/2/private-document.pdf
→ filePath = "../signed/1/2/private-document.pdf"
→ Generates signed URL for private document
→ Attacker accesses file they shouldn't have access to
```

---

## Document Access Authorization Review

### Signed Documents

**Location:** `backend/src/controllers/documentSigning.controller.js`

**✅ Good Authorization:**
- `viewSignedDocument` (lines 680-821): Checks user role and document ownership
- `downloadSignedDocument` (lines 823-944): Checks user role and document ownership
- Admins/super_admins/support can access any document
- Regular users can only access their own documents

**Example:**
```javascript
// Verify access - admins/super_admins/support can access any document
// Regular users can only access their own documents
if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'support') {
  if (signedDoc.user_id !== userId && task.assigned_to_user_id !== userId) {
    return res.status(403).json({ error: { message: 'Access denied' } });
  }
}
```

**✅ Routes Protected:**
- `GET /api/document-signing/:taskId/view` - Requires `authenticate`
- `GET /api/document-signing/:taskId/download` - Requires `authenticate`

**❌ Bypass Risk:**
- `/uploads/signed/{userId}/{documentId}/{filename}` - **NO AUTHENTICATION**

---

### User Documents

**Location:** `backend/src/controllers/userDocument.controller.js`

**✅ Good Authorization:**
- `getUserDocument` (lines 134-163): Checks user role and document ownership
- `getUserDocuments` (lines 168-193): Checks user role and user ID
- Supervisors/CPAs can access documents for users they supervise

**✅ Routes Protected:**
- `GET /api/user-documents/:id` - Requires `authenticate`
- `GET /api/user-documents/user/:userId` - Requires `authenticate`

**❌ Bypass Risk:**
- `/uploads/user_documents/{filename}` - **NO AUTHENTICATION**

---

### User-Specific Documents

**Location:** `backend/src/controllers/userSpecificDocument.controller.js`

**✅ Good Authorization:**
- `getUserSpecificDocument` (lines 114-144): Checks user role and document ownership
- `getUserSpecificDocuments` (lines 149-175): Checks user role and user ID

**✅ Routes Protected:**
- `GET /api/user-specific-documents/:id` - Requires `authenticate` + `requireAdmin`
- `GET /api/user-specific-documents/user/:userId` - Requires `authenticate` + `requireAdmin`

**❌ Bypass Risk:**
- `/uploads/user_specific_documents/{filename}` - **NO AUTHENTICATION**

---

### Document Templates

**Location:** `backend/src/controllers/documentTemplate.controller.js`

**✅ Good Authorization:**
- `getTemplate` (lines 233-253): Requires `authenticate` + `requireAdmin`
- `getTemplateForTask` (lines 255-279): Checks if user has assigned task

**✅ Routes Protected:**
- `GET /api/document-templates/:id` - Requires `authenticate` + `requireAdmin`
- `GET /api/document-templates/:id/task` - Requires `authenticate`

**⚠️ Partial Bypass Risk:**
- `/uploads/templates/{filename}` - **NO AUTHENTICATION** (but templates may be less sensitive)

---

### Icons and Fonts

**Location:** `backend/src/controllers/icon.controller.js`, `backend/src/controllers/font.controller.js`

**✅ Routes Protected:**
- Icon routes require `authenticate` + `requireAdmin`
- Font routes require `authenticate` + `requireAdmin`

**⚠️ Partial Bypass Risk:**
- `/uploads/icons/{filename}` - **NO AUTHENTICATION** (but icons may be public)
- `/uploads/fonts/{filename}` - **NO AUTHENTICATION** (but fonts may be public)

**Note:** Icons and fonts may be intentionally public, but this should be explicit.

---

## Predictable URL Analysis

### File Path Structure

**Current Structure:**
```
signed/{userId}/{documentId}/{filename}
user_documents/{filename}
user_specific_documents/{filename}
templates/{filename}
icons/{filename}
fonts/{filename}
```

**Predictability:**
- ✅ **Signed Documents:** Include `userId` and `documentId` - harder to guess
- ⚠️ **User Documents:** Only filename (may include user ID in filename)
- ⚠️ **Templates:** Only filename - easier to enumerate
- ⚠️ **Icons/Fonts:** Only filename - easier to enumerate

**Risk:**
- If an attacker knows a user ID and document ID, they can construct the path
- If filenames are predictable (e.g., `template-123.pdf`), enumeration is possible

**Recommendations:**
1. Use UUIDs or random strings in filenames instead of sequential IDs
2. Add random suffixes to filenames (already done in some places)
3. Store file paths in database and validate against database before serving

---

## Direct Bucket Exposure Risk

### Current Configuration

**Bucket Name:** Stored in `PTONBOARDFILES` environment variable

**Bucket Access:**
- Uses Cloud Run service account IAM credentials
- No public access (good)
- Files only accessible via signed URLs (good)

**Risk:**
- If bucket name is leaked, attacker still needs to:
  1. Guess file paths
  2. Generate signed URLs (requires service account credentials)
  3. Or use the `/uploads` route (if unauthenticated)

**Current Protection:**
- ✅ Bucket is not publicly readable
- ✅ Signed URLs require service account credentials
- ❌ `/uploads` route bypasses all protection

---

## Attack Scenarios

### Scenario 1: Unauthenticated Access to Private Documents

**Attack:**
```
1. Attacker discovers /uploads route has no authentication
2. Attacker guesses or enumerates file paths:
   GET /uploads/signed/1/2/private-document.pdf
3. Server generates signed URL without checking permissions
4. Attacker accesses private document
```

**Impact:** 🔴 **CRITICAL** - Unauthorized access to sensitive documents

**Mitigation:** Add authentication and authorization to `/uploads` route

---

### Scenario 2: Path Traversal Attack

**Attack:**
```
1. Attacker uses path traversal:
   GET /uploads/../signed/1/2/private-document.pdf
2. Server extracts path: "../signed/1/2/private-document.pdf"
3. Server generates signed URL for private document
4. Attacker accesses file outside intended directory
```

**Impact:** 🔴 **CRITICAL** - Access to files outside intended scope

**Mitigation:** Sanitize file paths and validate against allowed directories

---

### Scenario 3: File Enumeration

**Attack:**
```
1. Attacker brute-forces file paths:
   GET /uploads/templates/template-1.pdf
   GET /uploads/templates/template-2.pdf
   ...
2. Server generates signed URLs for existing files
3. Attacker discovers all template files
```

**Impact:** ⚠️ **MEDIUM** - Information disclosure

**Mitigation:** Add rate limiting and file existence checks before generating signed URLs

---

### Scenario 4: Predictable URL Guessing

**Attack:**
```
1. Attacker knows user ID (e.g., from public profile)
2. Attacker knows document ID (e.g., from task assignment)
3. Attacker constructs path: /uploads/signed/1/2/document.pdf
4. Server generates signed URL without authorization check
5. Attacker accesses document
```

**Impact:** 🔴 **CRITICAL** - Unauthorized access if authorization is bypassed

**Mitigation:** Validate file access against database and user permissions

---

## Recommendations

### Priority 1: Fix `/uploads` Route (CRITICAL)

**1. Add Authentication Middleware:**
```javascript
import { authenticate } from './middleware/auth.middleware.js';

app.use('/uploads', authenticate, async (req, res, next) => {
  // ... existing code
});
```

**2. Add Authorization Checks:**
```javascript
app.use('/uploads', authenticate, async (req, res, next) => {
  try {
    const StorageService = (await import('./services/storage.service.js')).default;
    
    // Extract and sanitize file path
    let filePath = req.path.replace(/^\/uploads\//, '');
    
    // Sanitize path to prevent traversal
    filePath = StorageService.sanitizePath(filePath);
    
    // Validate path format
    if (!filePath || filePath === '/') {
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
    
    // Generate signed URL
    const signedUrl = await StorageService.getSignedUrl(filePath, 60);
    res.redirect(302, signedUrl);
  } catch (error) {
    console.error('Error generating signed URL for file:', error);
    res.status(404).json({ error: { message: 'File not found' } });
  }
});
```

**3. Add Path Sanitization Function:**
```javascript
// In StorageService
static sanitizePath(filePath) {
  // Remove path traversal sequences
  let sanitized = filePath.replace(/\.\./g, '');
  
  // Remove leading/trailing slashes
  sanitized = sanitized.replace(/^\/+|\/+$/g, '');
  
  // Validate path format (must match expected patterns)
  const allowedPatterns = [
    /^icons\/[^\/]+$/,
    /^fonts\/[^\/]+$/,
    /^templates\/[^\/]+$/,
    /^signed\/\d+\/\d+\/[^\/]+$/,
    /^user_documents\/[^\/]+$/,
    /^user_specific_documents\/[^\/]+$/
  ];
  
  if (!allowedPatterns.some(pattern => pattern.test(sanitized))) {
    throw new Error('Invalid file path format');
  }
  
  return sanitized;
}
```

**4. Add File Access Validation:**
```javascript
// In StorageService
static async validateFileAccess(user, filePath) {
  // Public files (icons, fonts) - allow authenticated users
  if (filePath.startsWith('icons/') || filePath.startsWith('fonts/')) {
    return true; // Authenticated users can access public files
  }
  
  // Templates - require admin
  if (filePath.startsWith('templates/')) {
    return user.role === 'admin' || user.role === 'super_admin' || user.role === 'support';
  }
  
  // Signed documents - check ownership
  if (filePath.startsWith('signed/')) {
    const match = filePath.match(/^signed\/(\d+)\/(\d+)\/(.+)$/);
    if (!match) return false;
    
    const [, userId, documentId] = match;
    
    // Admins can access any document
    if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'support') {
      return true;
    }
    
    // Regular users can only access their own documents
    return parseInt(userId) === user.id;
  }
  
  // User documents - check ownership
  if (filePath.startsWith('user_documents/')) {
    // Extract user ID from filename if present
    // Or query database to find document owner
    const UserDocument = (await import('../models/UserDocument.model.js')).default;
    const document = await UserDocument.findByFilePath(filePath);
    
    if (!document) return false;
    
    // Admins can access any document
    if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'support') {
      return true;
    }
    
    // Regular users can only access their own documents
    return document.user_id === user.id;
  }
  
  // User-specific documents - check ownership
  if (filePath.startsWith('user_specific_documents/')) {
    // Similar to user_documents
    const UserSpecificDocument = (await import('../models/UserSpecificDocument.model.js')).default;
    const document = await UserSpecificDocument.findByFilePath(filePath);
    
    if (!document) return false;
    
    // Admins can access any document
    if (user.role === 'admin' || user.role === 'super_admin' || user.role === 'support') {
      return true;
    }
    
    // Regular users can only access their own documents
    return document.user_id === user.id;
  }
  
  return false;
}
```

---

### Priority 2: Enhance Signed URL Security

**1. Add IP Restrictions (for sensitive files):**
```javascript
static async getSignedUrl(key, expirationMinutes = 60, options = {}) {
  const bucket = await this.getGCSBucket();
  const file = bucket.file(key);
  
  const signedUrlOptions = {
    action: 'read',
    expires: Date.now() + (expirationMinutes * 60 * 1000)
  };
  
  // Add IP restriction for sensitive files
  if (options.clientIp) {
    signedUrlOptions.queryParams = {
      'x-goog-ip-address': options.clientIp
    };
  }
  
  const [url] = await file.getSignedUrl(signedUrlOptions);
  return url;
}
```

**2. Make TTL Configurable:**
```javascript
// Different TTLs for different file types
const TTL_CONFIG = {
  icons: 24 * 60,      // 24 hours (public files)
  fonts: 24 * 60,      // 24 hours (public files)
  templates: 60,        // 1 hour (admin-only)
  signed: 15,          // 15 minutes (sensitive)
  user_documents: 30,  // 30 minutes (user-specific)
  user_specific_documents: 30 // 30 minutes (user-specific)
};

static async getSignedUrl(key, expirationMinutes = null) {
  // Auto-detect file type and use appropriate TTL
  if (expirationMinutes === null) {
    if (key.startsWith('icons/')) expirationMinutes = TTL_CONFIG.icons;
    else if (key.startsWith('fonts/')) expirationMinutes = TTL_CONFIG.fonts;
    else if (key.startsWith('templates/')) expirationMinutes = TTL_CONFIG.templates;
    else if (key.startsWith('signed/')) expirationMinutes = TTL_CONFIG.signed;
    else if (key.startsWith('user_documents/')) expirationMinutes = TTL_CONFIG.user_documents;
    else if (key.startsWith('user_specific_documents/')) expirationMinutes = TTL_CONFIG.user_specific_documents;
    else expirationMinutes = 60; // Default
  }
  
  // ... rest of implementation
}
```

---

### Priority 3: Add Rate Limiting

**Add rate limiting to `/uploads` route:**
```javascript
import rateLimit from 'express-rate-limit';

const fileAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many file access requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/uploads', fileAccessLimiter, authenticate, async (req, res, next) => {
  // ... existing code
});
```

---

### Priority 4: Improve File Path Security

**1. Use UUIDs in Filenames:**
```javascript
// Instead of: template-123.pdf
// Use: template-a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf

import { randomUUID } from 'crypto';

static async saveTemplate(fileBuffer, filename) {
  const sanitizedFilename = this.sanitizeFilename(filename);
  const uuid = randomUUID();
  const ext = path.extname(sanitizedFilename);
  const uniqueFilename = `template-${uuid}${ext}`;
  const key = `templates/${uniqueFilename}`;
  // ... rest of implementation
}
```

**2. Store File Metadata in Database:**
- Always validate file access against database
- Never trust file paths from user input
- Query database to verify file exists and user has access

---

## Implementation Checklist

### Immediate (Priority 1)
- [ ] Add `authenticate` middleware to `/uploads` route
- [ ] Add `sanitizePath()` function to StorageService
- [ ] Add `validateFileAccess()` function to StorageService
- [ ] Update `/uploads` route to use path sanitization
- [ ] Update `/uploads` route to validate file access
- [ ] Add file existence check before generating signed URL
- [ ] Test path traversal attacks are blocked
- [ ] Test unauthorized access is blocked

### Short-term (Priority 2)
- [ ] Make signed URL TTL configurable per file type
- [ ] Add IP restrictions for sensitive files (optional)
- [ ] Add rate limiting to `/uploads` route
- [ ] Add logging for file access attempts

### Long-term (Priority 3)
- [ ] Use UUIDs in filenames instead of sequential IDs
- [ ] Store file metadata in database for all file types
- [ ] Add file access audit logging
- [ ] Consider using V4 signed URLs with more granular permissions

---

## Testing Recommendations

**1. Test Authentication:**
```bash
# Should fail without token
curl http://localhost:3000/uploads/icons/test.png

# Should succeed with valid token
curl -H "Authorization: Bearer <token>" http://localhost:3000/uploads/icons/test.png
```

**2. Test Path Traversal:**
```bash
# Should fail
curl -H "Authorization: Bearer <token>" http://localhost:3000/uploads/../signed/1/2/file.pdf
```

**3. Test Authorization:**
```bash
# User 1 should not access User 2's documents
curl -H "Authorization: Bearer <user1_token>" http://localhost:3000/uploads/signed/2/3/file.pdf
# Should return 403
```

**4. Test File Enumeration:**
```bash
# Should be rate-limited
for i in {1..200}; do
  curl -H "Authorization: Bearer <token>" http://localhost:3000/uploads/templates/template-$i.pdf
done
```

---

## Summary

**Critical Vulnerabilities:**
1. 🔴 `/uploads` route has no authentication
2. 🔴 `/uploads` route has no authorization checks
3. 🔴 Path traversal vulnerability in `/uploads` route
4. ⚠️ No rate limiting on file access
5. ⚠️ Predictable file paths (for some file types)

**Current Security Posture:**
- ✅ Document controllers have proper authentication and authorization
- ✅ Signed URLs are read-only with reasonable TTL
- ✅ Bucket is not publicly accessible
- ❌ `/uploads` route bypasses all security controls

**Recommended Actions:**
1. **IMMEDIATE:** Add authentication and authorization to `/uploads` route
2. **IMMEDIATE:** Fix path traversal vulnerability
3. **SHORT-TERM:** Add rate limiting and improve signed URL security
4. **LONG-TERM:** Use UUIDs and database validation for all file access

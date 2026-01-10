# Security Hardening Review: HTTP Security Headers

## Executive Summary

**Critical Finding:** Helmet is **NOT installed** in the backend. No security headers are set by the Express application. The frontend Nginx configuration has partial headers but is missing critical protections.

**Current State:**
- ❌ **Backend:** No security headers (no Helmet)
- ⚠️ **Frontend:** Partial headers in Nginx (missing CSP, HSTS, Referrer-Policy)
- ⚠️ **Missing Headers:** CSP, HSTS, Referrer-Policy, Permissions-Policy

**Vulnerabilities:**
- 🔴 **XSS Attacks:** No CSP protection
- 🔴 **Clickjacking:** Partial protection (X-Frame-Options only, no CSP frame-ancestors)
- 🔴 **MIME Sniffing:** Protected (X-Content-Type-Options present)
- ⚠️ **HTTPS Enforcement:** No HSTS header
- ⚠️ **Information Leakage:** No Referrer-Policy

---

## Current Security Headers Analysis

### Backend (Express) - ❌ **NO SECURITY HEADERS**

**Location:** `backend/src/server.js`

**Current State:**
- ❌ Helmet not installed
- ❌ No security headers set
- ❌ No CSP, HSTS, Referrer-Policy, or other headers

**Impact:** Backend API responses lack security headers, making the application vulnerable to:
- XSS attacks
- Clickjacking
- MIME sniffing
- Protocol downgrade attacks
- Information leakage via referrer headers

---

### Frontend (Nginx) - ⚠️ **PARTIAL HEADERS**

**Location:** `frontend/nginx.conf:13-16`

**Current Headers:**
```nginx
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
```

**Status:**
- ✅ `X-Frame-Options: SAMEORIGIN` - Prevents clickjacking (but CSP frame-ancestors is preferred)
- ✅ `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- ⚠️ `X-XSS-Protection: 1; mode=block` - Legacy header (CSP is preferred)

**Missing Headers:**
- ❌ `Content-Security-Policy` - **CRITICAL** for XSS protection
- ❌ `Strict-Transport-Security` - **CRITICAL** for HTTPS enforcement
- ❌ `Referrer-Policy` - Prevents information leakage
- ❌ `Permissions-Policy` - Controls browser features
- ❌ `X-Permitted-Cross-Domain-Policies` - Controls Flash/PDF policies

---

## Frontend Resource Analysis

### External Resources Used

**1. Google Fonts** (`frontend/index.html:9-11`)
- `fonts.googleapis.com` - Font CSS
- `fonts.gstatic.com` - Font files
- **Required for CSP:** `font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;`

**2. PDF.js CDN** (`frontend/src/components/documents/PDFSignatureCoordinatePicker.vue:113`)
- `cdn.jsdelivr.net` - PDF.js worker
- **Required for CSP:** `script-src 'self' https://cdn.jsdelivr.net;`

**3. YouTube/Vimeo Embeds** (`frontend/src/components/VideoPlayer.vue:5-12`)
- `www.youtube.com` - YouTube embeds
- `player.vimeo.com` - Vimeo embeds
- **Required for CSP:** `frame-src 'self' https://www.youtube.com https://player.vimeo.com;`

**4. Google Workspace Embeds** (`frontend/src/views/ModuleView.vue:83-89`)
- Dynamic Google Workspace URLs (docs.google.com, drive.google.com, etc.)
- **Required for CSP:** `frame-src 'self' https://*.google.com https://*.googleusercontent.com;`

**5. PDF/Image Embeds** (Various components)
- GCS signed URLs for PDFs/images
- **Required for CSP:** `frame-src 'self' https://storage.googleapis.com; img-src 'self' data: https://storage.googleapis.com;`

**6. Inline Styles/Scripts** (Vue.js)
- Vue.js uses inline styles and scripts
- **Required for CSP:** `style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline';` (or use nonces)

---

## Recommended Security Headers

### For Backend (Express API)

**Install Helmet:**
```bash
npm install helmet
```

**Configuration:**
```javascript
// backend/src/server.js
import helmet from 'helmet';
import config from './config/config.js';

// Configure Helmet with appropriate settings for API
app.use(helmet({
  // Content Security Policy - Relaxed for API (no UI)
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  
  // Strict Transport Security (HSTS) - Only in production with HTTPS
  strictTransportSecurity: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  
  // X-Content-Type-Options
  noSniff: true,
  
  // X-Frame-Options (for API, set to DENY)
  frameguard: {
    action: 'deny'
  },
  
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },
  
  // Permissions Policy (formerly Feature-Policy)
  permissionsPolicy: {
    features: {
      geolocation: ["'none'"],
      microphone: ["'none'"],
      camera: ["'none'"],
      payment: ["'none'"],
      usb: ["'none'"],
      magnetometer: ["'none'"],
      gyroscope: ["'none'"],
      accelerometer: ["'none'"],
    }
  },
  
  // X-DNS-Prefetch-Control
  dnsPrefetchControl: true,
  
  // X-Download-Options (IE8+)
  ieNoOpen: true,
  
  // X-Permitted-Cross-Domain-Policies
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none'
  },
  
  // Disable X-Powered-By header
  hidePoweredBy: true,
  
  // XSS Protection (legacy, but harmless)
  xssFilter: true
}));

// Conditionally enable HSTS only in production with HTTPS
if (config.nodeEnv === 'production' && process.env.ENABLE_HSTS !== 'false') {
  app.use(helmet.hsts({
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }));
}
```

---

### For Frontend (Nginx)

**Enhanced Configuration:**
```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Content Security Policy
    # Allow: Google Fonts, PDF.js CDN, YouTube/Vimeo, GCS, inline styles/scripts (Vue.js requirement)
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://storage.googleapis.com; frame-src 'self' https://www.youtube.com https://player.vimeo.com https://*.google.com https://*.googleusercontent.com https://storage.googleapis.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;" always;
    
    # Strict Transport Security (HSTS) - Only if using HTTPS
    # Uncomment in production with HTTPS:
    # add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    
    # Referrer Policy
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Permissions Policy (formerly Feature-Policy)
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()" always;
    
    # X-Permitted-Cross-Domain-Policies
    add_header X-Permitted-Cross-Domain-Policies "none" always;
    
    # Remove X-Powered-By (if not already removed)
    more_clear_headers "X-Powered-By";

    # Handle Vue Router (SPA routing)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Don't cache index.html
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }
}
```

---

## Content Security Policy (CSP) Configuration

### Recommended CSP for Onboarding Portal

**Rationale:**
- Vue.js requires `'unsafe-inline'` for styles and `'unsafe-eval'` for development
- Google Fonts requires external domains
- PDF.js requires CDN script
- Video embeds require YouTube/Vimeo frames
- GCS requires storage.googleapis.com for file serving

**CSP Directive Breakdown:**

```javascript
const cspDirectives = {
  // Default source - only same origin
  defaultSrc: ["'self'"],
  
  // Scripts - Vue.js + PDF.js CDN
  scriptSrc: [
    "'self'",
    "'unsafe-inline'",      // Vue.js requirement (consider nonces for production)
    "'unsafe-eval'",        // Vue.js dev mode (remove in production if possible)
    'https://cdn.jsdelivr.net'  // PDF.js worker
  ],
  
  // Styles - Vue.js + Google Fonts
  styleSrc: [
    "'self'",
    "'unsafe-inline'",      // Vue.js requirement
    'https://fonts.googleapis.com'  // Google Fonts CSS
  ],
  
  // Fonts - Google Fonts
  fontSrc: [
    "'self'",
    'https://fonts.gstatic.com'  // Google Fonts files
  ],
  
  // Images - Self, data URIs, GCS, and any HTTPS (for user-uploaded content)
  imgSrc: [
    "'self'",
    'data:',                // Data URIs (for icons, signatures)
    'https:',               // Any HTTPS image (user content, GCS)
    'blob:'                 // Blob URLs (for PDF previews)
  ],
  
  // Connect/AJAX - API and GCS
  connectSrc: [
    "'self'",
    'https://storage.googleapis.com'  // GCS signed URLs
  ],
  
  // Frames - YouTube, Vimeo, Google Workspace, GCS
  frameSrc: [
    "'self'",
    'https://www.youtube.com',
    'https://player.vimeo.com',
    'https://*.google.com',           // Google Workspace embeds
    'https://*.googleusercontent.com', // Google Drive previews
    'https://storage.googleapis.com'  // GCS PDF previews
  ],
  
  // Media - Self and GCS
  mediaSrc: [
    "'self'",
    'https://storage.googleapis.com'
  ],
  
  // Objects - None (no Flash, plugins)
  objectSrc: ["'none'"],
  
  // Base URI - Self only
  baseUri: ["'self'"],
  
  // Form actions - Self only
  formAction: ["'self'"],
  
  // Upgrade insecure requests (HTTP -> HTTPS)
  upgradeInsecureRequests: true
};
```

**Production CSP (Stricter):**
```javascript
// For production, consider using nonces instead of 'unsafe-inline'
const productionCSP = {
  scriptSrc: [
    "'self'",
    (req, res) => `'nonce-${res.locals.nonce}'`,  // Nonce-based CSP
    'https://cdn.jsdelivr.net'
  ],
  styleSrc: [
    "'self'",
    (req, res) => `'nonce-${res.locals.nonce}'`,  // Nonce-based CSP
    'https://fonts.googleapis.com'
  ],
  // ... rest of directives
};
```

---

## Header-by-Header Analysis

### 1. Content-Security-Policy (CSP) 🔴 **MISSING**

**Status:** ❌ Not set in backend or frontend

**Purpose:** Prevents XSS attacks by controlling which resources can be loaded

**Recommended Value:**
```
default-src 'self'; 
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; 
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; 
font-src 'self' https://fonts.gstatic.com; 
img-src 'self' data: https: blob:; 
connect-src 'self' https://storage.googleapis.com; 
frame-src 'self' https://www.youtube.com https://player.vimeo.com https://*.google.com https://*.googleusercontent.com https://storage.googleapis.com; 
object-src 'none'; 
base-uri 'self'; 
form-action 'self'; 
upgrade-insecure-requests;
```

**Implementation:**
- **Backend:** Use Helmet's `contentSecurityPolicy` middleware
- **Frontend:** Add to Nginx `add_header` directive

---

### 2. Strict-Transport-Security (HSTS) ⚠️ **MISSING**

**Status:** ❌ Not set

**Purpose:** Forces browsers to use HTTPS for all future requests

**Recommended Value:**
```
max-age=31536000; includeSubDomains; preload
```

**When to Enable:**
- ✅ **Production with HTTPS:** Enable
- ❌ **Development (HTTP):** Do NOT enable
- ⚠️ **Staging with HTTPS:** Enable (but shorter max-age)

**Implementation:**
```javascript
// Backend - Only in production with HTTPS
if (config.nodeEnv === 'production' && process.env.ENABLE_HSTS !== 'false') {
  app.use(helmet.hsts({
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }));
}

// Frontend Nginx - Only if using HTTPS
# add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
```

**Note:** HSTS is **irreversible** once set. Test thoroughly before enabling.

---

### 3. X-Content-Type-Options ✅ **PRESENT (Frontend)**

**Status:** ✅ Set in frontend Nginx

**Current Value:** `nosniff`

**Purpose:** Prevents MIME type sniffing attacks

**Recommendation:** ✅ Keep as-is

---

### 4. X-Frame-Options ✅ **PRESENT (Frontend)**

**Status:** ✅ Set in frontend Nginx

**Current Value:** `SAMEORIGIN`

**Purpose:** Prevents clickjacking attacks

**Recommendation:** 
- ✅ Keep for frontend (allows same-origin embedding)
- ⚠️ Backend should use `DENY` (API should not be embedded)

**Note:** CSP `frame-ancestors` is preferred over `X-Frame-Options`. If CSP is set, `X-Frame-Options` is ignored.

---

### 5. Referrer-Policy 🔴 **MISSING**

**Status:** ❌ Not set

**Purpose:** Controls how much referrer information is sent with requests

**Recommended Value:** `strict-origin-when-cross-origin`

**Options:**
- `no-referrer` - Never send referrer
- `same-origin` - Only send for same-origin requests
- `strict-origin-when-cross-origin` - Send full URL for same-origin, only origin for cross-origin HTTPS
- `origin-when-cross-origin` - Send full URL for same-origin, only origin for cross-origin

**For Onboarding Portal:** `strict-origin-when-cross-origin` (balance of security and functionality)

**Implementation:**
```javascript
// Backend
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));

// Frontend Nginx
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

---

### 6. Permissions-Policy (formerly Feature-Policy) 🔴 **MISSING**

**Status:** ❌ Not set

**Purpose:** Controls which browser features can be used

**Recommended Value for Onboarding Portal:**
```
geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()
```

**Rationale:** Onboarding portal doesn't need geolocation, camera, microphone, etc.

**Implementation:**
```javascript
// Backend
app.use(helmet.permissionsPolicy({
  features: {
    geolocation: ["'none'"],
    microphone: ["'none'"],
    camera: ["'none'"],
    payment: ["'none'"],
    usb: ["'none'"],
    magnetometer: ["'none'"],
    gyroscope: ["'none'"],
    accelerometer: ["'none'"],
  }
}));
```

---

### 7. X-XSS-Protection ⚠️ **PRESENT (Frontend, Legacy)**

**Status:** ⚠️ Set in frontend Nginx (legacy header)

**Current Value:** `1; mode=block`

**Purpose:** Legacy XSS protection (deprecated, CSP is preferred)

**Recommendation:** 
- ⚠️ Keep for now (harmless, but CSP is the modern solution)
- Consider removing once CSP is fully implemented and tested

---

### 8. X-Permitted-Cross-Domain-Policies 🔴 **MISSING**

**Status:** ❌ Not set

**Purpose:** Controls Flash and PDF cross-domain policies

**Recommended Value:** `none`

**Implementation:**
```javascript
// Backend
app.use(helmet.permittedCrossDomainPolicies({ permittedPolicies: 'none' }));
```

---

## Implementation Checklist

### Backend (Express)

- [ ] Install Helmet: `npm install helmet`
- [ ] Import and configure Helmet in `server.js`
- [ ] Set CSP with appropriate directives
- [ ] Enable HSTS (production only, HTTPS required)
- [ ] Set Referrer-Policy
- [ ] Set Permissions-Policy
- [ ] Set X-Permitted-Cross-Domain-Policies
- [ ] Enable hidePoweredBy
- [ ] Test all endpoints work with new headers

### Frontend (Nginx)

- [ ] Add CSP header to `nginx.conf`
- [ ] Add HSTS header (production only, HTTPS required)
- [ ] Add Referrer-Policy header
- [ ] Add Permissions-Policy header
- [ ] Add X-Permitted-Cross-Domain-Policies header
- [ ] Test frontend loads correctly with CSP
- [ ] Test video embeds work (YouTube/Vimeo)
- [ ] Test PDF previews work
- [ ] Test Google Fonts load correctly

---

## Complete Implementation

### Backend: `backend/src/server.js`

```javascript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';  // ADD THIS
import config from './config/config.js';
// ... other imports

const app = express();

// Trust proxy
app.set('trust proxy', true);

// Security headers with Helmet
app.use(helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],  // API should not be embedded
    },
  },
  
  // Strict Transport Security (only in production with HTTPS)
  strictTransportSecurity: config.nodeEnv === 'production' && process.env.ENABLE_HSTS !== 'false' ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  } : false,
  
  // X-Content-Type-Options
  noSniff: true,
  
  // X-Frame-Options (API should not be embedded)
  frameguard: {
    action: 'deny'
  },
  
  // Referrer Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin'
  },
  
  // Permissions Policy
  permissionsPolicy: {
    features: {
      geolocation: ["'none'"],
      microphone: ["'none'"],
      camera: ["'none'"],
      payment: ["'none'"],
      usb: ["'none'"],
      magnetometer: ["'none'"],
      gyroscope: ["'none'"],
      accelerometer: ["'none'"],
    }
  },
  
  // X-DNS-Prefetch-Control
  dnsPrefetchControl: true,
  
  // X-Download-Options (IE8+)
  ieNoOpen: true,
  
  // X-Permitted-Cross-Domain-Policies
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none'
  },
  
  // Hide X-Powered-By
  hidePoweredBy: true,
  
  // XSS Protection (legacy)
  xssFilter: true
}));

// CORS (after Helmet)
app.use(cors({
  origin: config.cors.origin,
  credentials: true
}));

// ... rest of middleware and routes
```

### Frontend: `frontend/nginx.conf`

```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Content Security Policy
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://storage.googleapis.com; frame-src 'self' https://www.youtube.com https://player.vimeo.com https://*.google.com https://*.googleusercontent.com https://storage.googleapis.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;" always;
    
    # Strict Transport Security (HSTS) - Only enable in production with HTTPS
    # Uncomment when deploying with HTTPS:
    # add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    
    # Referrer Policy
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Permissions Policy
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()" always;
    
    # X-Permitted-Cross-Domain-Policies
    add_header X-Permitted-Cross-Domain-Policies "none" always;
    
    # Remove X-Powered-By (if present)
    more_clear_headers "X-Powered-By";

    # Handle Vue Router (SPA routing)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Don't cache index.html
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }
}
```

---

## Testing Recommendations

1. **Test CSP:**
   - Verify Google Fonts load
   - Verify YouTube/Vimeo embeds work
   - Verify PDF previews work
   - Verify PDF.js loads from CDN
   - Check browser console for CSP violations

2. **Test HSTS:**
   - Only test in production with HTTPS
   - Verify header is present
   - Test that HTTP redirects to HTTPS

3. **Test All Headers:**
   - Use browser DevTools Network tab
   - Use security header testing tools (securityheaders.com, observatory.mozilla.org)
   - Verify all headers are present

4. **Test Functionality:**
   - Login/logout
   - File uploads/downloads
   - Video playback
   - PDF viewing
   - Document signing
   - All user workflows

---

## Security Header Summary

| Header | Backend | Frontend | Status | Priority |
|--------|---------|----------|--------|----------|
| **Content-Security-Policy** | ❌ Missing | ❌ Missing | 🔴 **CRITICAL** | P1 |
| **Strict-Transport-Security** | ❌ Missing | ❌ Missing | ⚠️ **HIGH** (HTTPS only) | P2 |
| **X-Content-Type-Options** | ❌ Missing | ✅ Present | ✅ Good | - |
| **X-Frame-Options** | ❌ Missing | ✅ Present | ⚠️ Partial | P2 |
| **Referrer-Policy** | ❌ Missing | ❌ Missing | ⚠️ **MEDIUM** | P2 |
| **Permissions-Policy** | ❌ Missing | ❌ Missing | ⚠️ **MEDIUM** | P3 |
| **X-Permitted-Cross-Domain-Policies** | ❌ Missing | ❌ Missing | ⚠️ **LOW** | P3 |
| **X-XSS-Protection** | ❌ Missing | ✅ Present | ⚠️ Legacy | - |

---

## Conclusion

The application is **missing critical security headers**, particularly CSP and HSTS. Helmet should be installed and configured immediately to protect against XSS, clickjacking, and other attacks.

**Immediate Actions:**
1. Install Helmet in backend
2. Configure Helmet with appropriate CSP for API
3. Add CSP header to frontend Nginx
4. Add Referrer-Policy to both backend and frontend
5. Enable HSTS in production (HTTPS required)

**Recommended Priority:**
- **Priority 1:** Install Helmet and configure CSP
- **Priority 2:** Add Referrer-Policy and HSTS (production)
- **Priority 3:** Add Permissions-Policy and other headers

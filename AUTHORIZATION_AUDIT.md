# Authorization Model Audit: User Status Enforcement

## Executive Summary

**Critical Finding:** The `checkPendingAccess` middleware exists but is **NOT applied to any routes**. Pending users can access many endpoints that should be restricted, potentially exposing sensitive data including other users' information, documents, and admin functionality.

**Status Definitions:**
- `pending`: Pre-hire users (not yet active employees)
- `active`: Active employees
- `completed`: Onboarding completed (access expires after 7 days)
- `terminated`: Terminated employees (access expires after 7 days)
- `ready_for_review`: Pending users ready for admin review
- `archived`: Soft-deleted users (via `is_archived` flag)

## Critical Vulnerabilities

### 1. `checkPendingAccess` Middleware Not Applied (CRITICAL)

**Location:** `backend/src/middleware/auth.middleware.js:126-180`

**Issue:** The middleware exists and defines allowed/blocked paths for pending users, but it's **never used** in any route file.

**Impact:** Pending users can access any authenticated endpoint, bypassing intended restrictions.

**Vulnerable Routes:** All routes that only use `authenticate` middleware without status checks.

### 2. Pending Users Can Access Other Users' Data (HIGH)

**Vulnerable Endpoints:**

#### `GET /api/users/:id` (Line 13 in `user.routes.js`)
- **Middleware:** `authenticate` only
- **Controller:** `getUserById` (line 379 in `user.controller.js`)
- **Issue:** Controller checks role but NOT requesting user's status
- **Impact:** Pending users can access other users' full profiles if they pass role checks
- **Fix Required:** Add status check: block pending users from accessing other users

#### `GET /api/users/:id/account-info` (Line 25 in `user.routes.js`)
- **Middleware:** `authenticate` only
- **Controller:** `getAccountInfo` (line 931 in `user.controller.js`)
- **Issue:** Controller blocks pending users from viewing their OWN account info (line 946), but allows them to view OTHER users' account info if they're admin/support
- **Impact:** Pending users with admin role can view other users' account info
- **Fix Required:** Block pending users entirely from this endpoint

#### `GET /api/activity-log/user/:userId` (Line 15 in `activityLog.routes.js`)
- **Middleware:** `authenticate` only
- **Controller:** `getUserActivityLog` (line 133 in `activityLog.controller.js`)
- **Issue:** Permission check (line 150) verifies role but NOT requesting user's status
- **Impact:** Pending users can view other users' activity logs if they pass role checks
- **Fix Required:** Add status check in `checkActivityLogPermission`

#### `GET /api/user-documents/user/:userId` (Line 16 in `userDocument.routes.js`)
- **Middleware:** `authenticate` only
- **Controller:** `getUserDocuments` (line 168 in `userDocument.controller.js`)
- **Issue:** Controller checks role but NOT requesting user's status (line 173)
- **Impact:** Pending users can access other users' documents if they pass role checks
- **Fix Required:** Add status check to block pending users

#### `GET /api/user-documents/:id` (Line 17 in `userDocument.routes.js`)
- **Middleware:** `authenticate` only
- **Controller:** `getUserDocument` (line 134 in `userDocument.controller.js`)
- **Issue:** Controller checks role but NOT requesting user's status (line 144)
- **Impact:** Pending users can access other users' documents if they pass role checks
- **Fix Required:** Add status check to block pending users

### 3. Pending Users Can Access Admin Endpoints (HIGH)

**Vulnerable Endpoints:**

#### `GET /api/users` (Line 10 in `user.routes.js`)
- **Middleware:** `authenticate, requireAdmin`
- **Controller:** `getAllUsers` (line 36 in `user.controller.js`)
- **Issue:** `requireAdmin` checks role but NOT status
- **Impact:** Pending users with admin role can list all users
- **Fix Required:** Add status check in `requireAdmin` middleware or controller

#### `GET /api/document-templates` (Line 127 in `documentTemplate.routes.js`)
- **Middleware:** `authenticate, requireAdmin`
- **Controller:** `getTemplates` (not shown, but likely exposes all templates)
- **Issue:** No status check
- **Impact:** Pending admin users can view all document templates
- **Fix Required:** Add status check

#### `GET /api/document-templates/:id` (Line 130 in `documentTemplate.routes.js`)
- **Middleware:** `authenticate, requireAdmin`
- **Issue:** No status check
- **Impact:** Pending admin users can view any document template
- **Fix Required:** Add status check

### 4. Completed/Terminated Users Can Still Access System (MEDIUM)

**Vulnerable Endpoints:** All routes that only check `authenticate` without verifying user status

**Issue:** Login controller (`auth.controller.js:161-333`) checks status on login, but once authenticated, there's no ongoing status verification.

**Impact:** Users with `completed` or `terminated` status can continue using the system after their 7-day expiration period if they maintain a valid JWT token.

**Fix Required:** Add status check middleware that verifies user is still `active` or `pending`.

### 5. No Status Check in `requireAdmin` Middleware (MEDIUM)

**Location:** `backend/src/middleware/auth.middleware.js:45-56`

**Issue:** Middleware only checks role, not status. A pending/terminated/completed user with admin role can access admin endpoints.

**Fix Required:** Add status check:
```javascript
export const requireAdmin = async (req, res, next) => {
  const requestingUser = await User.findById(req.user.id);
  
  // Check status - only active users can be admins
  if (requestingUser.status !== 'active') {
    return res.status(403).json({ 
      error: { message: 'Account must be active to access admin features' } 
    });
  }
  
  // Existing role check...
};
```

## Route-by-Route Access Matrix

### User Routes (`/api/users`)

| Route | Method | Middleware | Status Check? | Pending Access | Risk Level |
|-------|--------|------------|---------------|----------------|------------|
| `/me` | GET | `authenticate` | ❌ | ✅ Allowed (own data) | ✅ Safe |
| `/me/agencies` | GET | `authenticate` | ❌ | ✅ Allowed (own data) | ✅ Safe |
| `/` | GET | `authenticate, requireAdmin` | ❌ | ⚠️ **VULNERABLE** | 🔴 HIGH |
| `/archived` | GET | `authenticate, requireAdmin` | ❌ | ⚠️ **VULNERABLE** | 🔴 HIGH |
| `/:id` | GET | `authenticate` | ❌ | ⚠️ **VULNERABLE** | 🔴 HIGH |
| `/:id/agencies` | GET | `authenticate` | ❌ | ⚠️ **VULNERABLE** | 🟡 MEDIUM |
| `/:id` | PUT | `authenticate` | ❌ | ⚠️ **VULNERABLE** | 🔴 HIGH |
| `/:id/account-info` | GET | `authenticate` | ⚠️ Partial | ⚠️ **VULNERABLE** | 🔴 HIGH |
| `/:id/credentials` | GET | `authenticate, requireAdmin` | ❌ | ⚠️ **VULNERABLE** | 🔴 HIGH |
| `/:id/completion-package` | GET | `authenticate` | ❌ | ⚠️ **VULNERABLE** | 🟡 MEDIUM |
| `/:id/onboarding-checklist` | GET | `authenticate` | ❌ | ✅ Allowed (intended) | ✅ Safe |
| `/:id/training-focuses` | GET | `authenticate` | ❌ | ⚠️ **VULNERABLE** | 🟡 MEDIUM |

### Activity Log Routes (`/api/activity-log`)

| Route | Method | Middleware | Status Check? | Pending Access | Risk Level |
|-------|--------|------------|---------------|----------------|------------|
| `/user/:userId` | GET | `authenticate` | ❌ | ⚠️ **VULNERABLE** | 🔴 HIGH |
| `/user/:userId/summary` | GET | `authenticate` | ❌ | ⚠️ **VULNERABLE** | 🔴 HIGH |
| `/user/:userId/modules` | GET | `authenticate` | ❌ | ⚠️ **VULNERABLE** | 🔴 HIGH |

### User Document Routes (`/api/user-documents`)

| Route | Method | Middleware | Status Check? | Pending Access | Risk Level |
|-------|--------|------------|---------------|----------------|------------|
| `/generate` | POST | `authenticate` | ❌ | ⚠️ **VULNERABLE** | 🟡 MEDIUM |
| `/user/:userId` | GET | `authenticate` | ❌ | ⚠️ **VULNERABLE** | 🔴 HIGH |
| `/:id` | GET | `authenticate` | ❌ | ⚠️ **VULNERABLE** | 🔴 HIGH |
| `/:id/regenerate` | POST | `authenticate` | ❌ | ⚠️ **VULNERABLE** | 🟡 MEDIUM |

### Document Template Routes (`/api/document-templates`)

| Route | Method | Middleware | Status Check? | Pending Access | Risk Level |
|-------|--------|------------|---------------|----------------|------------|
| `/` | GET | `authenticate, requireAdmin` | ❌ | ⚠️ **VULNERABLE** | 🔴 HIGH |
| `/:id` | GET | `authenticate, requireAdmin` | ❌ | ⚠️ **VULNERABLE** | 🔴 HIGH |
| `/:id/task` | GET | `authenticate` | ❌ | ✅ Allowed (for tasks) | ✅ Safe |

### Task Routes (`/api/tasks`)

| Route | Method | Middleware | Status Check? | Pending Access | Risk Level |
|-------|--------|------------|---------------|----------------|------------|
| `/` | GET | `authenticate` | ❌ | ✅ Allowed (own tasks) | ✅ Safe |
| `/all` | GET | `authenticate, requireAdmin` | ❌ | ⚠️ **VULNERABLE** | 🔴 HIGH |

### Module Routes (`/api/modules`)

| Route | Method | Middleware | Status Check? | Pending Access | Risk Level |
|-------|--------|------------|---------------|----------------|------------|
| `/` | GET | `authenticate` | ⚠️ Partial* | ⚠️ **VULNERABLE** | 🟡 MEDIUM |
| `/:id` | GET | `authenticate` | ⚠️ Partial* | ⚠️ **VULNERABLE** | 🟡 MEDIUM |

*Controller checks status but may have gaps

## Recommended Middleware Patterns

### Pattern 1: Status-Aware Authentication Middleware

```javascript
// backend/src/middleware/auth.middleware.js

export const requireActiveStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(401).json({ error: { message: 'User not found' } });
    }
    
    // Allow pending users (they have restricted access via checkPendingAccess)
    if (user.status === 'pending' || user.status === 'ready_for_review') {
      return next();
    }
    
    // Block completed/terminated users after expiration
    if (user.status === 'completed' || user.status === 'terminated') {
      if (user.status_expires_at && new Date(user.status_expires_at) < new Date()) {
        return res.status(403).json({ 
          error: { message: 'Your account access has expired. Please contact your administrator.' } 
        });
      }
    }
    
    // Block inactive users
    if (user.is_active === false || user.is_active === 0) {
      return res.status(403).json({ 
        error: { message: 'Your account is inactive. Please contact your administrator.' } 
      });
    }
    
    // Only active users can proceed
    if (user.status !== 'active') {
      return res.status(403).json({ 
        error: { message: 'Account must be active to access this resource' } 
      });
    }
    
    next();
  } catch (error) {
    next(error);
  }
};
```

### Pattern 2: Enhanced `requireAdmin` with Status Check

```javascript
export const requireAdmin = async (req, res, next) => {
  try {
    const requestingUser = await User.findById(req.user.id);
    
    if (!requestingUser) {
      return res.status(401).json({ error: { message: 'User not found' } });
    }
    
    // CRITICAL: Only active users can be admins
    if (requestingUser.status !== 'active') {
      return res.status(403).json({ 
        error: { message: 'Account must be active to access admin features' } 
      });
    }
    
    // Check if user is inactive
    if (requestingUser.is_active === false || requestingUser.is_active === 0) {
      return res.status(403).json({ 
        error: { message: 'Account is inactive' } 
      });
    }
    
    // Existing role check
    const isSupervisor = User.isSupervisor(requestingUser);
    
    if (requestingUser.role !== 'admin' && 
        requestingUser.role !== 'super_admin' && 
        requestingUser.role !== 'support' && 
        !isSupervisor && 
        requestingUser.role !== 'clinical_practice_assistant') {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }
    
    next();
  } catch (error) {
    next(error);
  }
};
```

### Pattern 3: Apply `checkPendingAccess` to All Routes

```javascript
// backend/src/server.js

// Apply pending access restrictions globally
app.use('/api', checkPendingAccess);

// Then apply route-specific middleware
app.use('/api/users', userRoutes);
// ... other routes
```

### Pattern 4: Controller-Level Status Checks

For endpoints that need fine-grained control:

```javascript
export const getUserById = async (req, res, next) => {
  try {
    // Check requesting user's status
    const requestingUser = await User.findById(req.user.id);
    
    if (requestingUser.status === 'pending' || requestingUser.status === 'ready_for_review') {
      // Pending users can only view their own profile
      if (parseInt(req.params.id) !== req.user.id) {
        return res.status(403).json({ 
          error: { message: 'Pending users can only view their own profile' } 
        });
      }
    }
    
    // Existing logic...
  } catch (error) {
    next(error);
  }
};
```

## Implementation Priority

### Priority 1: Critical Fixes (Immediate)

1. **Apply `checkPendingAccess` middleware globally** to all `/api` routes
2. **Add status check to `requireAdmin` middleware** - block pending/terminated/completed users
3. **Add status check to `getUserById`** - block pending users from accessing other users
4. **Add status check to `getUserDocuments`** - block pending users from accessing other users' documents
5. **Add status check to `getUserActivityLog`** - block pending users from viewing other users' activity

### Priority 2: High Priority Fixes (This Week)

6. **Add `requireActiveStatus` middleware** and apply to all admin endpoints
7. **Add status check to `getAccountInfo`** - block pending users entirely
8. **Add status check to activity log permission function**
9. **Review and fix all document template endpoints**

### Priority 3: Medium Priority Fixes (Next Sprint)

10. **Add status expiration checks** to prevent completed/terminated users from accessing system
11. **Add status checks to module endpoints**
12. **Add status checks to task management endpoints**
13. **Create comprehensive test suite** for status-based authorization

## Testing Recommendations

1. **Create test cases for each status:**
   - Pending user attempting to access admin endpoints
   - Pending user attempting to access other users' data
   - Completed user after expiration attempting to access system
   - Terminated user attempting to access system

2. **Test role + status combinations:**
   - Pending admin user
   - Completed admin user
   - Terminated supervisor user

3. **Test edge cases:**
   - User status changes mid-session
   - Expired status with valid JWT token
   - Archived user attempting to access system

## Conclusion

The current authorization model has **critical gaps** in status enforcement. Pending users can access sensitive data and admin functionality if they have appropriate roles. The `checkPendingAccess` middleware exists but is not applied, and most endpoints lack status verification.

**Immediate Action Required:** Apply `checkPendingAccess` globally and enhance `requireAdmin` with status checks to prevent pending users from accessing admin features and other users' data.

# Platform Restructure & School Portal - Testing Guide

## Overview
This document outlines the testing approach for Step 1: Platform Restructure & School Portal implementation.

## Test Categories

### 1. Database Migration Tests
**File**: `database/migrations/099_add_organization_type.sql`

**Tests**:
- [ ] Migration runs successfully without errors
- [ ] All existing agencies have `organization_type = 'agency'` (backward compatibility)
- [ ] New organizations can be created with different organization types
- [ ] `slug` remains unique across all organization types
- [ ] Index on `organization_type` is created and functional

**How to test**:
```sql
-- Check existing agencies
SELECT id, name, slug, organization_type FROM agencies;

-- Verify all are 'agency'
SELECT COUNT(*) FROM agencies WHERE organization_type != 'agency';

-- Test unique slug constraint
INSERT INTO agencies (name, slug, organization_type) VALUES ('Test', 'existing-slug', 'school');
-- Should fail if slug already exists
```

### 2. Backend API Tests

#### 2.1 Organization by Slug Endpoint
**Endpoint**: `GET /api/agencies/slug/:slug`

**Tests**:
- [ ] Returns organization by slug (public, no auth)
- [ ] Returns 404 for non-existent slug
- [ ] Returns organization_type in response
- [ ] Works for all organization types (agency, school, program, learning)

**Test Cases**:
```bash
# Test agency slug
curl http://localhost:3000/api/agencies/slug/plottwistco

# Test school slug (after creating school)
curl http://localhost:3000/api/agencies/slug/rudy-elementary
```

#### 2.2 Referral Upload Endpoint
**Endpoint**: `POST /api/organizations/:slug/upload-referral`

**Tests**:
- [ ] Accepts PDF/image uploads
- [ ] Rejects non-PDF/image files
- [ ] Enforces 10MB file size limit
- [ ] Only allows uploads for school organizations
- [ ] Returns 403 for non-school organizations
- [ ] Uploads file to GCS successfully
- [ ] Returns file URL in response

**Test Cases**:
```bash
# Test valid upload (school)
curl -X POST http://localhost:3000/api/organizations/rudy-elementary/upload-referral \
  -F "file=@test-referral.pdf"

# Test invalid organization type
curl -X POST http://localhost:3000/api/organizations/plottwistco/upload-referral \
  -F "file=@test-referral.pdf"
# Should return 403
```

### 3. Frontend Routing Tests

#### 3.1 Organization Slug Routes
**Routes**: `/:organizationSlug`, `/:organizationSlug/login`, `/:organizationSlug/upload`, etc.

**Tests**:
- [ ] School slug routes to SchoolSplashView
- [ ] Agency slug routes to login (backward compatibility)
- [ ] Organization context loads correctly
- [ ] Branding applies based on organization
- [ ] 404 for non-existent organization slugs

**Test Cases**:
- Navigate to `/{school-slug}` → Should show school splash page
- Navigate to `/{agency-slug}/login` → Should show login page
- Navigate to `/{non-existent-slug}` → Should show 404 or redirect

#### 3.2 Login Redirect Tests
**Function**: `getLoginUrl()`

**Tests**:
- [ ] Users with single organization → redirect to `/{slug}/login`
- [ ] Users with multiple organizations → redirect to `/login`
- [ ] Super admins → always redirect to `/login`
- [ ] Supports both `slug` and `portal_url` (backward compatibility)

### 4. School Splash Page Tests

#### 4.1 Component Rendering
**Component**: `SchoolSplashView.vue`

**Tests**:
- [ ] Loads with correct organization branding
- [ ] Shows three action cards
- [ ] Digital Link shows "Coming soon"
- [ ] Upload button opens ReferralUpload modal
- [ ] Login button opens StaffLoginModal
- [ ] Redirects non-school organizations to login

#### 4.2 Referral Upload Modal
**Component**: `ReferralUpload.vue`

**Tests**:
- [ ] File input accepts PDF, JPG, PNG
- [ ] Drag and drop works
- [ ] File size validation (10MB max)
- [ ] Upload progress indicator
- [ ] Success/error messages display
- [ ] Modal closes on success

#### 4.3 Staff Login Modal
**Component**: `StaffLoginModal.vue`

**Tests**:
- [ ] Email/password validation
- [ ] Login success redirects to school portal
- [ ] Login failure shows error message
- [ ] Verifies user is associated with organization
- [ ] Blocks unauthorized users

### 5. School Portal Tests

#### 5.1 Restricted Client List
**Component**: `ClientListGrid.vue`

**Tests**:
- [ ] Shows only clients for school organization
- [ ] Backend filter: `WHERE organization_id = user.organization_id`
- [ ] Visible columns: Status, Provider, Admin Notes, Submission Date
- [ ] Hidden columns: Billing, SSN, Clinical notes, Internal notes
- [ ] Empty state when no clients
- [ ] Loading state during fetch
- [ ] Error handling

**Note**: Full testing requires clients table (Step 2)

### 6. Permission & Access Control Tests

#### 6.1 Organization Access Middleware
**Middleware**: `organizationAccess.middleware.js`

**Tests**:
- [ ] Super admin can access all organizations
- [ ] School staff can only access their school
- [ ] Agency staff can access their agencies
- [ ] Blocks unauthorized organization access
- [ ] Returns 404 for non-existent organizations

#### 6.2 School Staff Verification
**Middleware**: `requireSchoolStaff`

**Tests**:
- [ ] Only allows school organization access
- [ ] Verifies user association with school
- [ ] Blocks non-school staff from school operations

### 7. Backward Compatibility Tests

#### 7.1 Existing Agency Functionality
**Tests**:
- [ ] All existing agency routes still work
- [ ] Agency branding/portal URLs preserved
- [ ] User associations remain functional
- [ ] Existing agency queries return correct results
- [ ] No breaking changes to existing features

#### 7.2 Legacy Route Support
**Tests**:
- [ ] `/:agencySlug/login` still works (backward compatibility)
- [ ] Portal URL routing still works
- [ ] Existing login redirects unchanged

### 8. Integration Tests

#### 8.1 Organization Context Resolution
**Tests**:
- [ ] Organization context loads on route change
- [ ] Branding updates based on organization
- [ ] Organization store persists across navigation
- [ ] Context clears when leaving organization routes

#### 8.2 Branding Integration
**Tests**:
- [ ] School organizations use school branding
- [ ] Agency organizations use agency branding
- [ ] Platform branding fallback works
- [ ] Logo, colors, theme settings apply correctly

## Manual Testing Checklist

### Phase 1: Database & Backend
- [ ] Run migration `099_add_organization_type.sql`
- [ ] Verify all agencies have `organization_type = 'agency'`
- [ ] Create test school organization via API
- [ ] Test `GET /api/agencies/slug/:slug` endpoint
- [ ] Test referral upload endpoint

### Phase 2: Frontend Routing
- [ ] Navigate to `/{school-slug}` → School splash page
- [ ] Navigate to `/{school-slug}/login` → Login page
- [ ] Navigate to `/{school-slug}/upload` → Upload page
- [ ] Verify organization context loads

### Phase 3: School Splash Page
- [ ] Load school splash page
- [ ] Verify branding displays correctly
- [ ] Test "Upload Referral Packet" flow
- [ ] Test "School Staff Login" flow
- [ ] Verify "Digital Link" shows "Coming soon"

### Phase 4: School Portal
- [ ] Login as school staff
- [ ] Navigate to school portal dashboard
- [ ] Verify restricted client list (when clients table exists)
- [ ] Verify sensitive data is hidden

### Phase 5: Backward Compatibility
- [ ] Test existing agency login flow
- [ ] Test existing agency dashboard
- [ ] Verify all existing routes still work
- [ ] Test portal URL routing (legacy)

## Automated Testing (Future)

### Unit Tests
- Organization model methods
- Organization context utilities
- Login redirect logic
- Permission middleware

### Integration Tests
- End-to-end referral upload flow
- School staff login → portal access
- Organization context resolution
- Branding application

### E2E Tests (Cypress/Playwright)
- Complete school splash page flow
- Referral upload workflow
- School portal navigation
- Permission enforcement

## Known Limitations (Step 2 Dependencies)

The following features are placeholders until Step 2 (Client Management) is implemented:
- Client list in school portal (requires `clients` table)
- Referral pipeline workflow (requires `referrals` table)
- Bulk client importer (requires `clients` table)
- Client status history (requires `client_status_history` table)

These components are created and ready, but will return empty/placeholder responses until Step 2.

## Test Data Setup

### Create Test School Organization
```sql
INSERT INTO agencies (name, slug, organization_type, is_active) 
VALUES ('Rudy Elementary', 'rudy-elementary', 'school', TRUE);
```

### Create Test School Staff User
```sql
-- Create user
INSERT INTO users (email, password_hash, role, first_name, last_name, status)
VALUES ('school.staff@rudy.edu', '$2b$10$...', 'staff', 'School', 'Staff', 'ACTIVE_EMPLOYEE');

-- Associate with school
INSERT INTO user_agencies (user_id, agency_id)
VALUES (LAST_INSERT_ID(), (SELECT id FROM agencies WHERE slug = 'rudy-elementary'));
```

## Rollback Plan

If issues are discovered:
1. Migration can be reversed (remove `organization_type` column)
2. All existing functionality continues to work (backward compatible)
3. Frontend routes can fall back to legacy patterns
4. No data loss (migration only adds column, doesn't modify existing data)

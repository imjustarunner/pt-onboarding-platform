# Permissions Review (Backend Source of Truth)

This document summarizes **how permissions are enforced** in the app (server-side), and provides a **review matrix** by role plus a **feature → enforcement** map.

## Core concepts

- **Frontend routing is NOT security.** All real permission checks must happen in the backend.
- **The database stores facts** (e.g., `users.role`, agency membership, status). **Authorization is enforced by backend middleware + controller checks.**

## Enforcement primitives (backend)

### Middleware guards

- **`authenticate`**: Requires a valid JWT (cookie or `Authorization: Bearer ...`).
- **`requireBackofficeAdmin`**: Allows **only** `admin`, `super_admin`, `support`.
- **`requireSuperAdmin`**: Allows **only** `super_admin`.
- **`requireAgencyAdmin`**: Allows **admin/support** (or super_admin) **and** must have admin access to the target `agencyId`.
- **`requireAgencyAccess`**: User must belong to the target `agencyId` (admins/support/super_admin pass).
- **`requireCapability(...)`**: Capability gate derived **server-side** from DB user record.
- **`checkPendingAccess` / `requireActiveStatus`**: Status-based access restrictions.

### Capability flags (server-side)

From `backend/src/utils/capabilities.js`:

- **`canAccessPlatform`**
- **`canViewTraining`**
- **`canSignDocuments`**
- **`canJoinProgramEvents`**
- **`canUseChat`**

Capabilities are enforced via `requireCapability(...)` on selected route groups (see below).

## Role-based review matrix (high-level)

Legend:
- ✅ allowed (by default)
- ❌ blocked (by default)
- ⚠️ allowed only with additional constraints (e.g., agency membership, assignment, controller-level checks)

| Role | Access app shell | View training | Sign documents | Use chat | Backoffice admin tools | Manage org/agency settings | Manage users (list/archive/assign) | Branding templates | Imports (bulk/admin) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **super_admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **support** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **supervisor** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **clinical_practice_assistant** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **staff** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **provider** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **school_staff** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **approved_employee** | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **client_guardian** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Notes:
- “⚠️” is used where access typically depends on **status**, **agency membership**, **assignment**, and/or **controller filtering**.
- Supervisors/CPAs were intentionally **hardened to NOT inherit admin tooling**. Admin tooling is now protected by `requireBackofficeAdmin`.

## Feature → enforcement map (what guards what)

### Authentication / account lifecycle

- **Login**: open endpoint + rate limit; server authenticates and issues token.
- **Register (create user)**: guarded by `requireAdminOrFirstUser` (admin/support/super_admin only once an admin exists).
- **Password reset / setup**: token based; controlled server-side.

### Training

- **Modules** (`/api/modules/*`): `authenticate` + **`requireCapability('canViewTraining')`**
- **Training focus / tracks admin actions**: backoffice routes are guarded via `requireBackofficeAdmin` where applicable; user-level reads are `authenticate` + controller checks.

### Documents

- **User documents + signing routes**: `authenticate` + **`requireCapability('canSignDocuments')`**

### Branding

- **Platform branding update**: `authenticate` + `requireSuperAdmin`
- **Branding templates (list/create/apply/schedule)**: `authenticate` + **`requireBackofficeAdmin`**
- **Scheduled branding-applier job**: runs server-side (startup + midnight) and can update stored branding/template state.

### Users / Admin operations

Now protected by **`requireBackofficeAdmin`** (admin/super_admin/support only):
- List users (all/archived)
- Assign/remove agency affiliations
- Payroll-access toggles, H0032 mode, mark-complete/terminated/active, promote-to-onboarding
- Move pending → active, wipe pending user data
- Reset links (where additionally allowed by controller rules)

User self-service (generally `authenticate` + controller restrictions):
- View/update own profile fields (limited)
- Upload own profile photo
- View own tasks / own documents / own account info (controller filtered)

### Agencies / Organizations

Protected by **`requireBackofficeAdmin`**:
- Create/update agencies
- Notification triggers management
- Affiliated org operations (duplicate org / apply affiliated branding)
- “List school organizations” linking UI endpoint

### Content/configuration/admin tooling

Protected by **`requireBackofficeAdmin`**:
- Icons / icon templates
- Fonts
- Account types
- User info field definitions + categories
- Custom checklist items
- Module content editing endpoints
- Provider search index rebuild/compile endpoints
- Admin dashboard metrics + agency dashboards
- Admin actions (reset module/track, audit log)
- Onboarding packages management
- Admin task routes (`/api/tasks/all`, assign/bulk/override/reminder)

### Bulk importers

Protected by agency-level admin gating where used:
- Bulk client upload, bulk school upload: `authenticate` + `requireAgencyAdmin` + route-specific “admin-only” wrapper.

## Open questions (for your sign-off)

1. **Supervisor / CPA scope**: which *specific* read-only endpoints should they retain (e.g., “view supervisee progress”, “view limited account info”), and for *which* agencies?
2. **Chat scope**: should chat be limited beyond `canUseChat`, e.g., only allow messaging within agency/school assignments?
3. **School staff**: confirm whether they should see any cross-user “account info,” or only school roster + provider availability.


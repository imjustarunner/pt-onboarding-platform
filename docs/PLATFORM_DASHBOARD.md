# Platform Dashboard — Design & Integration Spec
## Super Admin / Platform Operations View

---

## 1. What Is The Platform Dashboard?

The **Platform Dashboard** is the exclusive operational interface for platform-level administrators (currently `super_admin` role). It is fundamentally different from any tenant admin dashboard — it represents the **entire platform** across all tenants, not any single organization.

It is the "control tower" of the SaaS platform itself, not an admin view of a specific healthcare tenant.

> **Key Rule:** No tenant-specific branding, patient data, or provider lists should ever appear in the Platform Dashboard's default view. Those belong to each tenant's scoped admin dashboard.

---

## 2. Platform vs. Tenant Admin Dashboard

| Aspect | Platform Dashboard (`SuperAdminDashboard`) | Tenant Admin Dashboard (`TenantAdminDashboard`) |
|---|---|---|
| Audience | Super Admins only | Tenant admins (admin, support, provider+, etc.) |
| Data scope | Platform-wide, all tenants aggregated | One tenant (scoped by agencyId / tenant tree) |
| Primary purpose | Health of the overall platform + tenant management | Day-to-day operations of a single tenant |
| Access path | `/admin` (no slug) or `/admin-dashboard` | `/:slug/admin-dashboard` |
| Tenant filter | Yes — browse/search all tenants | No — already scoped to one tenant |
| Patient data visible | No | Yes |
| Provider lists | No | Yes |
| Revenue shown | Platform-wide aggregate (optional) | Tenant MTD revenue |

---

## 3. Platform Dashboard — Core Sections

### 3.1 Top Stats Row (Platform-Wide)
Real aggregated metrics across all tenants. All pulled from live database queries.

| Stat | Source |
|---|---|
| Total Agencies / Tenants | `agencies` table, `organization_type = 'agency'` |
| Total Active Users | `users` joined with `user_agencies`, `status = ACTIVE_EMPLOYEE` |
| Total Modules | `modules` table |
| Training Templates | `training_focuses` where `is_template = true` |
| My Open Tickets | `support_tickets` assigned to current super admin user |

### 3.2 Tenant Filter Panel
The most critical feature for a platform admin: **the ability to quickly browse and navigate to any tenant**.

**Design:**
- Search bar to filter by tenant name or slug
- Grid of tenant cards, each showing:
  - Tenant name + slug
  - Active Patients (real count from `clients` table)
  - Active Employees (real count from `users` + `user_agencies`)
  - Open Tasks / Tickets (real count from `support_tickets`)
  - Unread Notifications (real count from `notifications`)
- Clicking a tenant card calls `agencyStore.setCurrentAgency(tenant)` and routes to `/${slug}/admin-dashboard`

**Backend endpoint:** `GET /api/dashboard/platform-tenant-summary`  
Returns: `{ tenants: [{ id, name, slug, activePatients, activeEmployees, openTasks, unreadNotifications }] }`

**Empty/loading states:** Show spinner while loading, "No tenants found" when search returns nothing.

### 3.3 Platform Quick Actions
Actions that operate at the platform level, not inside any tenant.

**Core platform actions (always visible):**
- Manage Agencies / Tenants → `/admin/settings?tab=agencies`
- Manage All Users → `/admin/users`
- Manage Modules → `/admin/modules`
- Manage Documents → `/admin/documents`
- Audit Center → `/admin/audit-center`
- Platform Settings → `/admin/settings`
- Executive Report → `/admin/executive-report`
- Beta Feedback → `/admin/beta-feedback`

**Operational platform actions:**
- Agency Calendar → `/admin/external-calendar-audit`
- Provider Management → `/admin/provider-availability`
- Communications → `/admin/communications`
- Payroll (platform view) → `/admin/payroll`
- Notifications → `/admin/notifications`
- School Portals Hub → `/admin/school-portals-hub`
- Digital Forms → `/admin/digital-forms`
- Surveys → `/admin/surveys`
- Marketing/Social → `/admin/marketing-social`

### 3.4 Presence & Team Board
Shows which team members (platform staff) are currently active, in/out, or traveling.
- Component: `PresenceStatusWidget` + `PresenceTeamPreview`
- Data: real-time presence status from the presence system
- Link to full presence board: `/admin/presence`

### 3.5 Platform Notifications
Global unread notifications across all tenants. Uses `NotificationCards` component.
- Distinct from per-tenant notifications
- Helps platform admins stay aware of cross-tenant alerts

---

## 4. Platform Dashboard — What It Should NOT Have

- Tenant-specific logo/branding in the platform view header
- Providers list for a specific tenant
- Patient list for a specific tenant
- MTD revenue for a single tenant (unless explicitly in a per-tenant card in the filter panel)
- Any hardcoded tenant name (e.g., "Burning Sage Health System") in the platform header

The platform header should always read **"Platform Dashboard"** with the platform's own logo.

---

## 5. Navigation & Routing

### From Platform → Tenant
When a super admin clicks a tenant card:
1. `agencyStore.setCurrentAgency(tenant)` is called
2. User is routed to `/${slug}/admin-dashboard` (the new `TenantAdminDashboard`)
3. All subsequent data fetches are scoped to that tenant's tree

### From Tenant → Platform
The `TenantAdminDashboard` beta bar includes "← Back to Classic Dashboard" which routes to `/${slug}/admin`, loading the classic `AgencyAdminDashboard`.  
When the full new dashboard suite is production-ready, this will route back to the platform view by clearing `currentAgency` and going to `/admin`.

---

## 6. Future Role: Platform Admin (Non-Super)

> **Deferred — captured for planning purposes.**

Eventually, a new role type is needed that:
- Has editing access to all tenants (like a super admin assistant)
- Can navigate the Platform Dashboard and manage tenants
- Cannot change platform-level system configuration (which remains super_admin only)
- Would be titled something like `platform_admin` or `platform_staff`

This role does NOT exist yet. When it does, the Platform Dashboard routing should be updated to admit it alongside `super_admin`.

---

## 7. Implementation Status

| Feature | Status |
|---|---|
| Tenant filter panel (search + cards) | ✅ Implemented (`SuperAdminDashboard.vue`) |
| Real tenant card metrics (patients, employees, tasks, notifications) | ✅ Implemented via `/api/dashboard/platform-tenant-summary` |
| `viewTenantDashboard` routing on card click | ✅ Implemented |
| Platform header (no tenant branding) | ✅ Header reads "Platform Dashboard" |
| Platform Quick Actions | ✅ Rendered by `QuickActionsSection` component |
| Presence widgets | ✅ `PresenceStatusWidget` + `PresenceTeamPreview` |
| Platform Notifications | ✅ `NotificationCards` component |
| Top stats row (agencies, users, modules, templates) | ✅ Real queries via `/agencies`, `/users`, `/modules` |
| Platform admin role (non-super) | 🔲 Not yet implemented — deferred |
| Clickable tenant cards route to `TenantAdminDashboard` | ✅ Routes to `/:slug/admin-dashboard` |
| No tenant branding in platform view | ✅ Fixed — header always shows "Platform Dashboard" |

---

## 8. Files

| File | Role |
|---|---|
| `frontend/src/views/admin/SuperAdminDashboard.vue` | Platform Dashboard component (current implementation) |
| `frontend/src/views/admin/TenantAdminDashboard.vue` | Beta tenant-scoped dashboard |
| `frontend/src/views/admin/AdminDashboard.vue` | Router/switcher: serves old or new dashboard based on role + opt-in |
| `backend/src/controllers/dashboard.controller.js` | `getPlatformTenantSummary`, `getScheduleSnapshot`, `getAgencySpecs` |
| `backend/src/routes/dashboard.routes.js` | Dashboard API route registration |
| `backend/src/middleware/agencyAccess.middleware.js` | Tenant-tree scoping middleware |
| `backend/src/utils/meDashboardTenantScope.js` | `resolveTenantRootAgencyId`, `listAgencyIdsInTenantTree`, `hasTenantAccess` |

---

## 9. Beta → Production Transition Plan

The new dashboards (`TenantAdminDashboard` + refined `SuperAdminDashboard`) are currently in **beta** — accessible via "Try New Dashboard →" banner on the classic dashboard.

**When ready to promote to default:**

1. Remove the beta banner from `AdminDashboard.vue`
2. Update `AdminDashboard.vue` routing to default to new dashboards:
   - `super_admin` (no tenant) → `SuperAdminDashboard` (already correct)
   - Other admin roles → `TenantAdminDashboard` (remove `AgencyAdminDashboard` from default path)
3. Remove the "← Back to Classic Dashboard" bar from `TenantAdminDashboard.vue`
4. Archive or deprecate `AgencyAdminDashboard.vue` (keep for reference)
5. Update router so `/:slug/admin` routes directly to `/:slug/admin-dashboard` (redirect already exists)

---

*Last updated: April 2026*
*Related: `docs/NEW_ADMIN_DASHBOARD.md` (Tenant Admin Dashboard spec)*

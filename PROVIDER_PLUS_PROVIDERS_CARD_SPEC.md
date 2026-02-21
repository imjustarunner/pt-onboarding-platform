# Provider Plus "Providers" Card – Implementation Spec

## Overview

Provider_plus users need a way to view **all providers** in their agency as though they were supervisors of them—in a new dashboard card labeled "Providers" with the supervision icon. They can navigate to each provider's caseload, school portals, schedule, and other pertinent info, mirroring the supervisor→supervisee experience.

## User Story

As a **provider_plus** user, I want a "Providers" card on my dashboard so I can:
- Browse all providers in my agency(ies)
- Select a provider and view their caseload
- Access their school portals (one button per school, like supervisor view)
- View their schedule
- Access other provider-specific info (profile, documents, etc.)

## Current Supervisor Flow (Reference)

1. **Supervision card** on dashboard → expands to show "My schedule" / "Supervisee schedules" toggle
2. **Supervisee chips** – fetch from `GET /api/supervisor-assignments/supervisor/:id`
3. **Select supervisee** → schedule grid shows that user's schedule
4. **School portals** – `GET /users/:id/affiliated-portals` (supervisor has access via `supervisorHasAccess`)
5. **Supervisee portal slugs** – `GET /users/me/supervisee-portal-slugs` for router/nav

## Implementation Plan

### Backend

#### 1. New API: Get providers for provider_plus

**Endpoint:** `GET /api/users/me/providers-for-support?agencyId=`

- **Auth:** provider_plus only
- **Returns:** List of providers in the requester's agency(ies), in same shape as supervisor-assignments response for reuse in UI:
  ```json
  [
    {
      "supervisee_id": 123,
      "supervisee_first_name": "Jane",
      "supervisee_last_name": "Doe",
      "agency_name": "Agency A",
      "supervisee_profile_photo_url": null
    }
  ]
  ```
- **Logic:** Query `user_agencies` for provider_plus's agencies, then all users with `role IN ('provider','supervisor') OR has_provider_access = TRUE` in those agencies. Exclude archived.

#### 2. Extend `GET /users/:id/affiliated-portals`

- **Current:** Allowed for self, admin/support/super_admin, or supervisor with `supervisorHasAccess`
- **Add:** provider_plus when they share an agency with the target user (same agency membership check)

#### 3. Extend `GET /users/me/supervisee-portal-slugs`

- **Current:** Returns slugs only for supervisors (from their supervisees' agencies)
- **Add:** For provider_plus, return slugs from **all providers** in their agencies (so they can navigate to any school portal)

#### 4. Schedule / provider summary access

- **Verify:** provider_plus can already call schedule summary for any user in their agency (user.controller.js `getProviderScheduleSummary` – check if provider_plus is allowed)
- **Verify:** provider_plus can view clients (already in ADMIN_LIKE_ROLES from prior fix)

### Frontend

#### 1. New "Providers" card for provider_plus

- **Location:** Dashboard rail (same area as Supervision card)
- **Icon:** Supervision icon (reuse `supervision` card icon)
- **Label:** "Providers"
- **Description:** "View and support all providers in your organization."
- **Visibility:** `user?.role === 'provider_plus'`

#### 2. Providers card content (mirrors Supervision card)

When the Providers card is expanded/selected:

- **Toggle:** "My schedule" | "Provider schedules" (or "All providers")
- **Provider selector:** Chips/dropdown like supervisee chips – "All providers" + one chip per provider
- **Search/sort:** Same as supervisees (name, agency, search)
- **Schedule grid:** When a provider is selected, show their schedule (reuse `ScheduleAvailabilityGrid` with `mode="admin"`)

#### 3. Provider navigation (like supervisee)

From the selected provider context, provider_plus should be able to:

- **Caseload:** Link to admin clients filtered by provider, or inline ProviderClientsTab scoped to selected provider
- **School portals:** Fetch `GET /users/:id/affiliated-portals` for selected provider, render portal buttons
- **User profile:** Link to `/admin/users/:id` (provider_plus already has access)
- **Schedule:** Already shown in the card

#### 4. Agency store: provider portal slugs for provider_plus

- **Extend** `fetchSuperviseePortalSlugs` or add `fetchProviderPortalSlugs`:
  - For provider_plus: call new endpoint or extend `supervisee-portal-slugs` to return all provider portals when role is provider_plus
- **Router:** When provider_plus navigates to slug routes, ensure they have access (they get slugs from all providers)

### Data Flow Summary

| Action | Supervisor | Provider_plus |
|--------|------------|--------------|
| List people to browse | `supervisor-assignments/supervisor/:id` | `users/me/providers-for-support` |
| View schedule | Schedule grid, `scheduleGridUserId` | Same |
| View affiliated portals | `users/:id/affiliated-portals` (supervisorHasAccess) | Same, add provider_plus + agency check |
| Portal slugs for nav | `users/me/supervisee-portal-slugs` | Extend to return all provider slugs |
| View caseload | Clients filtered by supervisee | Same (provider_plus has full access) |

### Files to Create/Modify

**Backend:**
- `user.controller.js` – add `getProvidersForSupport`, extend `getAffiliatedPortals`, extend `getSuperviseePortalSlugs`
- `user.routes.js` – add route for `GET /me/providers-for-support`

**Frontend:**
- `DashboardView.vue` – add Providers card, provider selector UI, reuse schedule grid logic
- `agency.js` store – extend portal slugs fetch for provider_plus
- `helpers.js` – add `isProviderPlus(user)` if not exists
- `router/index.js` – ensure provider_plus fetches portal slugs on slug routes

### Edge Cases

- **Multi-agency provider_plus:** Show providers from all their agencies (with agency filter/grouping like supervisees)
- **Empty list:** "No providers in your organization" message
- **Provider with no school portals:** affiliated-portals returns empty; no portal buttons

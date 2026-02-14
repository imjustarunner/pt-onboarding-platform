# Kiosk-as-User Architecture Plan

## Overview

Treat kiosks as **users with a special role** instead of public, unauthenticated endpoints. This enables:

- Per-kiosk login and session management
- Customized views per kiosk per agency
- Kiosks associated with multiple agencies (user selects agency at login)
- Kiosks optionally scoped to a specific program when needed
- Audit trail tied to kiosk identity

## Current State

- Kiosk uses public routes: `/kiosk/:locationId` (no auth)
- Location determines which program sites/staff are available
- Clock in/out, guardian check-in, event check-in work without login

## Proposed Architecture

### 1. New Role: `kiosk`

- Add `kiosk` to user roles (alongside `staff`, `provider`, `admin`, etc.)
- Kiosk users have minimal privileges: access only kiosk-specific views and APIs
- Stored in `users` table with `role = 'kiosk'`, `status = 'active'`

### 2. Kiosk User Model

```
users
  - id, first_name (e.g. "Lobby Kiosk"), last_name (e.g. "A"), email (kiosk-{id}@system)
  - role = 'kiosk'
  - status = 'active'
  - (no password or use system-generated; could use PIN or device token for auth)
```

### 3. Kiosk–Agency Association

- **Option A**: Use existing `user_agencies` (or equivalent) – kiosk user linked to one or more agencies
- **Option B**: New table `kiosk_agency_assignments`:
  - `kiosk_user_id`, `agency_id`, `office_location_id` (optional), `program_id` (optional)
  - When `program_id` is set, kiosk is scoped to that program (only that program’s sites/staff)
  - When `program_id` is null, kiosk shows all programs at that agency/location

### 4. Login Flow

1. Kiosk navigates to `/kiosk` or `/kiosk/login`
2. Kiosk user logs in (PIN, password, or device token)
3. If kiosk is associated with **multiple agencies**: show agency selector
4. If kiosk is associated with **one agency**: proceed directly
5. If kiosk is **program-scoped**: only show that program’s sites/staff
6. If kiosk is **agency-scoped**: show all programs at selected/assigned locations

### 5. Customized Views Per Kiosk

- Store `kiosk_settings_json` on user or `kiosk_agency_assignments`:
  - `allowed_modes`: `['clock', 'guardian', 'event']` – which modes this kiosk can use
  - `default_mode`: `'clock'` | `'guardian'` | `'event'`
  - `show_mode_selector`: boolean
  - Per-agency overrides possible

### 6. API Changes

- Kiosk routes move from public to **authenticated** (kiosk role)
- Middleware: `requireKioskUser` – ensures `req.user.role === 'kiosk'`
- Kiosk APIs receive `req.user.id` – filter locations/sites by kiosk’s assignments
- `GET /kiosk/me/context` – returns assigned agencies, locations, programs, allowed modes

### 7. Migration Path

1. Add `kiosk` role; create kiosk users for existing locations
2. Add `kiosk_agency_assignments` (or extend `user_agencies` with kiosk-specific fields)
3. Add kiosk login page
4. Convert kiosk routes to authenticated; keep optional public fallback for backward compatibility during transition
5. Deprecate public `/kiosk/:locationId` in favor of `/kiosk` (authenticated, context from session)

## Database Sketch

```sql
-- Optional: kiosk-specific assignments (if not using user_agencies)
CREATE TABLE kiosk_agency_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kiosk_user_id INT NOT NULL,
  agency_id INT NOT NULL,
  office_location_id INT NULL,  -- null = all locations for agency
  program_id INT NULL,         -- null = all programs; set = program-scoped
  settings_json JSON NULL,    -- per-assignment overrides
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_kiosk_agency_loc_prog (kiosk_user_id, agency_id, COALESCE(office_location_id, 0), COALESCE(program_id, 0)),
  FOREIGN KEY (kiosk_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (office_location_id) REFERENCES office_locations(id) ON DELETE SET NULL,
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE SET NULL
);
```

## Summary

| Aspect | Current | Proposed |
|--------|---------|----------|
| Auth | None (public) | Kiosk user login |
| Scope | Location ID in URL | Session + kiosk assignments |
| Multi-agency | N/A | Select agency at login |
| Program scope | Implicit via location | Explicit per assignment |
| Customization | Same for all | Per kiosk, per agency |
| Audit | Limited | Full user/session audit |

---

## Implementation Status (Completed)

- **Migration 406**: Adds `kiosk` role to users enum and creates `kiosk_agency_assignments` table
- **KioskAgencyAssignment model**: `findByKioskUserId`, `getContextForKiosk`, `create`
- **API**: `GET /api/kiosk/me/context` (authenticated, kiosk role only)
- **Middleware**: `requireKioskUser`
- **Frontend**:
  - `/kiosk/login` – Kiosk sign-in page
  - `/kiosk/app` – Authenticated kiosk app (agency/location selector → KioskView)
  - Router guard: kiosk users restricted to `/kiosk/*` routes
  - `getDashboardRoute()` returns `/kiosk/app` for kiosk role
- **Backward compatibility**: Public `/kiosk/:locationId` remains for unauthenticated use

### Creating a Kiosk User

1. Create a user with `role = 'kiosk'` (via admin user creation; set role to kiosk)
2. Set email (e.g. `kiosk-lobby@yourdomain.com`) and password
3. Insert into `kiosk_agency_assignments`:
   ```sql
   INSERT INTO kiosk_agency_assignments (kiosk_user_id, agency_id, office_location_id, program_id, settings_json)
   VALUES (?, ?, ?, ?, '{"allowed_modes":["clock","guardian","event"],"default_mode":"clock","show_mode_selector":true}');
   ```
   - `office_location_id`: specific location or NULL for all agency locations
   - `program_id`: specific program or NULL for all programs

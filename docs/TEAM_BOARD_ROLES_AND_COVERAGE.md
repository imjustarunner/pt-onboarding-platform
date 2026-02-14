# Team Board: Roles, Coverage, and Direct Access

## Vision Summary

The Team Board evolves from a flat list of people to a **role-based circle** where agencies see their assigned team organized by function (credentialing, billing, support, etc.). Management assigns teams to agencies; team members may serve multiple agencies. Agencies see **who is filling each slot today**—including replacements when someone is out—and have **direct access** to message the right person.

---

## Current State

| Component | Description |
|-----------|-------------|
| `agency_management_team` | agency_id, user_id, display_role, display_order. SuperAdmin assigns members per agency. |
| `user_presence_status` | status (in/out), note, started_at, ends_at, expected_return_at. |
| **AgencyManagementTeamView** | Circle layout showing assigned team with presence. Agency users see their team. |
| **PresenceTeamBoardView** | Table view for admins. Filter by agency, status, sort. |
| **Chat** | Platform chat exists; direct messaging between users. |

**Gaps:**
- No formal **role type** (credentialing vs billing vs support)—only free-text `display_role`.
- No **day-level coverage**—when someone is out, no replacement assignment.
- No **grouping by role** in the UI—circle is flat.
- No **direct message** link from team member to chat.

---

## Target State

### 1. Role-Based Organization

- **Role types** (e.g. `credentialing`, `billing`, `support`, `account_manager`) define slots.
- Each agency has **one primary assignee per role** (or more if needed).
- UI groups team members by role: "Credentialing", "Billing", "Support", etc.
- Circle or card layout: one "ring" or section per role.

### 2. Day-Level Coverage

- When the primary credentialing contact is out, a **replacement** fills that slot for the day.
- Agency sees the replacement, not the absent person.
- Management (or the system) assigns coverage per date.

### 3. Direct Access

- One-click **Message** opens chat with that team member.
- Team members are **familiar with the agency** (assigned, know context).

### 4. Multi-Agency Teams

- A team member can be on multiple agencies’ teams.
- Same person may be "Credentialing" for Agency A and "Billing" for Agency B.
- Assignment is per (agency, role, user).

---

## Data Model

### Phase 1: Role Types (Minimal)

**Option A: Extend `agency_management_team`**

```sql
ALTER TABLE agency_management_team
  ADD COLUMN role_type VARCHAR(40) NULL COMMENT 'credentialing, billing, support, account_manager, etc.' AFTER display_role,
  ADD INDEX idx_amt_role_type (role_type);
```

- `role_type`: enum or constrained string. Null = legacy/unspecified.
- `display_role`: remains for custom label (e.g. "Senior Credentialing Specialist").

**Option B: Reference table (more flexible)**

```sql
CREATE TABLE agency_team_role_types (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL UNIQUE,
  label VARCHAR(80) NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Seed: credentialing, billing, support, account_manager
```

Then `agency_management_team.role_type_id` FK to this table.

**Recommendation:** Start with Option A (simple). Add `role_type` as VARCHAR; validate against a fixed set in app code. Migrate to Option B if roles need admin configuration.

---

### Phase 2: Day-Level Coverage

```sql
CREATE TABLE agency_team_coverage (
  id INT PRIMARY KEY AUTO_INCREMENT,
  agency_id INT NOT NULL,
  role_type VARCHAR(40) NOT NULL,
  covered_by_user_id INT NOT NULL COMMENT 'Who is filling this slot',
  coverage_date DATE NOT NULL,
  replaces_user_id INT NULL COMMENT 'Optional: who they are covering for',
  note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_coverage (agency_id, role_type, coverage_date),
  INDEX idx_coverage_agency_date (agency_id, coverage_date),
  INDEX idx_coverage_user (covered_by_user_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (covered_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (replaces_user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

**Logic:**
- For a given (agency, role_type, date): if `agency_team_coverage` exists, use `covered_by_user_id`.
- Else: use primary assignee from `agency_management_team` (first by display_order for that role_type).
- If primary is out (presence status = out_*), and no coverage row, show primary as "Out" but still visible; or hide and show "No coverage today" (product choice).

---

### Phase 3: Primary Assignee Per Role

Today, multiple people can have the same `display_role`. For "who fills the slot," we need a clear primary.

**Option A:** One primary per (agency, role_type) in `agency_management_team`:
- Add `is_primary BOOLEAN DEFAULT FALSE` per row.
- Unique constraint: one primary per (agency_id, role_type).

**Option B:** Separate table `agency_team_role_assignments`:
- (agency_id, role_type, user_id, is_primary, effective_from, effective_until)
- More flexible for future (effective dates, multiple primaries).

**Recommendation:** Option A for Phase 1–2. Add `is_primary` to `agency_management_team`; enforce one primary per (agency, role_type) in app.

---

## API Design

### Agency View: "My Team Today"

```
GET /api/agency-management-team/me/today
```

**Response:**
```json
{
  "byRole": {
    "credentialing": {
      "roleLabel": "Credentialing",
      "primary": { "userId": 1, "displayName": "Jane Doe", "presenceStatus": "out_full_day", ... },
      "covering": { "userId": 2, "displayName": "John Smith", "presenceStatus": "in_available", ... },
      "visible": { "userId": 2, ... }
    },
    "billing": {
      "roleLabel": "Billing",
      "primary": { "userId": 3, ... },
      "covering": null,
      "visible": { "userId": 3, ... }
    }
  },
  "members": [ ... ]
}
```

- `visible`: who the agency sees for that role today (covering if set, else primary).
- Include presence, email, and `canMessage: true` for chat link.

### Admin: Set Coverage

```
POST /api/agency-management-team/coverage
{ "agencyId": 1, "roleType": "credentialing", "coverageDate": "2025-02-13", "coveredByUserId": 2, "replacesUserId": 1 }
```

### Admin: Configure Team (extend existing)

- When adding/editing team member: select `role_type` from dropdown.
- Optionally set `is_primary` per role.

---

## UI Design

### Agency View: "Your Management Team"

**Layout: Role-based circles or sections**

1. **By role** – Group by `role_type` (Credentialing, Billing, Support, etc.).
2. **Per role** – Show who is filling that slot today (primary or covering).
3. **Presence** – Status dot, label, optional return time.
4. **Actions** – Email, **Message** (opens chat).

**Visual options:**
- **Concentric rings** – Inner ring = credentialing, next = billing, etc.
- **Card sections** – One card per role, avatars inside.
- **Tabs** – Tab per role (simpler but less "at a glance").

**Recommendation:** Card sections—one card per role, with avatar + presence + Message. Keeps circle metaphor where useful (e.g. within each card).

### Admin: Team Config

- Add `role_type` dropdown when assigning members.
- Add `is_primary` checkbox per role (one primary per role per agency).
- New section: **Coverage** – Set coverage for a date (who covers whom).

### Admin: Coverage Calendar (Future)

- Calendar view: pick date, see who is out, assign replacements.
- Or: simple list for "today" and "tomorrow" coverage.

---

## Phased Implementation

### Phase 1: Role Types + Grouped UI ✅
**Scope:** Add role_type, group team by role in agency view.

1. Migration: add `role_type` to `agency_management_team`.
2. Seed or config: role types (credentialing, billing, support, account_manager).
3. Update AgencyManagementTeam model: group by role_type.
4. Update AgencyManagementTeamView: render by role (cards or sections).
5. Update admin config UI: role_type dropdown when adding members.

**Deliverable:** Agency sees team grouped by role. No coverage yet.

---

### Phase 2: Direct Message Link ✅
**Scope:** One-click Message from team member to chat.

1. Ensure chat supports 1:1 thread with a user.
2. Add "Message" button/link on each team member in AgencyManagementTeamView.
3. On click: open chat drawer (or navigate) with thread to that user; create thread if needed.

**Deliverable:** Agency can message team members directly from the team view.

---

### Phase 3: Day-Level Coverage ✅
**Scope:** Replacements when someone is out.

1. Migration: create `agency_team_coverage` table.
2. API: `GET /agencies/:id/management-team/today` returns team with coverage applied.
3. API: `POST /agencies/:id/management-team/coverage` for admin to set coverage.
4. Update agency view: show covering person when set for today.
5. Admin UI: simple form to set coverage (date, role, covered by, replaces).

**Deliverable:** When primary is out, agency sees replacement for that day.

---

### Phase 4: Primary Assignee + Coverage Calendar (Optional)
**Scope:** Clear primary per role; richer coverage management.

1. Add `is_primary` to `agency_management_team`.
2. Enforce one primary per (agency, role_type).
3. Admin: coverage calendar or improved coverage UI.
4. Optional: coverage rules (e.g. "when X is out, default to Y").

---

## Role Type Catalog (Initial)

| Code | Label |
|------|-------|
| credentialing | Credentialing |
| billing | Billing |
| support | Support |
| account_manager | Account Manager |

Extensible via config or DB table in Phase 4.

---

## Security & Access

- **Agency users:** See only their agency’s team. Filter by agency_id from session.
- **Admin/SuperAdmin:** Configure team and coverage for any agency.
- **Chat:** Reuse existing chat permissions (agency-scoped, etc.).

---

## Open Questions

1. **Multiple people per role** – Can an agency have 2 credentialing contacts? If yes, show both; coverage applies to "primary" or we need per-person coverage.
2. **Coverage source** – Who sets it? SuperAdmin only, or also the person who is out (self-assign replacement)?
3. **Notification** – When coverage is assigned, notify the covering person? The agency?
4. **Presence + coverage** – If primary is "out" and no coverage row, show "Unavailable" or still show primary as "Out" with note?

---

## Success Criteria

- [x] Agency sees team grouped by role (credentialing, billing, etc.).
- [x] Agency can message any visible team member in one click.
- [x] When primary is out, agency sees replacement for that day (when coverage is set).
- [x] Admin can assign team members with role type and set day-level coverage.

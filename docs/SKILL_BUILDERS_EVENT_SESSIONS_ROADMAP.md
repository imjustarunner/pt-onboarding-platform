# Skill Builders event sessions — roadmap

This doc tracks work **after** migration [`584_skill_builders_event_sessions.sql`](../database/migrations/584_skill_builders_event_sessions.sql): materialized rows in `skill_builders_event_sessions` (each **meeting pattern × calendar day** inside the skills group’s program span), optional `session_id` on `skill_builders_event_kiosk_punches`, and the **`GET /api/skill-builders/events/:eventId/sessions`** list used by the event portal kiosk.

## Shipped (baseline)

- **Materialize** on skills group create/update (school controller) and on hub **PATCH group-meetings** (before commit).
- **Portal**: “Scheduled sessions” card, kiosk optional **session** + **client** dropdowns; clock-in sends `sessionId` / `clientId` when set.
- **Payroll payload** on clock-out includes `companyEventSessionId` and `clientId` when present.

**Ops**: run migrations, then re-save the program week pattern (or touch the group) once if existing environments have no session rows yet.

---

## Phase 2 — Per-session provider assignments (shipped)

**Goal**: Tie “who is working this occurrence” to `skill_builders_event_sessions`, not only to the static `skills_group_providers` roster.

- **Schema**: [`585_skill_builders_event_session_providers.sql`](../database/migrations/585_skill_builders_event_session_providers.sql) — `skill_builders_event_session_providers` (`session_id`, `provider_user_id`), unique per pair, **CASCADE** when a session row is deleted (e.g. week pattern rebuild).
- **Read**: `GET .../sessions` includes `assignedProviders: [{ id, firstName, lastName }]` per session when **585** is applied (otherwise the list omits assignments gracefully).
- **Write**: `PUT /api/skill-builders/events/:eventId/sessions/:sessionId/providers` with `{ agencyId, providerUserIds: number[] }` — replaces staff for that session; every id must exist in `skills_group_providers` for the linked skills group. Same gate as week-pattern edit: `assertEventAccess` + `canManageTeamSchedulesForAgency`.
- **UI**: Event portal **Scheduled sessions** table — **Staff** column; coordinators use multi-select + **Save** per row; others see names read-only.

**Later**: optional kiosk filtering by assignment, notifications, bulk “copy roster to sessions”, `role` column on assignment rows.

---

## Phase 3 — Work schedule driven by sessions (in progress)

**Goal**: [`SkillBuildersWorkSchedulePanel.vue`](../frontend/src/components/availability/SkillBuildersWorkSchedulePanel.vue) / team schedule surfaces can highlight or filter by **upcoming materialized sessions** for the event, and (optionally) write availability blocks that align to session instants.

- **Read path (shipped slice)**: Event portal passes **`programSessionSummaries`** into the panel — upcoming rows from `GET .../sessions` (date, weekday, time, optional staff summary).
- **Write path**: either continue using `provider_skill_builder_availability` with smarter defaults from sessions, or introduce session-specific overrides (depends on payroll/legal needs).

---

## Phase 4 — Dedicated kiosk UX and forms

**Goal**: Full-screen or field **kiosk** flow: pick self (provider), optional **session**, optional **client**, then optional **forms** (e.g. driver acknowledgment, pickup) stored as structured payloads or linked intake rows.

- Reuse or extend [`KioskView.vue`](../frontend/src/views/KioskView.vue) vs event-scoped route only — product decision.
- Schema/API for form answers per punch or per session; guard PHI and retention policy.

---

*Adjust phases as product prioritizes payroll accuracy vs coordinator workload vs guardian-facing features.*

# School Portal Redesign — Implementation Note

## State ownership (frontend)
- **Primary state** lives in the Pinia store `frontend/src/store/schoolPortalRedesign.js`.
  - `days`: Mon–Fri metadata (used to “light up” days with providers).
  - `selectedWeekday`: the expanded day.
  - `dayProviders`: providers added to the selected day (via `school_day_provider_assignments`).
  - `providerPanels[weekday:providerUserId]`: per provider/day panel state:
    - `caseloadClients`: from `GET /api/school-portal/:schoolId/providers/:providerId/assigned-clients?dayOfWeek=...`
    - `slots`: from `GET /api/school-portal/:schoolId/days/:weekday/providers/:providerId/soft-slots`

## How soft schedule edits are persisted
- The UI edits a **slot list** (order + optional client + optional start/end + note).
- Persistence is **server-backed**:
  - **Load**: `GET /api/school-portal/:schoolId/days/:weekday/providers/:providerId/soft-slots`
    - If no DB rows exist yet, the API returns **generated defaults** (open slots) based on the provider’s `provider_school_assignments.slots_total` and assigned hours.
  - **Save (bulk upsert)**: `PUT /api/school-portal/:schoolId/days/:weekday/providers/:providerId/soft-slots` with `{ slots: [...] }`
    - Slots are written in request order as `slot_index = 1..N`.
    - `client_id` is validated to ensure the client is already assigned to that provider/day.
  - **Reorder (persisted slots)**: `POST /api/school-portal/:schoolId/days/:weekday/providers/:providerId/soft-slots/:slotId/move` with `{ direction: 'up'|'down' }`
    - Swaps `slot_index` with the neighbor.

## Default slot counts (1 slot per hour, editable)
- Provider capacity per school/day comes from `provider_school_assignments.slots_total`.
- The **default** `slots_total` is computed as **1 slot per hour** from the provider’s assigned school/day hours in `backend/src/controllers/providerSelfAffiliations.controller.js` (`autoSlotsFromTimes`), and can be increased (e.g., 40‑minute sessions) by admin/support/provider via the existing provider assignment tooling.


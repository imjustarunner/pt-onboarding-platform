# School Portal — Redesign Implementation Note

## State ownership (frontend)

- **School portal page state** lives in:
  - **Page-level UI state**: `frontend/src/views/school/SchoolPortalView.vue`
    - `portalMode`: `'home' | 'providers' | 'days' | 'roster' | 'skills'`
    - `clientLabelMode`: `'codes' | 'initials'` persisted in localStorage key `schoolPortalClientLabelMode`
  - **Data state**: `frontend/src/store/schoolPortalRedesign.js`
    - `days`: Mon–Fri metadata (used to light up/enable weekdays with providers)
    - `selectedWeekday`: selected weekday (starts `null`; user selects explicitly)
    - `dayProviders`: providers assigned to the selected weekday
    - `providerPanels[weekday:providerUserId]`: per-provider/per-day schedule state:
      - `caseloadClients`: `GET /api/school-portal/:schoolId/providers/:providerId/assigned-clients?dayOfWeek=...`
      - `slots`: `GET /api/school-portal/:schoolId/days/:weekday/providers/:providerId/soft-slots`

## How soft schedule edits are persisted

- The soft schedule is a list of **slots** (order + optional client + optional start/end + note).
- Persistence is **server-backed**:
  - **Load**: `GET /api/school-portal/:schoolId/days/:weekday/providers/:providerId/soft-slots`
    - If no DB rows exist yet, the API returns generated default open slots based on `provider_school_assignments` (hours + slots_total).
  - **Save (bulk upsert)**: `PUT /api/school-portal/:schoolId/days/:weekday/providers/:providerId/soft-slots` with `{ slots: [...] }`
    - Slots are written in request order as `slot_index = 1..N`.
  - **Reorder (persisted rows)**: `POST /api/school-portal/:schoolId/days/:weekday/providers/:providerId/soft-slots/:slotId/move`

## Client label mode (codes vs initials)

- A single toggle controls client labels across:
  - roster (`ClientListGrid`)
  - provider panels (`ClientInitialsList` + `SoftScheduleEditor`)
  - skills groups (`SkillsGroupsPanel`)
  - provider profile page (`ProviderSchoolProfile`)

## Provider School Info blurb

- Stored per provider-per-school in DB table `provider_school_profiles` (migration `database/migrations/287_provider_school_profiles.sql`).
- Updated by admin/staff via:
  - `PUT /api/school-portal/:schoolId/providers/:providerId/profile`
- Displayed in the school portal provider profile under “Provider info”.

## Docs/Links: Intake links + Google print behavior

- The School Portal **Docs / Links** panel is implemented in:
  - `frontend/src/components/school/redesign/PublicDocumentsPanel.vue`
- It loads two independent datasets on refresh/mount:
  - **Public docs library**: `GET /api/school-portal/:schoolId/public-documents`
  - **Affiliated intake links** (running list for the current org): `GET /api/school-portal/:schoolId/intake-links`
    - Backend implementation: `backend/src/controllers/schoolPortalIntakeLinks.controller.js`
- **Where the state lives**:
  - Intake links are stored as **local component state** in `PublicDocumentsPanel` (not in Pinia), since they’re only used on this screen.
- **QR generation**:
  - QR codes are generated client-side via `qrcode` using `buildPublicIntakeUrl(public_key)`.
  - QR images are not persisted anywhere; they are generated on demand when a user clicks **QR**.
- **Google Docs/Drive printing**:
  - For link-type items pointing at Google Docs/Drive, the UI hides the in-app **Print** action (Open-only) because embedded/iframe printing is unreliable and commonly renders with incorrect scaling.


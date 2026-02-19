# Google Event In-App Editing — Design Spec

## 1. Overview

Enable providers to view and edit their Google Calendar events directly from the schedule grid modal, without navigating away to Google Calendar. This extends the existing Google Event Detail modal (which currently only displays event info and links out).

**Scope:** Events from the user's primary Google Calendar that are displayed on the schedule via `includeGoogleEvents=true`. Does not include supervision sessions (those use `SupervisionModal`) or office bookings.

---

## 2. Current State

### 2.1 Data flow today

- **Backend:** `GET /users/:id/schedule-summary` calls `GoogleCalendarService.listEvents()` with `fields: 'items(id,summary,htmlLink,start,end)'`.
- **Response:** Events have `id`, `summary`, `htmlLink`, `startAt`, `endAt` only.
- **Non-admin viewers:** Events are sanitized via `sanitizeGoogleEventForSchedule()` to "Busy" (no summary, no link) for privacy.
- **Frontend:** `ScheduleAvailabilityGrid` displays events; clicking opens the Google Event Detail modal with "Open in Google Calendar" (popup).

### 2.2 What we lack for editing

| Need | Current | Required |
|------|---------|----------|
| Full event details | Only id, summary, htmlLink, start, end | + description, location, conferenceData (Meet link) |
| Edit API | None | PATCH endpoint that calls `calendar.events.patch` |
| Auth for edit | N/A | User can only edit their own events |

---

## 3. Design

### 3.1 API

#### 3.1.1 Get single event (for edit form)

```
GET /users/:id/google-events/:eventId
```

**Purpose:** Fetch full event details for the edit form. Used when the user opens the modal in "edit" mode.

**Params:**
- `id` — user ID (provider whose calendar we're reading)
- `eventId` — Google Calendar event ID (e.g. `abc123xyz`)

**Auth:**
- User must be viewing their own schedule (`req.user.id === id`) OR be a supervisor viewing a supervisee.
- Reuse existing `getUserScheduleSummary` access rules.

**Response:**
```json
{
  "id": "abc123xyz",
  "summary": "Sharon - Interview Colorado Springs intern",
  "description": "Interview notes...",
  "location": "Conference Room A",
  "htmlLink": "https://calendar.google.com/...",
  "startAt": "2026-02-19T11:00:00-07:00",
  "endAt": "2026-02-19T12:00:00-07:00",
  "allDay": false,
  "meetLink": "https://meet.google.com/xxx-yyyy-zzz",
  "status": "confirmed"
}
```

**Backend:** New `GoogleCalendarService.getEvent({ subjectEmail, calendarId, eventId })` that calls `calendar.events.get` with expanded fields:
- `items(id,summary,description,location,htmlLink,start,end,status,conferenceData)`  
- Extract Meet link from `conferenceData.entryPoints` or `hangoutLink`.

---

#### 3.1.2 Update event

```
PATCH /users/:id/google-events/:eventId
```

**Purpose:** Update event fields (summary, description, location, start, end).

**Request body:**
```json
{
  "summary": "Sharon - Interview Colorado Springs intern",
  "description": "Interview notes...",
  "location": "Conference Room A",
  "startAt": "2026-02-19T11:00:00",
  "endAt": "2026-02-19T12:00:00"
}
```

**Validation:**
- All fields optional (partial update).
- `startAt` / `endAt` must be valid ISO strings; end must be after start.
- `summary` max length ~1024 chars (Google limit).

**Auth:** Same as GET — user must own the calendar or be authorized supervisor.

**Response:**
```json
{
  "ok": true,
  "event": { ... updated event }
}
```

**Backend:** New `GoogleCalendarService.patchEvent({ subjectEmail, calendarId, eventId, requestBody })` that calls `calendar.events.patch` with:
- `requestBody`: { summary?, description?, location?, start?, end? }
- `sendUpdates`: `'all'` (notify attendees)
- `conferenceDataVersion`: 1 (if we ever add Meet link creation — out of scope for v1)

**Error handling:**
- 404 if event not found or deleted
- 403 if user lacks permission
- 400 for invalid payload

---

### 3.2 Backend changes

#### 3.2.1 GoogleCalendarService

**New methods:**

```javascript
// Get full event
static async getEvent({ subjectEmail, calendarId = 'primary', eventId }) {
  // calendar.events.get with fields: id,summary,description,location,htmlLink,start,end,status,conferenceData
  // Return normalized { id, summary, description, location, htmlLink, startAt, endAt, allDay, meetLink, status }
}

// Patch event
static async patchEvent({ subjectEmail, calendarId = 'primary', eventId, summary, description, location, startAt, endAt }) {
  // Build requestBody from provided fields
  // calendar.events.patch
  // Return normalized event
}
```

**listEvents enhancement (optional):** Include `description`, `location`, `conferenceData` in the `fields` param so the schedule summary already has richer data. This reduces extra round-trips when opening the modal. Trade-off: larger payload.

**Recommendation:** Add `getEvent` for on-demand fetch when opening edit form. Keep `listEvents` unchanged for now to avoid breaking schedule-summary payload size. We can add `getEvent` and have the modal fetch full details when "Edit" is clicked.

---

#### 3.2.2 User controller

**New handlers:**
- `getUserGoogleEvent` — GET /users/:id/google-events/:eventId
- `patchUserGoogleEvent` — PATCH /users/:id/google-events/:eventId

**Authorization logic (reuse):**
- Same as `getUserScheduleSummary`: self, or supervisor of provider, or admin.
- Resolve `providerEmail` from `User.findById(id)`.

---

#### 3.2.3 Routes

**user.routes.js:**
```javascript
router.get('/:id/google-events/:eventId', authenticate, getUserGoogleEvent);
router.patch('/:id/google-events/:eventId', authenticate, patchUserGoogleEvent);
```

---

### 3.3 Frontend changes

#### 3.3.1 Google Event Modal

**Current:** Display-only modal with "Open in Google Calendar" (popup).

**New:** Add edit mode:

1. **View mode (default):**
   - Title, time, location (if present)
   - "Join meeting" button if `meetLink` exists (opens in popup)
   - "Open in Google Calendar" (popup)
   - "Edit" button

2. **Edit mode:**
   - Inline form: summary (text), description (textarea), location (text), start, end (datetime-local)
   - "Save" / "Cancel"
   - On save: `PATCH /users/:id/google-events/:eventId`, then refresh schedule summary and close edit mode

**Data loading:**
- **Option A:** If schedule summary already has full fields (after we expand listEvents), use that. No extra fetch.
- **Option B:** On "Edit" click, call `GET /users/:id/google-events/:eventId` to load full details. Simpler, one extra request when editing.

**Recommendation:** Option B — fetch on edit. Keeps schedule-summary payload small and avoids changing listEvents.

---

#### 3.3.2 ScheduleAvailabilityGrid

- Pass `userId` (or derive from props) to the modal when opening.
- When opening from `googleEventsInCell`, we have `ev.id` (Google event ID). Use that for GET/PATCH.
- After successful PATCH, call `load()` to refresh the grid.

---

### 3.4 Permissions

| Actor | Can view own events | Can edit own events |
|-------|---------------------|---------------------|
| Self (provider) | Yes | Yes |
| Supervisor of provider | Yes (if schedule access) | No (v1) — restrict to self only |
| Admin | Yes | No (v1) — restrict to self only |

**v1 simplification:** Only allow editing when `req.user.id === id`) (self). Supervisors and admins can view but not edit. Reduces complexity and avoids permission edge cases.

---

### 3.5 Edge cases

| Case | Handling |
|------|----------|
| Event deleted in Google | PATCH returns 404; show "Event no longer exists" |
| Event is recurring | PATCH updates the instance if we have the event ID; recurring instances have unique IDs |
| All-day event | `start.date` / `end.date`; frontend shows date picker |
| Meet link | Read-only in v1; we show "Join meeting" but don't create Meet links |
| Rate limits | Google Calendar API has quotas; batch edits if needed later |

---

### 3.6 Implementation order

1. **Backend**
   - `GoogleCalendarService.getEvent`
   - `GoogleCalendarService.patchEvent`
   - `getUserGoogleEvent` controller
   - `patchUserGoogleEvent` controller + validation
   - Routes

2. **Frontend**
   - Add "Edit" state to Google Event modal
   - Fetch full event on Edit click
   - Edit form (summary, description, location, start, end)
   - Save → PATCH → refresh grid
   - "Join meeting" button when `meetLink` exists

3. **Testing**
   - Unit: service methods
   - Integration: controller + route
   - E2E: open event → edit → save → verify in grid

---

## 4. Out of scope (future)

- Creating Meet links from the modal (would require `conferenceDataVersion: 1` and `conferenceData.createRequest`)
- Editing attendees
- Recurrence rules
- Supervisor editing supervisee's events
- All-day event handling (can add once basic flow works)

---

## 5. References

- `backend/src/services/googleCalendar.service.js` — listEvents, upsertSupervisionSession (patch pattern)
- `backend/src/controllers/user.controller.js` — getUserScheduleSummary, sanitizeGoogleEventForSchedule
- `frontend/src/components/schedule/ScheduleAvailabilityGrid.vue` — Google Event modal, openGoogleEventModal
- [Google Calendar API: events.patch](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch)
- [Google Calendar API: events.get](https://developers.google.com/workspace/calendar/api/v3/reference/events/get)

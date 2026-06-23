# Provider-First Lobby Kiosk

A public-facing lobby kiosk surface that greets clients by showing all providers working at the location today, lets them check in to their appointment, and gives providers tools to manage questionnaires and view results over time.

---

## Overview

The kiosk runs at `/kiosk-welcome/:locationId` — a public URL requiring no login, bookmarked on lobby tablets. It auto-refreshes every 60 seconds and never shows client names or identifying information at any point.

---

## Architecture

```
/kiosk-welcome/:locationId            ← KioskWelcomeView.vue (new public splash)
   ├── KioskProviderCard.vue          ← provider grid card (photo, credential, office)
   ├── KioskCheckInFlow.vue           ← modal wizard: slot → confirm → questionnaire → done
   └── KioskOfficeAvailability.vue    ← modal: available rooms + PIN reservation

/:organizationSlug/provider/kiosk-questionnaires
   └── ProviderKioskQuestionnairesView.vue
         ├── Rules tab                ← create/delete slot questionnaire rules
         └── Results tab              → KioskQuestionnaireResults.vue (day×hour heatmap)
```

---

## Public Kiosk Flow

### 1. Splash Screen
`GET /api/kiosk/:locationId/providers-today`

Returns all providers with `BOOKED` office events for today at this location:
- **active_now** — at least one event spans the current moment → shown first
- **upcoming** — has future events today → sorted by next slot time
- **done** — all events ended → omitted from display

Each card shows: profile photo, name, credential (LCSW/LMFT/LPC…), and current office number. The screen also has an **Office Availability** sidebar panel.

### 2. Client Check-In
1. Client taps a provider card
2. Modal shows that provider's time slots for today (`GET .../providers/:id/slots-today`) — no client names shown
3. Client taps their appointment time → confirmation screen
4. `POST /api/kiosk/:locationId/checkin` fires → in-app notification sent to provider; SMS sent if provider has `surveys_client_checked_in` enabled
5. If the slot has questionnaire rules, they are presented one at a time
6. "You're checked in!" thank-you screen with provider's first name

### 3. Office Availability + PIN Reservation
1. Client/provider taps **View Office Availability** on the sidebar
2. Available rooms shown (rooms with no `BOOKED` event right now)
3. Tap a room → enter 4-digit kiosk PIN
4. `POST /api/kiosk/:locationId/reserve-by-pin` — identifies user via `user_preferences.kiosk_pin_hash` → creates a `BOOKED` `office_event` for the rest of the day

---

## Questionnaire System

### Rule Priority (updated)
1. **Provider-specific rules** — `office_slot_questionnaire_rules.provider_id = booked_provider_id`
2. **Room/day/hour rules** — `provider_id IS NULL` (existing behavior)
3. **Office-wide modules** — `office_questionnaire_modules` fallback

### Tracking
Responses are stored in `office_questionnaire_responses` linked to `office_events`. Day-of-week and hour are derived at query time via `DAYOFWEEK(e.start_at)` and `HOUR(e.start_at)` — no new columns needed.

### Provider Management (`/provider/kiosk-questionnaires`)
- **Rules tab**: Create questionnaire rules that fire for the provider's slots specifically. Choose a training module or intake form, optionally restrict to a day and hour range.
- **Results tab**: Day × Hour heatmap showing response volume over all history. Individual response list with answers. "Tag to client" button privately links a response to a client on their caseload — this tag is never returned by any public kiosk endpoint.

---

## Database Migrations

| File | Change |
|------|--------|
| `871_slot_questionnaire_rules_provider_id.sql` | Add `provider_id` (nullable FK to `users`) on `office_slot_questionnaire_rules` |
| `872_questionnaire_responses_client_tag.sql` | Add `client_id` (nullable FK to `clients`) on `office_questionnaire_responses` — provider-only, never public |

---

## New API Endpoints

### Public (no auth)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/kiosk/:locationId/providers-today` | Providers with BOOKED events today, sorted active-now → upcoming |
| `GET` | `/kiosk/:locationId/providers/:providerId/slots-today` | That provider's time slots today (no client info) |
| `GET` | `/kiosk/:locationId/available-rooms` | Rooms with no current BOOKED event |
| `POST` | `/kiosk/:locationId/reserve-by-pin` | Identify by PIN, create BOOKED event for rest of day |

### Authenticated (provider JWT)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/kiosk/questionnaire-rules` | List provider's slot questionnaire rules |
| `POST` | `/kiosk/questionnaire-rules` | Create a new rule |
| `DELETE` | `/kiosk/questionnaire-rules/:ruleId` | Delete a rule (own rules only) |
| `GET` | `/kiosk/questionnaire-responses` | List/heatmap of responses (`?view=list\|heatmap`) |
| `PATCH` | `/kiosk/questionnaire-responses/:responseId/tag-client` | Tag a response to a client |

---

## Security Notes

- The `client_id` column on `office_questionnaire_responses` is **never returned** by any public kiosk endpoint. It is only accessible via the authenticated `GET /kiosk/questionnaire-responses` route (scoped to `req.user.id`).
- `listProviderQuestResponses` returns `is_client_tagged` (boolean), not the `client_id` value itself, in the list view.
- All public kiosk endpoints return zero client-identifying information. Provider slots show time + room only.

---

## Files Changed/Created

### Database
- `database/migrations/871_slot_questionnaire_rules_provider_id.sql`
- `database/migrations/872_questionnaire_responses_client_tag.sql`

### Backend
- `backend/src/models/OfficeSlotQuestionnaireRule.model.js` — updated `findForEvent` with provider-priority two-tier lookup
- `backend/src/controllers/kiosk.controller.js` — 9 new exported functions
- `backend/src/routes/kiosk.routes.js` — 9 new route registrations

### Frontend
- `frontend/src/views/KioskWelcomeView.vue` *(new)*
- `frontend/src/components/kiosk/KioskProviderCard.vue` *(new)*
- `frontend/src/components/kiosk/KioskCheckInFlow.vue` *(new)*
- `frontend/src/components/kiosk/KioskOfficeAvailability.vue` *(new)*
- `frontend/src/components/kiosk/KioskQuestionnaireResults.vue` *(new)*
- `frontend/src/views/provider/ProviderKioskQuestionnairesView.vue` *(new)*
- `frontend/src/router/index.js` — 2 new routes added

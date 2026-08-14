# Timezone contract

## One rule

1. **Storage:** Business instants (`starts_at`, `end_at`, `punched_at`, session datetimes) are **UTC** in MySQL `DATETIME` columns. The pool uses `timezone: '+00:00'`.
2. **Meaning of wall time:** “3:00 PM at Twain” means convert with the event/office IANA zone (`America/Denver`, etc.) via `zonedWallTimeToUtc` / `wallMysqlToUtcMysql` on write, and format with that same zone on read.
3. **Display/edit:** Always pass an explicit `timeZone` to `Intl` / helpers. Never use bare `toLocaleString()` or `new Date("YYYY-MM-DD HH:MM:SS")` for business times.
4. **Google Calendar:** Convert UTC storage → wall via `utcToRfc3339Wall` and send with a `timeZone` field. Do not assume a naked DATETIME string is already local.
5. **Shared helpers:** Prefer [`backend/src/utils/zonedWallTime.util.js`](../backend/src/utils/zonedWallTime.util.js) (`clientScheduleInstantToUtcMysql`, `scheduleInstantToWallMysql`), [`backend/src/utils/officeEventDateTime.util.js`](../backend/src/utils/officeEventDateTime.util.js), [`frontend/src/utils/timezones.js`](../frontend/src/utils/timezones.js), and [`frontend/src/utils/scheduleEventInstants.js`](../frontend/src/utils/scheduleEventInstants.js) (`parseScheduleUtcInstant`, `buildScheduleWritePayload`). Do not duplicate offset math in controllers.
6. **API schedule payloads:** Emit ISO-8601 with `Z` for timed events (`utcMysqlToIso` / `toIsoUtcForSchedule`). **Write** with wall + `timeZone` via `buildScheduleWritePayload` (frontend) and `clientScheduleInstantToUtcMysql` (backend). ISO-Z writes are accepted but must not be re-projected through `timeZone`.

## Domains

| Domain | Storage | Display zone source | Marker / migration |
|--------|---------|---------------------|--------------------|
| Office schedule (`office_events`) | UTC | `office_locations.timezone` | `events_stored_utc=1` / `1065` |
| Office booking requests | UTC | office TZ | same as office |
| Company / Skill Builders events | UTC | `company_events.timezone` | — |
| Company event session dates | UTC + `session_date` | event `timezone` | — |
| Supervision sessions | UTC | `agencies.timezone` (request `timeZone`) | `supervision_times_stored_utc` / `1097` |
| Supervision signup close | UTC | agency TZ | same |
| Provider schedule events (all timed kinds) | UTC | office / agency / `event_timezone` / request TZ | `schedule_events_stored_utc` / `1098`; TEAM_MEETING/HUDDLE also `1216` |
| Fall check-in slots & bookings | UTC | school / office TZ | `1098` |
| Unified appointments | UTC | agency / office TZ | `1099` |
| Discovery booked times | UTC | agency TZ | `1099` |
| Planned outs | UTC | agency TZ | `1099` |
| Appointment reminders `scheduled_for` | UTC | — | `1099` |
| Virtual / in-person slot availability | UTC (copied from office) | office TZ | treat as UTC (no wall re-convert) |
| Learning / clinical scheduled from office | UTC | office TZ | do not double-convert |
| Kiosk punches / payroll event time | UTC (ISO in payloads) | event `timezone` | — |
| Hiring `interview_starts_at` | UTC | `interview_timezone` | — |
| Public appointment requests | UTC | agency TZ | — |
| Meeting attendance segments | UTC | — | writers use UTC |
| Supervision attendance `event_at` | UTC | — | writers use UTC |
| Audit `created_at` | UTC / server default | browser-local OK | — |

## Intentional wall-of-day exceptions (`TIME` / DATE, not instants)

These are **not** converted to UTC:

- `soft_schedule_slots`, `school_provider_schedule_entries`, `user_work_schedule_blocks` (`TIME`)
- Program shift slot `TIME` + `slot_date`
- Company-event *display* times (`client_check_in_display_time`, etc.) — event `starts_at`/`ends_at` remain UTC
- Payroll `claim_date` (calendar day in event TZ)

## Deploy order

1. Run migrations `1097`–`1099` (and `1065` if office not yet migrated).
2. If MySQL `CONVERT_TZ` returns NULL, run the matching Node fallback scripts under `backend/src/scripts/migrate-*-to-utc.mjs`.
3. Confirm markers = 1 before relying on UTC-only writers in production.
4. **Do not re-run** convert scripts after markers are set — that would double-shift.

## Forbidden patterns

```js
// BAD — treats naive string as browser/server local or UTC ambiguously
new Date('2026-07-20 15:00:00')
claimDate = tOut.toISOString().slice(0, 10) // UTC day, not event day
d.toLocaleString() // no timeZone
wallMySqlToUtcDateTime(officeEvent.start_at) // after 1065: double-shift
```

```js
// GOOD
import { wallMysqlToUtcMysql, utcMysqlToIso, utcDateToZonedYmd, toUtcIso } from '../utils/zonedWallTime.util.js';
const utcMysql = wallMysqlToUtcMysql('2026-07-20 15:00:00', 'America/Denver');
const apiIso = utcMysqlToIso(utcMysql);
const claimDate = utcDateToZonedYmd(tOut, eventTimezone);
const clockOutAt = toUtcIso(tOut);
```

# Timezone contract

## One rule

1. **Storage:** Business instants (`starts_at`, `end_at`, `punched_at`, session datetimes) are **UTC** in MySQL `DATETIME` columns. The pool uses `timezone: '+00:00'`.
2. **Meaning of wall time:** “3:00 PM at Twain” means convert with the event/office IANA zone (`America/Denver`, etc.) via `zonedWallTimeToUtc` on write, and format with that same zone on read.
3. **Display/edit:** Always pass an explicit `timeZone` to `Intl` / helpers. Never use bare `toLocaleString()` or `new Date("YYYY-MM-DD HH:MM:SS")` for business times.
4. **Google Calendar:** Send wall clock **or** UTC ISO together with a `timeZone` field for the building/event. Do not assume a naked DATETIME string is already local without conversion.
5. **Shared helpers:** Prefer [`backend/src/utils/zonedWallTime.util.js`](../backend/src/utils/zonedWallTime.util.js) and [`frontend/src/utils/timezones.js`](../frontend/src/utils/timezones.js). Do not duplicate offset math in controllers.

## Domains

| Domain | Storage | Display zone source |
|--------|---------|---------------------|
| Office schedule (`office_events`) | UTC (migration `1065` / `migrate-office-events-to-utc.mjs`) | `office_locations.timezone` (`events_stored_utc=1`) |
| Company / Skill Builders events | UTC | `company_events.timezone` |
| Session rows | UTC + `session_date` (calendar day in event TZ) | event `timezone` |
| Kiosk punches / payroll event time | UTC (ISO in payloads) | event `timezone` |
| Audit `created_at` | UTC / server default | browser-local OK |

## Office migration deploy order

1. Run `database/migrations/1065_office_events_wall_to_utc.sql` (or `node backend/src/scripts/migrate-office-events-to-utc.mjs` if `CONVERT_TZ` is NULL).
2. Confirm `office_locations.events_stored_utc = 1` before relying on new writers in production.
3. Do not re-run the Node script after marking — it would double-shift.

## Forbidden patterns

```js
// BAD — treats naive string as browser/server local or UTC ambiguously
new Date('2026-07-20 15:00:00')
claimDate = tOut.toISOString().slice(0, 10) // UTC day, not event day
d.toLocaleString() // no timeZone
```

```js
// GOOD
import { zonedWallTimeToUtc, utcDateToZonedYmd, toUtcIso } from '../utils/zonedWallTime.util.js';
const utc = zonedWallTimeToUtc({ year, month, day, hour, minute, timeZone: 'America/Denver' });
const claimDate = utcDateToZonedYmd(tOut, eventTimezone);
const clockOutAt = toUtcIso(tOut);
```

# Scheduling timezone audit — November 18, 2026

Status: fixes implemented and validated for release. Deployment verification is recorded in the release receipt; production-record verification is separate and remains outstanding. This audit used source code and synthetic fixtures; it did not read or change live appointments, acquire application sessions, or impersonate a user.

## Findings and corrections

| Area | Finding | Correction |
| --- | --- | --- |
| Calendar week queries | UTC midnight cutoffs can omit the end of a Mountain-time week or the beginning of an eastern-zone week. | `scheduleWeekWindow` converts both local midnight boundaries independently, including 167/169-hour DST weeks. Main calendars, peers, and participant-conflict requests send their displayed IANA timezone. |
| All-day entries | Deriving DATE limits from the UTC timed window shifts date boundaries in zones ahead of UTC. | Provider-calendar queries accept separate calendar-date boundaries for all-day rows. |
| Supervision | Create/edit paths could strip an explicit UTC/offset suffix, then convert it as local time again. | Both paths use `clientScheduleInstantToUtcMysql`. Omitted edit fields retain their saved instants. |
| Past-session confirmation | A local input could be compared to now using the browser timezone, incorrectly treating a future session as past. | The confirmation converts the input with the displayed calendar timezone. |
| Recurring timed provider events | Whole-series moves copied UTC clocks, shifting local hours or weekdays across DST. | Moves use local calendar-date deltas and convert each occurrence independently. Clinical, meeting, huddle, personal, hold, indirect, and outreach calendar entries retain the shared UTC contract. |
| Absolute appointment inputs | Converting an explicit first occurrence to wall digits discarded its chosen offset during the repeated autumn hour. | One-time and first recurring occurrences retain absolute inputs. Valid sessions spanning the rollback are accepted. |
| Invalid local inputs | Nonexistent spring-forward times and invalid dates could normalize into different times. | The shared timed-input converter round-trips wall digits, rejects nonexistent times and invalid zones, and preserves Date/ISO instants. Appointment, supervision, office request, availability, and move entry points use the converter. |
| Calendar overlays | Peer details, external-event details, and availability highlighting compared UTC instants directly to layout coordinates. | They project instants into the displayed calendar timezone before comparing cell coordinates. |
| Calendar refresh | A delayed response for an older week could replace the newly selected calendar, including after selecting a cached week. | Loads have a generation guard; cache keys include timezone. Confirmed newly saved appointments remain visible through a delayed refresh. |
| Public availability | A duplicated timezone converter mishandled ICU's midnight `24:00` output. | The public calculator uses the shared converter, including its midnight handling. |
| Company/program events | Default weekdays and next-occurrence clocks used UTC; recurrence previews and exports could drift across DST. Old series could exhaust a search starting at their original year. | Materialization, next-occurrence lookup, Google links, and ICS use the event's local calendar. Searches begin near the current date. Exports honor the finite program window; recurring ICS includes timezone observances. |
| Existing program sessions | Rematerialization could delete historical or linked rows while correcting recurrence dates. | Historical rows and rows with staffing, requests, groups, or client groups are protected. A protected future mismatch prevents insertion of a competing corrected series until reviewed. |
| Subscriptions/Google mirrors | Naked stored DATETIME values could be interpreted in the server timezone when publishing or deduplicating events. | Calendar publication and work-calendar projections normalize stored UTC values explicitly. Clinical encounter duration and supervision duration calculations also parse stored instants as UTC. |
| Saved virtual appointment visibility | A canonical booking could exist while its optional calendar facet was missing; the UI also switched back into an editor after saving. | A scoped canonical-appointment fallback keeps it on the calendar. The booking flow stays on a saved confirmation; Done closes it, room retries reuse saved appointment IDs, and uncertain saves block blind rebooking. |
| Clinical video room selection | A reusable personal-room choice remained available for counseling. | Clinical virtual writes enforce `unique_session`; the UI links an appointment-specific office clinical room for every occurrence. Learning/tutoring retains its separate policy. Video and Google-link failures are reported separately from appointment-save success. |

## Scheduling and role coverage

| Scheduling family | Reviewed boundaries and regression coverage |
| --- | --- |
| Individual/group clinical bookings, virtual and in person | Wall + IANA writes, absolute inputs, canonical/calendar identity, recurrence and one-off moves, room reuse/request paths, saved confirmation and recovery. |
| Provider calendar: personal events, holds, indirect services, team meetings, huddles, outreach | Common timed write/read contract, metadata edits, all-day dates, recurrence and Google synchronization. |
| Supervision | Authorized host creation across provider/admin/support/staff/provider-plus/clinical-practice-assistant fixtures; cohost and attendee authorization; create/edit instants; recurrence; notices and Google copies. |
| Offices | Office-zone writes, room-availability windows, single/series moves, existing reservations, request/approval behavior. |
| Company events and programs | Local weekday/month-day recurrence, DST, next occurrence, finite event boundaries, ICS/Google export, protection of linked occurrences. |
| Public scheduling and hiring | Public availability and midnight boundaries; absolute versus wall-clock interview inputs. |
| School schedules and work hours | DATE/TIME values remain local templates; calendar projection creates UTC instants for each applicable date. School soft-calendar and provider-update regressions cover placement and writes. |
| Planned outs | Stored instants remain UTC. Personal forms use the submitter's timezone with an agency fallback. List labels intentionally use the viewer's timezone and show its abbreviation; all-day dates retain date-only semantics. |
| Scheduling roles | Frontend booking fixtures exercise provider self-booking and admin, support, staff, provider-plus, and clinical-practice-assistant booking for a different provider. Backend tests cover authorized clinical editing and deny other providers/out-of-agency users. Existing invitation/cohost restrictions remain exercised. |

Synthetic role fixtures test application behavior; they do not grant or use live application identities.

## Validation

Validation passed: 154 backend checks, 111 frontend checks, and 8 pure input/interview checks in each of four timezones (1,092 executions). An additional 59 backend reschedule/privacy checks and 33 frontend session-change checks passed.

The backend audit suite, frontend audit suite, and pure input/interview checks run under `TZ=UTC`, `America/Denver`, `America/New_York`, and `Pacific/Auckland`. `.github/workflows/scheduling-regressions.yml` runs this matrix for future scheduling changes.

```sh
SKIP_DB_CONNECT=1 NODE_ENV=test TZ=UTC node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.scheduling-timezone-audit.config.js
SKIP_DB_CONNECT=1 NODE_ENV=test TZ=UTC node frontend/node_modules/vitest/vitest.mjs run --config frontend/vitest.scheduling-timezone-audit.config.js
SKIP_DB_CONNECT=1 NODE_ENV=test TZ=UTC node --test --test-force-exit backend/src/utils/__tests__/scheduleInstantWrite.util.test.js backend/src/services/__tests__/hiringInterviewSchedule.timezone.test.js
```

Repeat with each timezone above. Additional reschedule, office-move, privacy, and session-change suites and Vue compilation validate the connected flows. No dependency installation, full frontend build, or extra checkout is required for these checks.

## Operational limits

This is a code-path audit, not proof that every existing production appointment has the intended time. A timestamp alone cannot establish a user's intended local hour if both linked records were previously shifted together. Existing production rows and migration markers must be reviewed through an authorized access path before planning any data correction.

A production verification should compare canonical appointments with their calendar, office, and clinical-session links; check valid source timezones and migration markers; identify missing facets, mismatched windows, duplicate bookings, and protected program-session discrepancies; and sample the affected local times around midnight, week boundaries, and both DST transitions. Preserve the original audit events and evidence. Do not bulk shift records or rerun completed UTC-conversion migrations.

Calendar format references: [Google Calendar event timezone and recurrence fields](https://developers.google.com/workspace/calendar/api/v3/reference/events), [RFC 5545 timezone components](https://www.rfc-editor.org/rfc/rfc5545#section-3.6.5). Repository contract: [TIMEZONE_CONTRACT.md](TIMEZONE_CONTRACT.md).

## Release integration validation

The release integrates these fixes with the newer scheduling changes on main, retaining indexed calendar queries, archive visibility, background Google refresh, group cancellation controls, Google phone instructions, and the authorized external-meeting policy for learning sessions. Counseling always uses its appointment-specific office room.

On that combined source, the audit matrix passes 180 backend and 143 frontend checks in each of four timezones. The existing scheduling integrity suite passes 231 checks; rescheduling, privacy, and external-meeting regressions pass 66 backend checks and 38 frontend checks. The production Vite build passes with the same 8 GiB Node heap setting used by the deployment Dockerfile. Dependencies were reused rather than copied.

The final integration includes the owned-office booking path: preserved UTC first occurrences are normalized as instants rather than wall-converted again, and local reservation dates are derived in the office timezone. Its booking, conflict, retry, and notice cases are part of the four-zone matrix. Messaging regressions pass 680 checks (8 optional integration skips), and public sign-in/navigation fixtures pass 122 checks. The MySQL scheduling fixture includes the production recurrence and billing-link columns used when detaching or reusing a room.

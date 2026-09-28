# Provider availability audit — September 28, 2026

## Operating model

1. A room assignment or reservation controls use of a physical room. `BOOKED` historically also represents time held while the clinical appointment lives in another EHR. It does not, by itself, identify an app client appointment.
2. Published provider hours express willingness to accept a new or current client, with a format and optional office association.
3. A bookable opening is published capacity after subtracting actual appointments, school commitments, external calendar busy intervals, and pending intake selections/requests. Publishing must never erase these conflicts.
4. Book Session creates a client appointment and its clinical, reminder, and billing context. A published opening must not create a draft appointment or claim.

## Verified discrepancy

Read-only checks of ITSCO's live records found:

- Jacquelyne Fernandez has published weekly Thursday 07:00–08:00 hours. Three overlapping room records on October 1, 8, and 15 are `BOOKED` / `ASSIGNED_BOOKED`, with no linked app appointments. The old public calculation treats each reservation as a clinical conflict. October 22 is the first week without that reservation, explaining the screenshot exactly.
- Oneisha Peres has published Thursday 09:00–10:00 hours and no equivalent reservation conflict.
- The revised calculation, using the existing records and external calendar checks, returns October 1 at 07:00 Mountain for Jacque and October 1 at 09:00 Mountain for Oneisha. No provider schedules were modified for this audit.
- Jacque's other recurring hours overlap school assignments, so they are still excluded from public openings.

## Changes

- Admin, support, superadmin, and CPA/provider-plus can publish or edit hours for a selected provider. APIs verify both actor and target tenant membership; supervisors remain limited to their assigned supervisees.
- Empty admin schedule cells now expose Open Slot for Booking. Saves and drag edits target the selected provider, not `/me`. Multiple selected cells can publish weekly virtual hours on their behalf.
- Office reservations can explicitly publish virtual, in-person, or both formats, preserving office metadata. New-client and current-client audiences are separate. The office action applies to the selected reservation occurrences.
- Already published weekly virtual hours can use an unbound reserved office interval. Reservations without a matching publication do not independently advertise virtual availability.
- Client, clinical-session, billing-context, and appointment links protect occupied office slots. Actual app appointments independently block public openings even without Google synchronization.
- Office-link failures are surfaced rather than swallowed. Office requests on behalf of another provider use that provider's identity.
- Raw recurring calendar tiles say Published; their tooltip explains why the public page may exclude a time. The public calculation, rather than the presence of a teal tile, determines the next opening.
- Open-slot publishing no longer fabricates a draft client appointment.
- Existing Book Session, clinical note, claim-readiness, and billing authorization remain the booking/claim path. Publishing availability does not grant financial permissions or create billable services.

## Recommended next refinements

- Show a staff-only explanation on every excluded publication (school assignment, appointment, external busy, or intake hold), using the same interval calculation as the public page.
- Rename the legacy room `BOOKED` state in the interface to distinguish a reserved room from a client appointment; preserve the existing data during the transition.
- Make external-calendar health visible to staff. Existing calendar failures can currently fall back to an empty busy list; the team should know when a feed is unavailable.
- Consolidate all native meeting, supervision, all-day leave, and appointment conflicts into one availability projection so non-SSO staff do not depend on Google as an intermediary.

## Validation and rollout

- Scheduling regression suite, including selected-provider permissions, unbound versus client-bound reservations, app appointment conflicts, and office-tagged virtual results.
- Isolated MySQL verification of room conflicts and migration 1500, including current-client-only publications being excluded from new-client results.
- Frontend format-selection tests and production build.
- Migration 1500 adds audience flags to in-person publications and preserves existing publications as intake-enabled. Apply before deploying the API change.

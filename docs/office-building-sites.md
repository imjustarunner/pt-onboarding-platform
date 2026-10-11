# Office building sites

AuricWell Office is the office and kiosk add-on to AuricWell. The public kiosk combines provider-and-time check-in with a separate room directory. It does not require a staff login. Use a dedicated lobby browser profile, signed out of staff accounts. The mountain/skyline artwork and each building's identity remain part of the experience.

## App records are authoritative

The app manages physical buildings (`office_locations`), their rooms/spaces (`office_rooms`), organization affiliations, recurring assignments, booking plans and dated bookings (`office_events`). Appointments bind through `appointments.office_event_id`; clinical sessions and billing contexts remain attached to their authorized records. The kiosk reads the app's schedule. It does not fetch Google Calendar or require a Google room resource, domain or staff Google account. Google calendar synchronization is an optional downstream integration.

Booking ownership comes from the linked appointment/client agency, saved booking context, or recurring assignment agency—in that order. A provider belonging to both ITSCO and NLU appears under the agency that owns each booking. Today’s provider times remain separated by agency, and the same ownership determines new arrival notifications and feedback receipts. Explicit ownership never falls back to an unrelated agency; only older records without ownership use the first active affiliated membership, preferring the building owner.

Only active, non-archived staff who see clients appear in client check-in. A staff-only office reservation is still visible in the directory. Actual appointment windows control check-in when a client/session is linked; unlinked office allocations retain the existing hourly windows. Client names, notes, responses and claim data are never displayed in the public directory.

| Physical building | Working bookmark now | Prepared hostname (pending DNS/LB) |
| --- | --- | --- |
| Windchime, physical location 1 | https://plottwisthq.com/kiosk-welcome/1 | https://437.plottwisthq.com/ |
| Denver, physical location 6 | https://plottwisthq.com/kiosk-welcome/6 | https://office1.plottwisthq.com/ |

`office1` is a building alias, not database location 1. Future office2–office10 sites are planning only. Add the real location/hostname mapping to `frontend/src/utils/officeSite.js`, add its manifest under `frontend/public/office`, and redeploy when that building is ready. Numeric building labels and room numbers sort naturally (1, 2, …, 10). Existing Windchime room numbers are preserved, including gaps and rooms above 10.

## Load balancer handoff

For each prepared hostname:

1. Point DNS at the existing HTTPS load balancer and include the hostname in its TLS certificate.
2. Use the existing frontend/backend routing pattern: `/api/*` to `onboarding-backend`, all other paths to `onboarding-frontend`. Uploaded images use `/api/uploads/*`.
3. Verify the root opens Office directly, `/api/kiosk/<physical-location-id>/office-directory` returns JSON, and a check-in saves the provider inbox notification. Use a deliberately arranged test appointment for the check-in, since it sends a real alert and may send optional email.

The release prepares app routing, HTML, manifests and icons; it does not change DNS, certificates, load balancer configuration, or the unrelated FCC/Auricwell/SchoolCareBridge hosts.

## Directory behavior

Only Office directory shows rooms and their availability at the selected office-local time: green for available, red for booked or held. Provider cards, daily provider times and check-in steps omit room numbers and names. Arrival instructions ask clients to wait in the lobby. Availability represents scheduled occupancy, not physical presence detection. The directory shows booked provider, assigned provider, existing profile photos and the booking/assignment agency's logo; a known agency's bundled brand mark is used when no uploaded logo is configured. Names belong to providers only. No client names, IDs, notes or event titles are returned by the directory endpoint.

Tap a room for its day schedule. Date/time controls and next/previous day retain the selected room. Now resumes the live view, refreshed each minute. A failed refresh clears stale availability colors. Existing recurring assignments and booking plans are projected for future dates without creating or changing database rows. Explicit bookings, releases and cancellations take precedence over recurring defaults.

An assignment and a booking are separate. Assigned but unbooked time is green and identifies the assigned provider. Current booking semantics remain based on existing office bookings; client-linked sessions/claims are not yet a requirement for a red booking. Adopting that requirement is a future scheduling change, initially for Inner Strength. Archived-provider names remain visible on their existing schedule entries; those entries need staff review if obsolete. Archived providers cannot receive a new public check-in through the provider picker.

## iPad home screen

Open either current bookmark in Safari and use Add to Home Screen. Browser and Apple install metadata use **AuricWell Office**; the manifest's compact label remains **Office**, with the office-building icon. Each building's manifest starts at its own check-in URL. Once the dedicated hostname is live, a shortcut saved from it stays on that hostname. Existing saved shortcuts may need to be removed and added again to pick up the new name.

A public lobby does not need an indefinitely signed-in staff account. iPad screen auto-lock remains a device setting; the web app does not change it.

## Shared physical locations and agency billing

Scheduling and room occupancy belong to one physical building shared by agencies. Billing must preserve each agency's legal/billing name, address, NPI, enrollment and payer configuration, separately from the physical service location. This release does not merge the legacy Windchime billing-location records or alter claims. See `windchime-location-unification.md` for the audited migration plan; do not renumber or delete billing records to make a building alias match.

Apple references: [Add to Home Screen on iPad](https://support.apple.com/guide/ipad/ipad8f1f7a29/ipados), [web application title and touch icon](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html).

Before the Inner Strength pilot, confirm agency 377 is attached to the shared physical Windchime location 1 and that pilot bookings use that physical location. The current read-only audit found its billing location 8, but no Inner Strength membership on physical location 1. Preserve location 8's billing/enrollment references during the planned unification.

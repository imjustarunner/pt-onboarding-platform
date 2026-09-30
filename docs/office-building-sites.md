# Office building sites

The public Office app combines provider-and-time check-in with a room directory. It does not require a staff login. Use a dedicated lobby browser profile, signed out of staff accounts.

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

Both lobby tabs show room availability at the selected office-local time: green for available, red for booked or held. This represents scheduled occupancy, not physical presence detection. The directory shows booked provider, assigned provider, existing profile photos and agency logos; a known agency's bundled brand mark is used when no uploaded logo is configured. Names belong to providers only. No client names, IDs, notes or event titles are returned by the directory endpoint.

Tap a room for its day schedule. Date/time controls and next/previous day retain the selected room. Now resumes the live view, refreshed each minute. A failed refresh clears stale availability colors. Existing recurring assignments and booking plans are projected for future dates without creating or changing database rows. Explicit bookings, releases and cancellations take precedence over recurring defaults.

An assignment and a booking are separate. Assigned but unbooked time is green and identifies the assigned provider. Current booking semantics remain based on existing office bookings; client-linked sessions/claims are not yet a requirement for a red booking. Adopting that requirement is a future scheduling change, initially for Inner Strength. Archived-provider names remain visible on their existing schedule entries; those entries need staff review if obsolete. Archived providers cannot receive a new public check-in through the provider picker.

## iPad home screen

Open either current bookmark in Safari and use Add to Home Screen. The suggested name is **Office**, with the new office-building icon. Each building's manifest starts at its own check-in URL. Once the dedicated hostname is live, a shortcut saved from it stays on that hostname. Existing saved shortcuts may need to be removed and added again to pick up the new icon/name.

A public lobby does not need an indefinitely signed-in staff account. iPad screen auto-lock remains a device setting; the web app does not change it.

## Shared physical locations and agency billing

Scheduling and room occupancy belong to one physical building shared by agencies. Billing must preserve each agency's legal/billing name, address, NPI, enrollment and payer configuration, separately from the physical service location. This release does not merge the legacy Windchime billing-location records or alter claims. See `windchime-location-unification.md` for the audited migration plan; do not renumber or delete billing records to make a building alias match.

Apple references: [Add to Home Screen on iPad](https://support.apple.com/guide/ipad/ipad8f1f7a29/ipados), [web application title and touch icon](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html).

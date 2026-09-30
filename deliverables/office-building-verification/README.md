# Office building directory verification — 2026-09-29

Screenshots use synthetic provider/booking fixtures, including an existing Inner Strength brand mark. They are layout previews, not the actual office roster.

- Backend: 33 passing Vitest tests and 6 passing schedule-instant Node tests for directory date/time, office timezone and DST (including production ICU midnight rendered as 24:00), numeric ordering, separate assignment/booking, future recurrence and cancellation, partial-hour coverage, public-data privacy, check-in atomicity, and public-route boundaries.
- Frontend: 59 passing tests covering the kiosk, asynchronous directory navigation, rejection of incomplete/old availability responses during deployment, building hostname mapping, branding, and existing public-domain routing.
- Full production build passed, including the generated building-host HTML and nginx configuration. Existing large-chunk warnings remain.
- Browser checks: desktop 1440px, iPad 820px, phone 390px; expanded room retained across next-day navigation; check-in confirmation; no page JavaScript errors or horizontal overflow. POSTs intercepted; no actual arrivals or provider messages sent.
- Dedicated-host simulation: Windchime root maps to physical office 1; Denver office1 root maps to physical office 6; both keep `/` in the address bar, display title Office, and select their own manifest.
- Read-only database integration: existing Windchime and Denver rooms queried for September 29, September 30 and January 5; provider photos and agency identity resolved. Known agency logo fallbacks render from bundled brand assets because the legacy uploaded-logo fields are empty.
- DNS, certificate and load balancer host rules are still to be configured by the owner. See `docs/office-building-sites.md`.

## Production verification

- Frontend deployment `07cd9790` and backend deployment `ec921bd9` both succeeded. All office changes are on main.
- Signed-out URLs verified: `https://plottwisthq.com/kiosk-welcome/1` and `https://plottwisthq.com/kiosk-welcome/6`.
- September 30 at 2:00 PM office time: Windchime showed 13 numerically sorted rooms with 3 booked; Denver showed its 1 room available. Every returned entry overlapped the requested calendar day, and UI colors matched the API.
- Windchime card images: all 6 provider/agency images loaded. Expanded room photos/logos also finished loading. No page JavaScript errors occurred at either location.
- Both manifests returned `application/manifest+json`, name/short name Office, and the correct building's start URL. Both browser titles were Office.
- Selecting a room and advancing a day retained its detail view. Verification blocked check-in POSTs; no real arrival alerts or emails were sent.
- `live-windchime.png` and `live-denver.png` capture real public provider schedules (no client identities). The other screenshots remain synthetic previews.

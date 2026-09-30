# Office building directory verification — 2026-09-29

Screenshots use synthetic provider/booking fixtures, including an existing Inner Strength brand mark. They are layout previews, not the actual office roster.

- Backend: 28 passing tests for directory date/time, office timezone and DST, numeric ordering, separate assignment/booking, future recurrence and cancellation, partial-hour coverage, public-data privacy, check-in atomicity, and public-route boundaries.
- Frontend: 59 passing tests covering the kiosk, asynchronous directory navigation, rejection of incomplete/old availability responses during deployment, building hostname mapping, branding, and existing public-domain routing.
- Full production build passed, including the generated building-host HTML and nginx configuration. Existing large-chunk warnings remain.
- Browser checks: desktop 1440px, iPad 820px, phone 390px; expanded room retained across next-day navigation; check-in confirmation; no page JavaScript errors or horizontal overflow. POSTs intercepted; no actual arrivals or provider messages sent.
- Dedicated-host simulation: Windchime root maps to physical office 1; Denver office1 root maps to physical office 6; both keep `/` in the address bar, display title Office, and select their own manifest.
- Read-only database integration: existing Windchime and Denver rooms queried for September 29, September 30 and January 5; provider photos and agency identity resolved. Known agency logo fallbacks render from bundled brand assets because the legacy uploaded-logo fields are empty.
- DNS, certificate and load balancer host rules are still to be configured by the owner. See `docs/office-building-sites.md`.

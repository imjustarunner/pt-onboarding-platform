# Office kiosk overhaul

The lobby is available at `/kiosk-welcome/:locationId` and existing `/kiosk/:locationId` links. Authenticated lobby stations also open this provider-first screen when office check-in is enabled. Staff-only stations retain their configured mode; mixed stations have an Other kiosk options button.

Visitors choose a provider, choose a scheduled appointment time, and confirm arrival. No client name, initials, ID, appointment title, attendance badge, questionnaire, or treatment details appear in this flow. The office directory shows provider assignments and room numbers for today. Both lists refresh every minute and show refresh failures. Success resets after 12 seconds; abandoned selections reset after 90 seconds. Times use the office timezone regardless of the tablet’s timezone.

Check-in locks the booked event and saves the arrival and personal provider notification in one database transaction. Repeat submissions reuse the arrival and notification. Canceled, moved-provider, wrong-location, inactive-provider, and other-day appointments cannot be checked into through this endpoint. Optional outbound channel failures do not undo the inbox alert.

In notification settings, the type is **Client arrival at office** (`kiosk_checkin`). Provider defaults now include this type with toast and sound; existing user preferences and agency notification policies still apply. Enable its Email option to request email as well. Email requires an active agency notifications/system sender identity and a provider email address; existing email delivery/approval policies apply. Email sends only the appointment time, office, and arrival message. No real messages were sent during verification.

No new database migration is required. The existing office scheduling, office check-in, and notification tables must already be installed. This change has been implemented locally, not deployed. Live database behavior and real email delivery have not been exercised.

## Verification

- 9 backend service tests: atomic rollback, repeat submissions, office-local date/time, stale or invalid appointments, optional email delivery and failure.
- 8 frontend tests: private payload, success/error handling, timezone formatting, reset timers, existing public routes, mixed lobby modes, and staff-only stations.
- Browser verification with synthetic data: provider → time → confirmation → success, office directory, 1440px desktop, 768px tablet, and 390px mobile. Browser timezone intentionally differs from the office timezone.
- Vite production build passed with an 8 GB Node heap. The default 4 GB heap was insufficient for this repository. Existing dynamic-import and bundle-size warnings remain.

Run from the repository root:

```sh
node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.office-kiosk.config.js
cd frontend
npm test -- --run src/components/kiosk/__tests__
node --max-old-space-size=8192 node_modules/vite/bin/vite.js build
node scripts/check-office-kiosk.mjs
```

Screenshots contain synthetic provider names: `desktop.png`, `directory.png`, `confirm.png`, `success.png`, `tablet.png`, and `mobile.png`.

# Family Command Center

## Architecture

An optional benefit on existing tenants (`feature_flags.familyCommandCenterEnabled`), with private households inside each tenant. No new tenant is needed. The dedicated host `qv.app.mentalrange.org` opens `/family`; other QV hosts retain their existing routes. `/family` also works locally.

The hostname is an entry point, not the household's tenant. PIN sign-in searches enabled tenants, preferring an existing household over the employee's primary membership. Organization selection is optional. Ambiguous codes require the account email; more than 500 candidate memberships also require email. Signed-in employees can use the **Family** navigation button to open the dedicated host through a single-use, two-minute handoff. The handoff travels in a fragment, is removed immediately, and never grants workplace access.

Existing users are reused. An adult or child can be a pending `users` profile with no workplace role, password or agency membership. These are household identities, not new login accounts. Optionally, adults can connect their own eligible account through an expiring household invitation. Invitation recipients must currently belong to the same sponsoring tenant; cross-tenant and outside-employer family invitations are not implemented.

## Implemented

- Independent responsive dashboard, clock, Up Next countdown, family pulse, swipeable cards, mobile lists, and 30-second refresh.
- Six-digit credential reuse with separate HTTP-only family cookies and hashed server-side device tokens. No application inactivity deadline. Cookies renew on every family request for up to 400 days; browser storage removal or cookie limits can still require signing in again. Sign-out, passcode/token reset, disabled benefits and removed employee membership invalidate access.
- Household creation, adult/child/pet names/photos/colors without separate logins, optional adult account invitations, and per-adult work-sharing consent. Phone photos are resized before upload.
- 341 searchable event types (including 63 U.S. national parks), mapped to 124 matching illustrated backgrounds, a general family fallback, custom background photos, member/color assignment, address/directions, pickup/drop-off, equipment, contacts, notes, and on-screen preparation reminders.
- Family events project into `provider_schedule_events` as private `PERSONAL_EVENT` rows. Child events also appear on parents' schedules. Only generic titles are stored in workplace projections. Editing/removing the family event updates all projections transactionally; workplace editing directs users back to Family Command Center.
- Workplace personal-event display choices: hidden, generic label, or owner-only details. Client sessions remain visible. These are display choices; server scheduling conflict checks remain authoritative.
- Opt-in work overlay from app schedule events, office bookings, supervision and saved weekly work hours. The detail toggle shows work categories and times, without client identity or clinical notes. External Google/ICS calendars and school assignment templates are not yet included.
- Camping stays one event type with five selectable pictures: lakeside tent, green tent, black Tundra with teal rooftop tent on a bed rack, Tundra towing a Coleman trailer, and backyard green tent. The selected picture persists through saving, editing and Google import. Personalized scenes include the Malinois, black Sienna, green-roof chicken coop, Craftsman mower, hiking child carriers, SCHEELS and every requested activity. National parks each have their own generated landscape illustration. Images are loaded on demand, not preloaded as a collection.
- All 30 requested status events appear in the family calendar and update the assigned member during their time interval. Individual manual statuses take precedence over household-wide statuses and inferred event/work status; history remains in storage. See [the complete catalog](family-event-catalog.md).
- Chores use private `tasks` records plus household-specific assignments, categories, daily/weekly recurrence, rotations, approval, and completion history. Household row locks and unique occurrence keys prevent duplicate point awards.
- Rewards, per-member and family balances, explicit parent approvals, reserved points for pending redemptions, and history. Rejected chores may be resubmitted.
- Grocery/shopping/packing lists with shared editing, assignments, categories and completion; meals and announcements.
- Existing weather service, using the signed-in adult's saved home address.
- Private household photo album (50 images, up to 1.3 MB each after client resizing), idle screensaver, slideshow preview, configurable timing, clock/next-event overlay and tap/keyboard return. Photos are served only through household-authenticated endpoints. Other-device album updates refresh every minute while the dashboard is visible outside Settings. The screensaver does not override the device's OS auto-lock configuration.
- AI dinner suggestions through the existing Gemini text service, cuisine/preferences/servings/preparation-time inputs, saved recipes with cuisine filtering, ingredient selection and grocery/shopping list buttons. Recipes and takeout use one server-provided catalog of 23 cuisines (including Italian, Mexican, Thai and Chinese). “Any cuisine” chooses a cuisine before generating a recipe. The takeout random picker selects uniformly from all cuisines or the user’s checked subset; it suggests a cuisine, not a restaurant or order. Provider output is validated before use. Household membership and a 20-ideas/hour/account limit protect generation. Household row locks prevent duplicate ingredient adds; completed or removed ingredients can be added again for another shopping trip.
- Random decision picker with 2–50 distinct choices, server-side uniform selection and reusable household choice lists.
- Direct Home quick actions for groceries, announcements, recipes and photo settings.
- Shared Google Calendar selection and explicit event import, using the existing Google Workspace delegated service account. The connector uses the real account email from the database, verifies calendar access, excludes primary/free-busy-only calendars, and rechecks the connecting adult's benefit and household membership. No automation mailbox or new family Google accounts are required. Choose a household member, event theme and available picture variant before importing. Google recurring events expand to individual occurrences; all-day events use household midnight with DST conversion. Imports and personal schedule projections commit together, with unique Google links preventing duplicate imports even after disconnect/reconnect. Preview covers the next 90 days (up to 1,000 events).

## Remaining integrations and limits

- Google imports are explicit saved copies, not bidirectional synchronization: later Google edits/cancellations do not automatically update imported copies, and family edits do not write back to Google. Personal Gmail OAuth is not implemented; Workspace delegation must be configured for the connecting account. `ai@plottwistco.com` is not impersonated or granted access by this feature.
- Google Home cameras/lights and inbound SMS/email list capture are **not connected**. Google sign-in alone does not connect home devices.
- Reminders appear while the dashboard is open. Background/push/email reminders, separate travel/custom rules, recurring family events, photo chore verification, attachments and pooled household reward redemption need additional implementation.
- Reward balances currently belong to individual members; the household total is a summary.
- Dashboard retrieval is bounded to 1,500 entries and the latest 1,000 activity records. Historical totals are computed from the full ledger. Older events/statuses are retained in storage but a historical timeline/pagination UI is still needed.
- Artwork lives in `frontend/public/assets/family-events/`. Preview all scenes in [the artwork gallery](family-artwork/index.html); [the manifest](family-artwork/manifest.json) records the built-in image-generation prompts, references, original PNG locations and project JPEG paths.
- Wall devices operate under the signed-in adult. Completion and redemption require a separate explicit approval action, but the device does not enforce a second parent PIN for those approvals.

## Rollout

1. Apply `database/migrations/1454_family_command_center.sql` and then `database/migrations/1455_family_home_tools.sql` using the normal migration runner against the intended database. These only add family tables; they do not enable any tenant automatically.
2. Deploy API and frontend together. Route `qv.app.mentalrange.org` and its `/api` requests to these services with HTTPS and the existing origin configuration.
3. Enable **Family Command Center** in the tenant's feature settings (also exposed in platform management).
4. Open the Family navigation button from the employee account, or enter their existing six-digit code at the dedicated host. Create a household and add adult/child/pet profiles; optionally invite adults who want their own account connected.
5. Each adult opts into work sharing in Family Settings. Weather uses their home address from account settings.
6. In Calendar or Settings, connect an existing secondary/shared Google calendar available to that adult. Workspace domain-wide delegation must already support their email. Sharing a calendar with an automation account alone does not connect it to this implementation.
7. Upload family photos in Settings, enable the frame, and configure the mounted device to remain awake as desired. AI recipes use the existing Gemini/Vertex deployment credentials; validate one real request after deployment.

`FAMILY_COMMAND_CENTER_ORIGIN` overrides the handoff destination for staging or a future hostname. When changing the production hostname, update `isFamilyHost` in `frontend/src/utils/familyCommandCenter.js` too. For local handoff testing set the origin to `http://localhost:5173`.

## Verification

```sh
node frontend/node_modules/vitest/vitest.mjs run --config backend/vitest.family.config.js
cd frontend
npm test -- src/utils/__tests__/familyCommandCenter.test.js src/utils/__tests__/publicDomainRouting.test.js
NODE_OPTIONS=--max-old-space-size=12288 npm run build
```

`node backend/scripts/smoke-family-command-center.mjs` exercises the local app with intercepted fixture APIs: desktop/mobile rendering, no workplace navigation, adding a list entry, PIN-only login, reload persistence, no horizontal phone overflow, random choices, recipe selection and ingredient reuse, photo upload/slideshow return, shared calendar import, Camping picture save/reload/edit, mobile artwork choices and national park selection. Requires installed Chrome and the frontend dev server. It writes preview screenshots to `/tmp` and does not write to the database. This is a UI smoke test, not a deployed API/database end-to-end test.

## Current validation status

Production frontend build and focused automated tests passed locally. Browser smoke tests use mocked APIs and do not change live data. Migrations 1454 and 1455 were applied to the configured Cloud SQL database. Read-only household/dashboard checks passed. Pet creation, personal event projections, and recurring chore writes passed in a fully rolled-back MySQL transaction. Google credentials/ACLs, AI generation and physical iPad behavior still require live validation.

## Operator household setup

`backend/scripts/setup-family-household.mjs` enables the sponsoring tenant and links existing active adult accounts as parents. It defaults to a dry run; pass `--apply` after checking its output. It preserves other feature flags and work-sharing preferences, creates no credentials, and refuses to merge multiple existing households.

```sh
NODE_ENV=test node backend/scripts/setup-family-household.mjs --agency SLUG --name 'Family name' --parent parent1@example.com=Dad --parent parent2@example.com=Mom
```

PlotTwistCo was enabled and the two requested existing adult accounts were linked to the Mendez Family household. Both have parent access with family display names Dad and Mom. Family names do not change workplace names. The shared device can add children and pets from Settings without separate accounts or codes.

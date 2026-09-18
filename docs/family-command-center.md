# Family Command Center

## Architecture

An optional benefit on existing tenants (`feature_flags.familyCommandCenterEnabled`), with private households inside each tenant. No new tenant is needed. The dedicated host `qv.app.mentalrange.org` opens `/family`; other QV hosts retain their existing routes. `/family` also works locally.

The hostname is an entry point, not the household's tenant. PIN sign-in searches enabled tenants, preferring an existing household and using agency ID as a stable fallback. Organization selection is optional. Ambiguous codes require the account email; more than 500 candidate memberships also require email. Signed-in employees can use the **Family** navigation button to open the dedicated host through a single-use, two-minute handoff. The handoff travels in a fragment, is removed immediately, and never grants workplace access.

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
- Google Home cameras/lights and inbound SMS list capture are **not connected**. Google sign-in alone does not connect home devices. Family email commands are available through configured app mailboxes (see below).
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
NODE_ENV=test node backend/scripts/check-family-login-schema.mjs
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


## Family lists by email and On the go

Open **On the go** in the family navigation, or **Lists & email** on Home. The compact page shows groceries, shopping, unfinished family chores and the next seven days of family events/statuses. It refreshes every 30 seconds while visible, supports batch additions, copy and native sharing, and can be bookmarked at `/family?view=on-the-go&household=ID`. It requires the usual family sign-in and household membership. To-dos added here are private, nonrecurring family chores assigned to the signed-in parent, with zero points and no approval requirement. This summary does not include unrelated workplace tasks or work events.

Email the configured tenant **app@** mailbox from the primary account email linked to the household. PlotTwistCo uses **app@plottwistco.com**. Michael and Melissa can each request the same household's lists from their own linked accounts. No PIN is sent in email.

| Subject or reply | Result |
| --- | --- |
| `Grocery list` | Unchecked grocery items |
| `To-do list` | Unfinished family chores, including assignments and due dates |
| `Upcoming` | Next seven days of family calendar entries |
| `Family summary` | All of the above plus the shopping list |
| `Add groceries: milk, eggs` | Add items to shared groceries |
| `Add shopping: dog food` | Add to shopping |
| `Add to-do: book the dentist` | Create a private one-time family chore assigned to the sender |
| `Family help` | Command examples |

Items can also go on separate body lines when the subject is `Add groceries` or `Add to-do`. Commas, semicolons and line breaks separate items; quoted email and common signatures are removed. Batches allow 1–30 titles of up to 200 characters. Already-open titles on that list are skipped. Replies contain a timestamp, plain-text and HTML versions, and a signed-in link to the live lists. Email is a snapshot; lists update in the app. For multiple households, prefix the subject with `[Family #ID]`; generated email links do this automatically. The assistant asks which household instead of guessing. Subsequent reply commands override the previous subject.

### Mail delivery and privacy

- Uses the existing Gmail inbound poll (normally every five minutes), `identity_key=app`, active inbound route and `emailAppAssistantEnabled`, plus the employee's Family Command Center benefit and household membership.
- Family processing runs before workplace intents and pending workplace clarification sessions. Private family replies do not enter workplace communication/ticket logs or AI prompts.
- Requires the direct From address and Gmail's first `Authentication-Results` header to report an aligned DMARC pass. Unknown accounts, disabled access, unverified/rewritten senders, and nonmember requests cannot read or change family data. Send directly from the linked account; forwarded messages or group-rewritten From addresses are not accepted. See [Google's authentication guidance](https://support.google.com/mail/answer/180707?hl=en).
- Sends only to the resolved account email, never Reply-To/CC, and only from the active tenant app identity with an accepted Gmail Send-as alias. There is no fallback to `ai@` or another tenant. Auto-reply suppression headers prevent loops.
- These are direct user-requested transactional replies, not scheduled campaigns. They use a private Gmail send path so household content is not persisted in workplace email logs. The app mailbox's identity and feature controls still apply.
- Migration `1457_family_email_requests.sql` tracks request hashes, account/household IDs, timestamps and counts, without email bodies. A database advisory lock serializes a sender across replicas. Batch additions and the applied marker commit together. Failed sends remain unread for a retry; committed additions are not replayed. A crash after Gmail accepts a reply but before its sent marker commits may repeat the confirmation, but not its additions.
- Maximum 20 new commands per account per hour. Summaries read up to 1,500 relevant entries and emails show up to 50 per section with a link for the rest. Approved or pending chore completions are excluded only for their current occurrence; older recurring completions do not hide today's chore.

### Validation for this addition

Focused family tests cover parsing, signatures/replies, sender authentication, authorization, household ambiguity, duplicate/retry handling, transaction failure, recurrence and HTML escaping. Browser smoke covers quick add, email link subjects, bookmarked entry points and desktop/phone layout. A live-schema check ran groceries, private chore creation, summaries and duplicate processing inside a rolled-back transaction with a stubbed sender; no test email was sent. The PlotTwistCo app group includes the automation mailbox and its Gmail Send-as alias was verified as accepted. A real request/reply round trip still needs the user's first test email.

## Calendar connections and private sharing

The Calendar tab now has day/week time grids, date navigation, member colors/photos, all-day rows, overlapping events and a work visibility selector. It reads the requested date window instead of the dashboard's limited upcoming snapshot. A selected incoming Google shared calendar appears live here; importing an event creates a separate editable family copy and suppresses the duplicate Google row. External ICS calendars from a consenting adult's account appear as generic work blocks, without client names. Connection failures are shown rather than silently looking like an empty calendar.

New households attempt to create their own app-managed Google secondary calendar. Existing households use **Calendar → Share our family calendar → Create shared Google calendar**. Linked parents with active accounts receive reader access and, where Workspace delegation permits, a calendar-list subscription. Children and pets remain account-free family identities. A parent can add/remove personal Google-account readers and share the Add to Google Calendar link. Google's Workspace sharing policy may restrict external readers; errors are surfaced. Incoming calendars and outgoing app-managed calendars are separate to prevent sync loops.

Each employee can create a separate calendar per agency from **My account → Calendar connections & sharing**. This does not require SSO. Work exports include app-scheduled events and attendee meetings, supervision, office bookings and weekly work hours. Session labels use the type and client initials, without clinical notes, private titles, full client names or host tokens. External imported EHR calendars remain read-only busy overlays in the family UI; they are not republished to Google. Participant links resolve to the event's agency portal. Existing generic meeting links resolve to that portal before joining.

Both sharing panels can issue a private, revocable ICS subscription URL. Google users add it on the web with **Other calendars → + → From URL**; Apple/Outlook can subscribe too. Calendar apps control their own refresh interval. The feed includes the past 30 days and next 180 days, uses stable UIDs, and rechecks active membership and family entitlement on every fetch. Tokens are random, stored only as hashes, and returned only upon creation/rotation. Family exports default to “Personal event”; parents may explicitly enable event titles, assigned-member names and locations. Work exports always keep limited details. Removing the Google copy does not remove app events or independently issued subscription links.

Migration `1467_calendar_sharing.sql` stores publication settings, explicit readers and Google event fingerprints. The Google owner uses `CALENDAR_PUBLICATION_OWNER`, then the existing Workspace impersonation settings, then `ai@plottwistco.com`. Calendar-only delegation is used. A five-minute scheduler and per-publication MySQL locks handle multiple server replicas. Initial population runs in the background; later syncs update changed events and remove cancelled/deleted entries. Loss of the publishing account's membership/feature access revokes subscriptions and deletes the managed Google copy. Revocation cannot erase copies someone previously downloaded.

Verification: focused tests cover privacy allowlists, tenant URLs, token hashing/revocation, membership removal, ICS dates/escaping/folding, stable Google IDs, retries, cancellation removal, and sync locks. Browser smoke covers day/week navigation and subscription controls alongside existing family features. Mendez family's Google calendar and Michael's PlotTwistCo work calendar were provisioned using existing Workspace delegation; calendar notifications were disabled.
